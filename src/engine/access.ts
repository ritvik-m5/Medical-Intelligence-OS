import type {
  Citation,
  Entity,
  Fact,
  HealthGraph,
  SourceDocument,
} from './types';

/* Small, obvious accessors. Everything else in the engine goes through these so
   that the graph's internal indexes stay an implementation detail. */

export function getFact(graph: HealthGraph, id: string | undefined): Fact | undefined {
  if (!id) return undefined;
  return graph.facts.find((f) => f.id === id);
}

export function getFactMap(graph: HealthGraph): Map<string, Fact> {
  return new Map(graph.facts.map((f) => [f.id, f]));
}

export function getEntity(graph: HealthGraph, key: string): Entity | undefined {
  return graph.entities.find((e) => e.key === key);
}

export function getEntityMap(graph: HealthGraph): Map<string, Entity> {
  return new Map(graph.entities.map((e) => [e.key, e]));
}

export function getDocument(graph: HealthGraph, id: string | undefined): SourceDocument | undefined {
  if (!id) return undefined;
  return graph.documents.find((d) => d.id === id);
}

/** Facts for an entity key, chronological. */
export function factsFor(graph: HealthGraph, key: string): Fact[] {
  const ids = graph.factsByEntity[key] ?? [];
  const map = getFactMap(graph);
  return ids.map((id) => map.get(id)).filter((f): f is Fact => Boolean(f));
}

export function factsForDocument(graph: HealthGraph, docId: string): Fact[] {
  const ids = graph.factsByDocument[docId] ?? [];
  const map = getFactMap(graph);
  return ids.map((id) => map.get(id)).filter((f): f is Fact => Boolean(f));
}

export function documentsBetween(graph: HealthGraph, start: string, end: string): SourceDocument[] {
  return graph.documents
    .filter((d) => d.date >= start && d.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function entitiesOfKind(graph: HealthGraph, kind: Entity['kind']): Entity[] {
  return graph.entities.filter((e) => e.kind === kind);
}

/** Build a citation for a fact, resolving its document and exact quote. */
export function citationFor(graph: HealthGraph, fact: Fact, label?: string): Citation {
  const doc = getDocument(graph, fact.docId);
  return {
    id: `cit_${fact.id}`,
    label: label ?? `${fact.label}${fact.valueNum !== undefined ? ` ${fact.valueNum}${fact.unit ? ` ${fact.unit}` : ''}` : ''}`,
    docId: fact.docId,
    docTitle: doc?.title ?? 'Unknown document',
    docDate: doc?.date ?? fact.occurredAt,
    docKind: doc?.kind ?? fact.docKind,
    span: fact.span,
    quote: fact.quote,
    factId: fact.id,
    confidence: fact.confidence,
  };
}

export function citationsFor(graph: HealthGraph, facts: Fact[], label?: string): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const fact of facts) {
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    out.push(citationFor(graph, fact, label));
  }
  return out;
}

/** Slice of the document text around a span, for the evidence drawer. */
export function contextAround(doc: SourceDocument, span: [number, number], radius = 220): string {
  const start = Math.max(0, span[0] - radius);
  const end = Math.min(doc.text.length, span[1] + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < doc.text.length ? '…' : '';
  return `${prefix}${doc.text.slice(start, end)}${suffix}`;
}
