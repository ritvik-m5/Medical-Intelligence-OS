import type { Patient } from '../types';
import type { DocumentInput } from '../ingest';
import { ingestDocument } from '../ingest';
import { buildGraph } from '../graph';
import { derive } from '../derive/engine';
import { verifyProvenance } from '../verify';

/* ------------------------------------------------------------------ */
/* Reconciliation consequences                                         */
/*                                                                    */
/* The most important rule in the reconciliation workspace: never       */
/* predict what keeping or discarding a document will do — actually run  */
/* the engine and report the real difference.                           */
/*                                                                    */
/* `reconcileImpact` ingests the incoming document (for "keep") and      */
/* re-derives the whole artifact, then reports the before/after counts.  */
/* "Discard" never mutates anything: it is the absence of an action, so  */
/* the after-state equals the before-state.                              */
/*                                                                    */
/* Every number returned here comes from a real re-derivation, never      */
/* from a guess or a similarity score.                                   */
/* ------------------------------------------------------------------ */

export interface ImpactCounts {
  documents: number;
  facts: number;
  intervals: number;
  findings: number;
  /** Verification score (0–100) after the action. */
  verification: number;
}

export interface ReconciliationDelta {
  documents: number;
  facts: number;
  intervals: number;
  findings: number;
}

export interface ReconciliationImpact {
  before: ImpactCounts;
  after: ImpactCounts;
  delta: ReconciliationDelta;
  /** True when the re-derived artifact passes every provenance check. */
  verifiedClean: boolean;
}

export type ReconciliationAction = 'keep' | 'discard';

function countsFor(patient: Patient, documents: DocumentInput[]): ImpactCounts {
  const results = documents
    .map((doc, index) => ingestDocument(doc, index))
    .sort((a, b) => a.document.date.localeCompare(b.document.date));
  const graph = buildGraph(patient, results);
  const asOf = graph.stats.spanEnd;
  const derivations = derive(graph, asOf);
  const verification = verifyProvenance(graph, derivations);

  const intervals = new Set(
    graph.entities
      .filter((entity) => entity.kind === 'medication' || entity.kind === 'condition')
      .map((entity) => entity.key),
  ).size;

  return {
    documents: graph.documents.length,
    facts: graph.facts.length,
    intervals,
    findings: derivations.length,
    verification: verification.score,
  };
}

/**
 * The actual consequence of a reconciliation action.
 *
 * `keep` adds the incoming document and re-derives; `discard` leaves the
 * corpus unchanged. Nothing here predicts — it runs `ingestDocument`,
 * `buildGraph`, `derive` and `verifyProvenance` for real.
 */
export function reconcileImpact(
  patient: Patient,
  currentDocuments: DocumentInput[],
  incoming: DocumentInput,
  action: ReconciliationAction,
): ReconciliationImpact {
  const before = countsFor(patient, currentDocuments);
  const after = action === 'keep' ? countsFor(patient, [...currentDocuments, incoming]) : before;
  const verification = verifyProvenanceFor(patient, action === 'keep' ? [...currentDocuments, incoming] : currentDocuments);

  return {
    before,
    after,
    delta: {
      documents: after.documents - before.documents,
      facts: after.facts - before.facts,
      intervals: after.intervals - before.intervals,
      findings: after.findings - before.findings,
    },
    verifiedClean: verification.clean,
  };
}

function verifyProvenanceFor(patient: Patient, documents: DocumentInput[]) {
  const results = documents
    .map((doc, index) => ingestDocument(doc, index))
    .sort((a, b) => a.document.date.localeCompare(b.document.date));
  const graph = buildGraph(patient, results);
  const derivations = derive(graph, graph.stats.spanEnd);
  return verifyProvenance(graph, derivations);
}

/** A human sentence for the delta, used by the review surface. */
export function describeDelta(delta: ReconciliationDelta): string {
  const parts: string[] = [];
  for (const [label, value] of [
    ['document', delta.documents],
    ['fact', delta.facts],
    ['interval', delta.intervals],
    ['finding', delta.findings],
  ] as const) {
    if (value !== 0) parts.push(`${value > 0 ? '+' : ''}${value} ${label}${Math.abs(value) === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no change to the derived record';
}
