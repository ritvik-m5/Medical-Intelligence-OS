import type { Derivation } from '../engine/derive/types';
import type { HealthGraph, ISODate } from '../engine/types';

/* ------------------------------------------------------------------ */
/* The Contextual AI Handoff                                           */
/*                                                                    */
/* The ONLY supported way a view may hand an object to the AI. Instead  */
/* of pasting prose ("Rule applied — …"), a view passes a structured     */
/* AIContext, and the chat turns that into a chip and resolves pronouns   */
/* ("this", "explain this") against the object it names.                  */
/*                                                                    */
/* This is pure and deterministic: no React, no navigation. It lives     */
/* here so the store and the explainer can both use it without a DOM.    */
/* ------------------------------------------------------------------ */

export type AIContextKind =
  | 'finding'
  | 'fact'
  | 'document'
  | 'measurement'
  | 'derivation'
  | 'question'
  | 'interval'
  | 'conflict'
  | 'concept';

export interface AIContext {
  artifactId: string;
  asOf: ISODate;
  kind: AIContextKind;
  /** The id of the object itself (derivation id, fact id, document id, …). */
  id: string;
  title: string;
  /** One line of what the object is, so the chip and the receipt can state it. */
  summary: string;
  /** The document ids the object was read from. */
  sourceIds: string[];
  factIds: string[];
  derivationIds: string[];
}

export const CONTEXT_KIND_LABEL: Record<AIContextKind, string> = {
  finding: 'Finding',
  fact: 'Fact',
  document: 'Document',
  measurement: 'Measurement',
  derivation: 'Proof',
  question: 'Question',
  interval: 'Interval',
  conflict: 'Conflict',
  concept: 'Concept',
};

/** Build a finding context from a derivation, with full provenance preserved. */
export function contextForFinding(
  artifactId: string,
  asOf: ISODate,
  derivation: Derivation,
): AIContext {
  return {
    artifactId,
    asOf,
    kind: 'finding',
    id: derivation.id,
    title: derivation.title,
    summary: derivation.statement,
    sourceIds: derivation.docIds,
    factIds: derivation.factIds,
    derivationIds: [derivation.id],
  };
}

/** Build a document context, so "Explain this record" hands the real object. */
export function contextForDocument(
  artifactId: string,
  asOf: ISODate,
  document: { id: string; title: string },
  factIds: string[],
  derivationIds: string[],
  summary: string,
): AIContext {
  return {
    artifactId,
    asOf,
    kind: 'document',
    id: document.id,
    title: document.title,
    summary,
    sourceIds: [document.id],
    factIds,
    derivationIds,
  };
}

export interface ContextValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Whether a context still points at a live object in this artifact.
 *
 * A context can go stale when the record changes, the derivation re-derives
 * under a new id, or the context came from a different artifact. The caller
 * must refuse to silently substitute a different object.
 */
export function validateAIContext(
  context: AIContext,
  graph: HealthGraph,
  derivations: Derivation[],
): ContextValidation {
  if (context.artifactId !== '') {
    // The artifact is named by the store, not by the context; the store checks
    // identity separately. Here we only verify the object still exists.
  }

  switch (context.kind) {
    case 'finding':
    case 'derivation': {
      const found = derivations.find((d) => d.id === context.id);
      return found
        ? { valid: true }
        : { valid: false, reason: `the ${CONTEXT_KIND_LABEL[context.kind].toLowerCase()} is no longer in this artifact` };
    }
    case 'fact':
    case 'measurement': {
      const found = graph.facts.find((f) => f.id === context.id);
      return found
        ? { valid: true }
        : { valid: false, reason: 'the fact is no longer in this record' };
    }
    case 'document': {
      const found = graph.documents.find((d) => d.id === context.id);
      return found
        ? { valid: true }
        : { valid: false, reason: 'the document was deleted from this record' };
    }
    default:
      // Concept/question/conflict/interval contexts are resolved by the store's
      // engine state rather than a single graph object; they are always valid.
      return { valid: true };
  }
}

/** The questions offered when arriving from a context, per kind. */
const QUESTIONS_BY_KIND: Record<AIContextKind, string[]> = {
  finding: ['Explain this', 'Why is this here?', 'Show the evidence', "What can't this tell me?"],
  fact: ['Explain this', 'Show where this came from', 'What findings relate to this?'],
  document: ['Summarize this', 'What did Medical Memory extract?', 'What changed after this document?'],
  derivation: ['Explain this proof', 'Which facts support it?', 'What would make it disappear?'],
  measurement: ['Explain this result', 'Show its history', 'What does the record establish about it?'],
  question: ['Explain this question', 'What evidence gap raised it?', 'How could it be resolved?'],
  interval: ['Explain this interval', 'When was it documented?', 'What bound this span?'],
  conflict: ['Explain this conflict', 'What are the two sides?', 'Why does the engine refuse to decide?'],
  concept: ['Explain this', 'What does the record say about it?', 'What findings relate to it?'],
};

export function contextQuestions(context: AIContext): string[] {
  return QUESTIONS_BY_KIND[context.kind] ?? [];
}

/**
 * Whether a question is a pronoun referring to the active context, so it must
 * be resolved against that object rather than treated as a fresh question.
 */
export function isPronounQuestion(question: string): boolean {
  const text = question.toLowerCase().trim().replace(/[.?!]+$/, '');
  return [
    'this',
    'this finding',
    'this result',
    'this medication',
    'this document',
    'this measurement',
    'this proof',
    'this question',
    'this interval',
    'this conflict',
    'this concept',
    'explain this',
    'what does this mean',
    'what is this',
    'tell me about this',
    'why is this here',
    'why is this',
    'what does this show',
  ].includes(text);
}
