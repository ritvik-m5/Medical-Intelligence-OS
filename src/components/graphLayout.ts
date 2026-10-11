import type { Entity, EntityKind, HealthGraph } from '../engine/types';
import { seededRandom, seedFrom } from '../engine/ids';

export interface GraphNode {
  id: string;
  label: string;
  kind: EntityKind;
  x: number;
  y: number;
  radius: number;
  factCount: number;
  confidence: number;
}

export interface GraphLink {
  source: number;
  target: number;
  kind: string;
  inferred: boolean;
  weight: number;
}

const KIND_ORDER: EntityKind[] = [
  'person',
  'condition',
  'medication',
  'measurement',
  'vital',
  'procedure',
  'allergy',
  'immunization',
  'symptom',
  'social',
  'demographic',
  'encounter',
];

/** Ring radius per kind — the layout is anatomical: person, problems, therapy, data. */
const KIND_RADIUS: Partial<Record<EntityKind, number>> = {
  person: 0,
  condition: 150,
  medication: 250,
  procedure: 330,
  allergy: 330,
  immunization: 400,
  symptom: 250,
  social: 400,
  demographic: 400,
  measurement: 470,
  vital: 540,
  encounter: 620,
};

export const KIND_COLOR: Record<EntityKind, string> = {
  person: '#e8edf4',
  condition: '#a78bfa',
  medication: '#3ddc97',
  measurement: '#38bdf8',
  vital: '#7dd3fc',
  procedure: '#ffb457',
  allergy: '#ff5c7a',
  immunization: '#5eead4',
  symptom: '#f472b6',
  social: '#94a3b8',
  demographic: '#cbd5e1',
  encounter: '#64748b',
  provider: '#64748b',
  facility: '#64748b',
};

/**
 * Deterministic force layout.
 *
 * Nodes are seeded onto angular sectors by kind and then relaxed with a small
 * repulsion/spring simulation. Seeding makes the result stable across renders (a
 * graph that reshuffles every time you look at it is unreadable), and the sector
 * anchors keep related concepts near each other without a physics engine.
 */
export function computeLayout(
  graph: HealthGraph,
  visibleKinds: Set<EntityKind>,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const entities = graph.entities.filter((e) => e.kind === 'person' || visibleKinds.has(e.kind));
  const nodes: GraphNode[] = [];
  const indexOf = new Map<string, number>();
  const random = seededRandom(seedFrom(entities.map((e) => e.key).join('|')));

  const person = entities.find((e) => e.kind === 'person');
  if (person) {
    indexOf.set(person.id, nodes.length);
    nodes.push({
      id: person.id,
      label: person.label,
      kind: 'person',
      x: 0,
      y: 0,
      radius: 16,
      factCount: 0,
      confidence: 1,
    });
  }

  const byKind = new Map<EntityKind, Entity[]>();
  for (const entity of entities) {
    if (entity.kind === 'person') continue;
    const list = byKind.get(entity.kind);
    if (list) list.push(entity);
    else byKind.set(entity.kind, [entity]);
  }

  let sectorStart = 0;
  const sectorSize = (Math.PI * 2) / Math.max(1, byKind.size);

  for (const kind of KIND_ORDER) {
    const list = byKind.get(kind);
    if (!list) continue;
    const radius = KIND_RADIUS[kind] ?? 400;
    const sorted = [...list].sort((a, b) => b.factCount - a.factCount);
    sorted.forEach((entity, i) => {
      const t = sorted.length === 1 ? 0.5 : i / (sorted.length - 1);
      const angle = sectorStart + sectorSize * (0.12 + t * 0.76);
      const jitter = 0.86 + random() * 0.28;
      indexOf.set(entity.id, nodes.length);
      nodes.push({
        id: entity.id,
        label: entity.label,
        kind,
        x: Math.cos(angle) * radius * jitter,
        y: Math.sin(angle) * radius * jitter,
        radius: 4 + Math.min(9, Math.log2(entity.factCount + 1) * 2.4),
        factCount: entity.factCount,
        confidence: entity.confidence,
      });
    });
    sectorStart += sectorSize;
  }

  // Documents ring outermost, so "which document said this" is always one hop away.
  graph.documents.forEach((doc, i) => {
    const angle = (i / Math.max(1, graph.documents.length)) * Math.PI * 2;
    indexOf.set(doc.id, nodes.length);
    nodes.push({
      id: doc.id,
      label: doc.title,
      kind: 'encounter',
      x: Math.cos(angle) * 720,
      y: Math.sin(angle) * 720,
      radius: 3.4,
      factCount: graph.factsByDocument[doc.id]?.length ?? 0,
      confidence: doc.quality,
    });
  });


/** A few hundred iterations of repulsion plus springs. Cheap, stable, no dependency. */
function relax(nodes: GraphNode[], links: GraphLink[]): void {
  const iterations = 220;
  const repel = 4200;
  const springLength = 118;
  const springStrength = 0.016;

  for (let step = 0; step < iterations; step++) {
    const alpha = 1 - step / iterations;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          dx = i % 2 === 0 ? 0.7 : -0.7;
          dy = j % 2 === 0 ? 0.7 : -0.7;
          distSq = 1;
        }
        // Repulsion profile 1/r rather than 1/r²: it looks the same at this scale
        // and avoids a square root in the inner loop.
        const force = (repel * alpha) / distSq;
        const fx = dx * force;
        const fy = dy * force;
        a.x -= fx;
        a.y -= fy;
        b.x += fx;
        b.y += fy;
      }
    }

    for (const link of links) {
      const a = nodes[link.source];
      const b = nodes[link.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const desired = springLength * (link.kind === 'document_of' ? 3.6 : 1);
      const force = (dist - desired) * springStrength * alpha * Math.min(3, link.weight);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.x += fx;
      a.y += fy;
      b.x -= fx;
      b.y -= fy;
    }

    for (const node of nodes) {
      if (node.kind === 'person') {
        node.x = 0;
        node.y = 0;
        continue;
      }
      node.x *= 1 - 0.012 * alpha;
      node.y *= 1 - 0.012 * alpha;
    }
  }
}

  const links: GraphLink[] = [];
  const addLink = (fromId: string, toId: string, kind: string, inferred: boolean, weight = 1) => {
    const source = indexOf.get(fromId);
    const target = indexOf.get(toId);
    if (source === undefined || target === undefined) return;
    links.push({ source, target, kind, inferred, weight });
  };

  for (const edge of graph.edges) {
    if (edge.kind === 'about' || edge.kind === 'from_document') continue;
    if (edge.kind === 'document_of') {
      addLink(edge.from, edge.to, 'document_of', false, 0.4);
      continue;
    }
    addLink(edge.from, edge.to, edge.kind, edge.inferred, edge.weight);
  }

  relax(nodes, links);
  return { nodes, links };
}
