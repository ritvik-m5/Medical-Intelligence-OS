import type {
  Edge,
  Entity,
  EntityKind,
  Fact,
  FactType,
  GraphStats,
  HealthGraph,
  Patient,
  SourceDocument,
} from './types';
import { edgeId, entityId } from './ids';
import type { IngestResult } from './ingest';
import { SPEC_BY_ENTITY_KEY } from './text/lexicon';
import { monitoringLabsFor, treatedConditionsFor } from './relations';

const KIND_OF_FACT: Record<FactType, EntityKind> = {
  measurement: 'measurement',
  medication: 'medication',
  condition: 'condition',
  procedure: 'procedure',
  allergy: 'allergy',
  immunization: 'immunization',
  vital: 'vital',
  encounter: 'encounter',
  symptom: 'symptom',
  social: 'social',
  demographic: 'demographic',
};

export interface BuildOptions {
  /** Minimum number of shared documents before a co-occurrence edge is added. */
  coOccurrenceThreshold?: number;
}

/**
 * Turn ingested documents into the Temporal Health Graph.
 *
 * Three layers are produced: documents, facts (provenanced assertions) and
 * entities (resolved concepts). Every edge records the fact ids that justify it,
 * and edges the engine invented rather than read are marked `inferred`.
 */
export function buildGraph(
  patient: Patient,
  results: IngestResult[],
  options: BuildOptions = {},
): HealthGraph {
  const threshold = options.coOccurrenceThreshold ?? 2;
  const documents = results.map((r) => r.document);
  const facts = results.flatMap((r) => r.facts);

  const factsByEntity: Record<string, string[]> = {};
  for (const fact of facts) (factsByEntity[fact.entityKey] ||= []).push(fact.id);

  const factById = new Map(facts.map((f) => [f.id, f]));
  const entities: Entity[] = [];

  for (const [key, ids] of Object.entries(factsByEntity)) {
    const entityFacts = ids
      .map((id) => factById.get(id))
      .filter((f): f is Fact => Boolean(f))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    if (entityFacts.length === 0) continue;

    const spec = SPEC_BY_ENTITY_KEY.get(key);
    const docIds = Array.from(new Set(entityFacts.map((f) => f.docId)));
    const surfaceForms = Array.from(new Set(entityFacts.map((f) => f.label)));
    const aliases = Array.from(
      new Set([...(spec?.aliases ?? []), ...surfaceForms.map((s) => s.toLowerCase())]),
    );
    const confidence = entityFacts.reduce((sum, f) => sum + f.confidence, 0) / entityFacts.length;

    entities.push({
      id: entityId(key),
      key,
      kind: KIND_OF_FACT[entityFacts[0].type],
      label: spec?.label ?? entityFacts[entityFacts.length - 1].label,
      aliases,
      category: spec?.category,
      codes: spec?.codes,
      factIds: entityFacts.map((f) => f.id),
      docIds,
      firstSeen: entityFacts[0].occurredAt,
      lastSeen: entityFacts[entityFacts.length - 1].occurredAt,
      factCount: entityFacts.length,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  const entityKeyIndex: Record<string, string> = {};
  for (const entity of entities) entityKeyIndex[entity.key] = entity.id;

  const sortedDocDates = documents.map((d) => d.date).sort();
  const personEntity: Entity = {
    id: entityId(`person:${patient.id}`),
    key: `person:${patient.id}`,
    kind: 'person',
    label: patient.name,
    aliases: [patient.name.toLowerCase()],
    category: 'Person',
    factIds: [],
    docIds: documents.map((d) => d.id),
    firstSeen: sortedDocDates[0] ?? '2000-01-01',
    lastSeen: sortedDocDates[sortedDocDates.length - 1] ?? '2000-01-01',
    factCount: 0,
    confidence: 1,
  };
  entities.unshift(personEntity);
  entityKeyIndex[personEntity.key] = personEntity.id;

  const edges: Edge[] = [];
  const addEdge = (
    from: string,
    to: string,
    kind: Edge['kind'],
    weight: number,
    evidence: string[],
    inferred = false,
  ) => {
    edges.push({ id: edgeId(from, to, kind), from, to, kind, weight, evidence, inferred });
  };

  for (const doc of documents) addEdge(personEntity.id, doc.id, 'document_of', 1, [], false);
  for (const fact of facts) {
    const entity = entityKeyIndex[fact.entityKey];
    if (entity) addEdge(fact.id, entity, 'about', 1, [fact.id], false);
    addEdge(fact.id, fact.docId, 'from_document', 1, [fact.id], false);
  }

  // Co-occurrence: two concepts repeatedly documented together are worth showing
  // together, but a single shared document is noise.
  const docsOfEntity = new Map<string, Set<string>>();
  for (const entity of entities) {
    if (entity.kind === 'person') continue;
    docsOfEntity.set(entity.key, new Set(entity.docIds));
  }
  const keys = Array.from(docsOfEntity.keys()).sort();
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = docsOfEntity.get(keys[i]);
      const b = docsOfEntity.get(keys[j]);
      if (!a || !b) continue;
      let shared = 0;
      for (const doc of a) if (b.has(doc)) shared++;
      if (shared >= threshold) {
        addEdge(entityKeyIndex[keys[i]], entityKeyIndex[keys[j]], 'co_occurs', shared, [], true);
      }
    }
  }

  // Declared relations: monitoring labs and class-level indications.
  const presentKeys = new Set(keys);
  for (const entity of entities) {
    const shortKey = entity.key.split(':')[1];
    if (entity.kind === 'condition') {
      for (const labKey of monitoringLabsFor(shortKey)) {
        for (const prefix of ['measurement:', 'vital:']) {
          const candidate = `${prefix}${labKey}`;
          if (presentKeys.has(candidate)) {
            addEdge(entity.id, entityKeyIndex[candidate], 'monitors', 1, [], true);
          }
        }
      }
    }
    if (entity.kind === 'medication') {
      const spec = SPEC_BY_ENTITY_KEY.get(entity.key);
      for (const conditionKey of treatedConditionsFor(spec?.drugClass ?? spec?.category)) {
        const candidate = `condition:${conditionKey}`;
        if (presentKeys.has(candidate)) {
          addEdge(entity.id, entityKeyIndex[candidate], 'treats', 1, [], true);
        }
      }
    }
  }

  const factsByDocument: Record<string, string[]> = {};
  for (const doc of documents) factsByDocument[doc.id] = [];
  for (const fact of facts) (factsByDocument[fact.docId] ||= []).push(fact.id);
  for (const doc of documents) {
    factsByDocument[doc.id].sort(
      (a, b) => (factById.get(a)?.span[0] ?? 0) - (factById.get(b)?.span[0] ?? 0),
    );
  }

  const chronological: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(factsByEntity)) {
    chronological[key] = [...ids].sort((a, b) => {
      const fa = factById.get(a);
      const fb = factById.get(b);
      if (!fa || !fb) return 0;
      return fa.occurredAt.localeCompare(fb.occurredAt) || fa.span[0] - fb.span[0];
    });
  }

  return {
    patient,
    documents,
    facts,
    entities,
    edges,
    stats: computeStats(documents, facts, entities, edges),
    entityKeyIndex,
    factsByDocument,
    factsByEntity: chronological,
    builtAt: new Date().toISOString().slice(0, 16),
  };
}

function computeStats(
  documents: SourceDocument[],
  facts: Fact[],
  entities: Entity[],
  edges: Edge[],
): GraphStats {
  const factsByType: Record<string, number> = {};
  for (const fact of facts) factsByType[fact.type] = (factsByType[fact.type] ?? 0) + 1;
  const dates = documents.map((d) => d.date).sort();
  const meanConfidence =
    facts.length === 0 ? 0 : facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length;
  return {
    documents: documents.length,
    facts: facts.length,
    entities: entities.length,
    edges: edges.length,
    spanStart: dates[0] ?? '2000-01-01',
    spanEnd: dates[dates.length - 1] ?? '2000-01-01',
    meanConfidence: Math.round(meanConfidence * 100) / 100,
    factsByType,
    flaggedFacts: facts.filter((f) => f.flags.length > 0).length,
  };
}
