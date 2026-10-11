import type { Derivation } from '../engine/derive/types';
import type { HealthGraph } from '../engine/types';
import type { DocumentInput } from '../engine/ingest';
import { verifyProvenance, type ProvenanceReport } from '../engine/verify';
import { artifactIdentity, type ArtifactIdentity } from '../engine/identity';

/* ------------------------------------------------------------------ */
/* Engine status                                                       */
/*                                                                    */
/* One shape, two producers. The builder reads it from a BuildArtifact */
/* and the workspace reads it from the store's graph, but the numbers   */
/* mean the same thing in both places and the provenance verdict is     */
/* recomputed rather than carried over.                                 */
/*                                                                    */
/* The pill that renders this is deliberately the same component in     */
/* both contexts, because "this is real" is a claim about the whole     */
/* product rather than about the landing page.                          */
/* ------------------------------------------------------------------ */

export type EngineOrigin = 'builder' | 'workspace';

export interface EngineStatus {
  /** Which record these numbers describe. */
  record: string;
  origin: EngineOrigin;
  documents: number;
  facts: number;
  entities: number;
  edges: number;
  /** Edges the engine inferred rather than read. */
  inferredEdges: number;
  derivations: number;
  highSeverity: number;
  /** Rules that were evaluated, including those that fired zero times. */
  rulesEvaluated: number;
  /** How long the build took, when there was one. */
  elapsedMs?: number;
  /** The live provenance verdict. Never cached across graph changes. */
  verification: ProvenanceReport;
  /** The name of this result: what it read, what it produced, which engine. */
  identity: ArtifactIdentity;
}

export interface EngineStatusInput {
  record: string;
  origin: EngineOrigin;
  graph: HealthGraph;
  derivations: Derivation[];
  documents: DocumentInput[];
  rulesEvaluated: number;
  elapsedMs?: number;
}

export function engineStatus(input: EngineStatusInput): EngineStatus {
  const { graph, derivations } = input;
  return {
    record: input.record,
    origin: input.origin,
    documents: graph.documents.length,
    facts: graph.facts.length,
    entities: graph.entities.length,
    edges: graph.edges.length,
    inferredEdges: graph.edges.filter((edge) => edge.inferred).length,
    derivations: derivations.length,
    highSeverity: derivations.filter((derivation) => derivation.severity === 'high').length,
    rulesEvaluated: input.rulesEvaluated,
    elapsedMs: input.elapsedMs,
    verification: verifyProvenance(graph, derivations),
    identity: artifactIdentity({ graph, derivations, documents: input.documents }),
  };
}

/** The compact line the pill shows. Deliberately unglamorous. */
export function statusLine(status: EngineStatus): string {
  return `${status.facts} facts · ${status.entities} entities · ${status.derivations} derivations`;
}

/** The verdict the pill colours itself by. */
export function statusVerdict(status: EngineStatus): 'verified' | 'failed' {
  return status.verification.clean ? 'verified' : 'failed';
}
