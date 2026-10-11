import type { Derivation } from '../engine/derive/types';
import type { HealthGraph } from '../engine/types';
import type { ArtifactIdentity } from '../engine/identity';

/* ------------------------------------------------------------------ */
/* Explainers                                                          */
/*                                                                    */
/* The rule this module exists to enforce:                            */
/*                                                                    */
/*     AI explains the evidence. The evidence determines the inference. */
/*                                                                    */
/* So an explainer is handed a graph, the derivations over it, and a    */
/* question. It is never handed a bare question, and it never has access */
/* to anything the engine did not already conclude. It cannot add a      */
/* finding, because a finding is not something it can express: the shape */
/* of an answer here is prose about derivations that already exist.      */
/*                                                                    */
/* The shipped implementation is deterministic. A language model can be  */
/* swapped in behind the same interface, and when it is, the interface   */
/* is what keeps it honest: it receives the proof as context and returns */
/* prose. There is no path from a model back into the graph.             */
/* ------------------------------------------------------------------ */

export interface ExplanationSource {
  kind: 'derivation' | 'fact' | 'document' | 'identity' | 'step';
  id: string;
  label: string;
  detail?: string;
  factIds: string[];
  docIds: string[];
}

export interface Explanation {
  /** The answer, as paragraphs. */
  paragraphs: string[];
  /** What every claim in the answer rests on. */
  sources: ExplanationSource[];
  /** What the explainer could not answer, stated rather than glossed. */
  notAnswered: string | null;
  /** Which backend produced this, so the reader knows what they are reading. */
  backend: string;
  /** True only when a language model wrote the prose. */
  generated: boolean;
  /** What the explainer understood the question to be. */
  intent: ExplanationIntent;
}

export type ExplanationIntent =
  | 'why'
  | 'summary'
  | 'severity'
  | 'evidence'
  | 'limits'
  | 'identity'
  | 'count'
  | 'concept'
  | 'greeting'
  | 'unknown';

/**
 * Where the words came from.
 *
 * These are different claims and must not be confused. An engine-derived answer
 * is the engine's own statement, assembled from the proof. A model-explained
 * answer is the engine's statement rewritten for readability, and is *less*
 * authoritative, not more — the proof remains the object of record either way.
 */
export type ExplanationProvenance = 'engine-derived' | 'model-explained';

export const PROVENANCE_LABEL: Record<ExplanationProvenance, string> = {
  'engine-derived': 'Engine-derived',
  'model-explained': 'Model-explained',
};

export const PROVENANCE_NOTE: Record<ExplanationProvenance, string> = {
  'engine-derived':
    'Assembled by the engine from the proof. Every sentence traces to a derivation and its spans.',
  'model-explained':
    'The engine\u2019s own answer, rewritten for readability. The citations below are still the engine\u2019s; the wording is not evidence.',
};

export function provenanceOf(explanation: { generated: boolean }): ExplanationProvenance {
  return explanation.generated ? 'model-explained' : 'engine-derived';
}

export interface ExplanationRequest {
  question: string;
  graph: HealthGraph;
  derivations: Derivation[];
  identity: ArtifactIdentity;
  /** The derivation the reader currently has open, if any. */
  focus?: string;
}

export interface ExplainerBackend {
  readonly id: string;
  readonly label: string;
  /** True when the prose comes from a language model rather than the engine. */
  readonly generated: boolean;
  /** What the reader should know about where answers come from. */
  readonly note: string;
  /** True when this backend needs a reachable endpoint. */
  readonly requiresNetwork: boolean;
  explain(request: ExplanationRequest): Promise<Explanation>;
}

/**
 * What the explainer can be asked, shown to the reader rather than hidden.
 *
 * An interface that only works when you already know what to type is not an
 * interface. These are the questions the shipped explainer answers from the
 * artifact, and it says so when a question falls outside them.
 */
export const EXPLAINER_QUESTIONS: string[] = [
  'Why did the highest-severity finding appear?',
  'Show me the evidence for the top finding',
  'Summarise what you found',
  'Which findings are serious?',
  'What is this artifact?',
  'What can you not tell me?',
];
