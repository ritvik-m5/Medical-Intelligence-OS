import type { Fact, HealthGraph, ISODate, SourceDocument } from '../types';
import type { RedactionPolicy, RedactionRemoval, RedactionResult } from './redactPolicy';
import { addDays } from '../text/normalize';
import { factId as makeFactId, docId as makeDocId, hash } from '../ids';

function shiftDate(date: ISODate, days: number): ISODate {
  return days === 0 ? date : addDays(date, days);
}

/**
 * Apply a redaction policy.
 *
 * Returns a brand-new graph; the input is never mutated. Fact and document ids
 * are recomputed so a redacted export cannot be joined back to the original by
 * identifier — the failure mode that makes most "anonymised" datasets
 * re-identifiable.
 */
export function redact(graph: HealthGraph, policy: RedactionPolicy): RedactionResult {
  const removed: RedactionRemoval[] = [];
  const excludedKinds = new Set(policy.excludeKinds);
  const excludedDocKinds = new Set(policy.excludeDocKinds);

  const keptDocs = graph.documents.filter((doc) => {
    if (!excludedDocKinds.has(doc.kind)) return true;
    removed.push({
      kind: 'document',
      target: doc.id,
      detail: `Document of type "${doc.kind}" removed by policy.`,
    });
    return false;
  });
  const keptDocIds = new Set(keptDocs.map((d) => d.id));

  const keptFacts = graph.facts.filter((fact) => {
    if (!keptDocIds.has(fact.docId)) return false;
    const entityKind = fact.entityKey.split(':')[0] ?? '';
    if (excludedKinds.has(entityKind)) {
      removed.push({
        kind: 'fact',
        target: fact.id,
        detail: `Fact of kind "${entityKind}" removed by policy.`,
      });
      return false;
    }
    return true;
  });

  for (const kind of policy.excludeKinds) {
    removed.push({
      kind: 'entity-kind',
      target: kind,
      detail: `All facts and entities of kind "${kind}" were excluded.`,
    });
  }
  if (policy.dateShiftDays !== 0) {
    removed.push({
      kind: 'date-shift',
      target: `${policy.dateShiftDays} days`,
      detail:
        'Every date was shifted by a constant offset. Intervals and durations are preserved exactly; the link to a calendar date is not.',
    });
  }
  if (policy.stripDocumentText) {
    removed.push({
      kind: 'text',
      target: 'document bodies',
      detail:
        'Free-text document bodies were dropped. The quoted lines attached to each fact were retained, because without them the facts would have no provenance.',
    });
  }
  if (policy.pseudonymise) {
    removed.push({
      kind: 'pseudonym',
      target: graph.patient.name,
      detail:
        'Patient name replaced with a stable pseudonym derived from the policy id, so repeated exports of the same record stay linkable to each other but not to the person.',
    });
  }

  const pseudonym = `Subject-${hash(`${policy.id}|${graph.patient.id}`).slice(0, 6).toUpperCase()}`;

  const docIdMap = new Map<string, string>();
  const documents: SourceDocument[] = keptDocs.map((doc) => {
    const date = shiftDate(doc.date, policy.dateShiftDays);
    const newId = makeDocId(`redacted-${policy.id}`, date, doc.title);
    docIdMap.set(doc.id, newId);
    return {
      ...doc,
      id: newId,
      date,
      periodStart: doc.periodStart ? shiftDate(doc.periodStart, policy.dateShiftDays) : undefined,
      periodEnd: doc.periodEnd ? shiftDate(doc.periodEnd, policy.dateShiftDays) : undefined,
    };
  });

  const factIdMap = new Map<string, string>();
  const facts: Fact[] = keptFacts.map((fact) => {
    const occurredAt = shiftDate(fact.occurredAt, policy.dateShiftDays);
    const newId = makeFactId([
      policy.id,
      docIdMap.get(fact.docId) ?? fact.docId,
      fact.entityKey,
      fact.span[0],
      occurredAt,
    ]);
    factIdMap.set(fact.id, newId);
    return {
      ...fact,
      id: newId,
      docId: docIdMap.get(fact.docId) ?? fact.docId,
      occurredAt,
      periodEnd: fact.periodEnd ? shiftDate(fact.periodEnd, policy.dateShiftDays) : undefined,
    };
  });

  // Indexes are rebuilt rather than patched: patching is where redaction bugs hide.
  const factsByEntity: Record<string, string[]> = {};
  const factsByDocument: Record<string, string[]> = {};
  for (const fact of facts) {
    (factsByEntity[fact.entityKey] ||= []).push(fact.id);
    (factsByDocument[fact.docId] ||= []).push(fact.id);
  }
  const factById = new Map(facts.map((f) => [f.id, f]));
  for (const key of Object.keys(factsByEntity)) {
    factsByEntity[key].sort((a, b) =>
      (factById.get(a)?.occurredAt ?? '').localeCompare(factById.get(b)?.occurredAt ?? ''),
    );
  }

  const entities = graph.entities
    .filter((entity) => !excludedKinds.has(entity.key.split(':')[0] ?? ''))
    .map((entity) => {
      const ids = entity.factIds.map((id) => factIdMap.get(id)).filter((x): x is string => Boolean(x));
      if (ids.length === 0) return null;
      const docIds = Array.from(
        new Set(
          ids
            .map((id) => factById.get(id)?.docId)
            .filter((x): x is string => Boolean(x)),
        ),
      );
      return {
        ...entity,
        id: `ent_${hash(`${policy.id}|${entity.key}`)}`,
        factIds: ids,
        docIds,
        factCount: ids.length,
        firstSeen: shiftDate(entity.firstSeen, policy.dateShiftDays),
        lastSeen: shiftDate(entity.lastSeen, policy.dateShiftDays),
      };
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const entityIdMap = new Map(
    graph.entities.map((entity) => [
      entity.id,
      entities.find((e) => e.key === entity.key)?.id ?? entity.id,
    ]),
  );

  const edges = graph.edges
    .map((edge) => {
      const from = edge.from.startsWith('fct_') ? factIdMap.get(edge.from) : entityIdMap.get(edge.from);
      const to = edge.to.startsWith('fct_') ? factIdMap.get(edge.to) : entityIdMap.get(edge.to);
      if (!from || !to) return null;
      return {
        ...edge,
        id: `edg_${hash(`${policy.id}|${from}|${edge.kind}|${to}`)}`,
        from,
        to,
        evidence: edge.evidence.map((id) => factIdMap.get(id) ?? id),
      };
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const dates = documents.map((d) => d.date).sort();

  const redactedGraph: HealthGraph = {
    patient: {
      ...graph.patient,
      id: `pat_${hash(`${policy.id}|${graph.patient.id}`)}`,
      name: policy.pseudonymise ? pseudonym : graph.patient.name,
      dateOfBirth: graph.patient.dateOfBirth
        ? shiftDate(graph.patient.dateOfBirth, policy.dateShiftDays)
        : undefined,
    },
    documents,
    facts,
    entities,
    edges,
    stats: {
      ...graph.stats,
      documents: documents.length,
      facts: facts.length,
      entities: entities.length,
      edges: edges.length,
      spanStart: dates[0] ?? graph.stats.spanStart,
      spanEnd: dates[dates.length - 1] ?? graph.stats.spanEnd,
      factsByType: facts.reduce<Record<string, number>>((acc, fact) => {
        acc[fact.type] = (acc[fact.type] ?? 0) + 1;
        return acc;
      }, {}),
      flaggedFacts: facts.filter((f) => f.flags.length > 0).length,
      meanConfidence:
        facts.length === 0
          ? 0
          : Math.round((facts.reduce((s, f) => s + f.confidence, 0) / facts.length) * 100) / 100,
    },
    entityKeyIndex: Object.fromEntries(entities.map((e) => [e.key, e.id])),
    factsByDocument,
    factsByEntity,
    builtAt: new Date().toISOString().slice(0, 16),
  };

  const residualRisk: string[] = [];
  if (policy.dateShiftDays === 0) {
    residualRisk.push(
      'Dates are unshifted, so rare events combined with a known care history could re-identify the subject.',
    );
  }
  if (!policy.stripDocumentText) {
    residualRisk.push(
      'Free-text document bodies are retained. Facility names, clinician names and any identifiers inside the text are not removed by this policy.',
    );
  }
  residualRisk.push(
    'Free-text fields are not scanned for identifiers. This is a structural redaction, not a validated de-identification pipeline.',
  );
  if (facts.length < 20) {
    residualRisk.push('Small record: with few facts, unusual combinations remain distinctive.');
  }

  return {
    graph: redactedGraph,
    policy,
    manifest: {
      policyId: policy.id,
      generatedAt: new Date().toISOString(),
      removed,
      counts: {
        documentsRemoved: graph.documents.length - documents.length,
        factsRemoved: graph.facts.length - facts.length,
        factsKept: facts.length,
        kindsRemoved: policy.excludeKinds.length,
        documentsDateShifted: policy.dateShiftDays === 0 ? 0 : documents.length,
        textStripped: policy.stripDocumentText,
      },
      residualRisk,
    },
  };
}

