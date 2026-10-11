import type { Derivation } from './derive/types';
import type { ChangeEvent, Contradiction } from './types';
import { CONTRADICTION_LABEL } from './types';

/* ------------------------------------------------------------------ */
/* Record questions                                                    */
/*                                                                    */
/* The things this record raises but cannot answer.                    */
/*                                                                    */
/* A question is generated deterministically from the artifact — never  */
/* invented by a model, never guessed. Each has a category that says    */
/* where it came from, the evidence that raised it, and a destination   */
/* the reader can go to investigate it.                                  */
/*                                                                    */
/* The id is stable (it names the thing that raised the question), so a  */
/* question survives re-derivation and its status survives a reload.     */
/* ------------------------------------------------------------------ */

export type QuestionCategory =
  | 'conflict'
  | 'gap'
  | 'evidence'
  | 'unestablished'
  | 'change';

export type QuestionStatus = 'open' | 'investigating' | 'answered' | 'dismissed';

/** A view id. A literal union so this module stays free of the React layer. */
export type QuestionDestination =
  | 'debugger'
  | 'quality'
  | 'inference'
  | 'records'
  | 'timemachine'
  | 'lab';

export interface RecordQuestion {
  id: string;
  category: QuestionCategory;
  /** The question, in words a person would ask. */
  question: string;
  /** Why the record raises it — one line, from the artifact. */
  evidence: string;
  /** The facts and derivations the question is about. */
  relatedFactIds: string[];
  relatedDerivationIds: string[];
  /** Where the reader can go to investigate. */
  destination: QuestionDestination;
  status: QuestionStatus;
}

export const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  conflict: 'Conflict',
  gap: 'Evidence gap',
  evidence: 'Weak evidence',
  unestablished: 'Not established',
  change: 'Unclear change',
};

export interface QuestionInput {
  contradictions: Contradiction[];
  derivations: Derivation[];
  changes: ChangeEvent[];
}

/**
 * The questions this record raises.
 *
 * Deterministic: the same input gives the same questions in the same order, and
 * the ids are derived from the things that raised them, so they are stable
 * across re-derivation rather than regenerated fresh each time.
 */
export function generateQuestions(input: QuestionInput): RecordQuestion[] {
  const questions: RecordQuestion[] = [];

  /* 1. A contradiction, and the single question a clinician could ask. */
  for (const contradiction of input.contradictions) {
    if (contradiction.kind === 'documentation_gap') continue; // a gap, not a conflict
    questions.push({
      id: `q:conflict:${contradiction.id}`,
      category: 'conflict',
      question:
        contradiction.questionForClinician || `What does the record say about ${contradiction.title}?`,
      evidence: `${CONTRADICTION_LABEL[contradiction.kind]}: ${contradiction.detail}`,
      relatedFactIds: contradiction.factIds,
      relatedDerivationIds: [],
      destination: 'debugger',
      status: 'open',
    });
  }

  /* 2. A documentation gap: a problem with no later follow-up. */
  for (const contradiction of input.contradictions) {
    if (contradiction.kind !== 'documentation_gap') continue;
    questions.push({
      id: `q:gap:${contradiction.id}`,
      category: 'gap',
      question: `What information is missing about ${contradiction.title}?`,
      evidence: contradiction.detail,
      relatedFactIds: contradiction.factIds,
      relatedDerivationIds: [],
      destination: 'quality',
      status: 'open',
    });
  }

  /* 3. A finding resting on weaker evidence, whose support is worth checking. */
  for (const derivation of input.derivations) {
    if (derivation.grade !== 'C' && derivation.grade !== 'D') continue;
    questions.push({
      id: `q:evidence:${derivation.id}`,
      category: 'evidence',
      question: `What evidence supports \u201c${derivation.title}\u201d?`,
      evidence: `Grade ${derivation.grade} \u2014 ${derivation.factIds.length} fact${derivation.factIds.length === 1 ? '' : 's'}.`,
      relatedFactIds: derivation.factIds,
      relatedDerivationIds: [derivation.id],
      destination: 'inference',
      status: 'open',
    });
  }

  /* 4. A finding the engine can name but the record never states outright. */
  for (const derivation of input.derivations) {
    if (!derivation.satisfiableBy) continue;
    questions.push({
      id: `q:unestablished:${derivation.id}`,
      category: 'unestablished',
      question: `Was \u201c${derivation.title}\u201d ever explicitly documented?`,
      evidence: `The engine infers it, but ${derivation.satisfiableBy}`,
      relatedFactIds: derivation.factIds,
      relatedDerivationIds: [derivation.id],
      destination: 'records',
      status: 'open',
    });
  }

  /* 5. A change whose exact moment the documents do not pin down. */
  for (const change of input.changes) {
    if (change.kind === 'new_document') continue;
    if (!change.caveat) continue;
    questions.push({
      id: `q:change:${change.id}`,
      category: 'change',
      question: `When did ${change.entityLabel} actually ${change.kind.replace(/_/g, ' ')}?`,
      evidence: `${change.fromDate} \u2192 ${change.toDate}. ${change.caveat}`,
      relatedFactIds: [change.fromFactId, change.toFactId].filter(Boolean) as string[],
      relatedDerivationIds: [],
      destination: 'timemachine',
      status: 'open',
    });
  }

  return questions;
}

/* ------------------------------------------------------------------ */
/* The lifecycle                                                       */
/*                                                                    */
/* Status is an override over the generated, always-open question. The  */
/* generation is deterministic and pure; only the reader's judgement     */
/* moves a question through its states, and that judgement is kept      */
/* separately so it survives re-derivation without corrupting it.        */
/* ------------------------------------------------------------------ */

const STATUS_ORDER: QuestionStatus[] = ['open', 'investigating', 'answered', 'dismissed'];

export function nextStatus(status: QuestionStatus): QuestionStatus {
  const index = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(index + 1) % STATUS_ORDER.length];
}

/** Apply a map of reader-set statuses over freshly generated questions. */
export function applyStatuses(
  questions: RecordQuestion[],
  overrides: Record<string, QuestionStatus>,
): RecordQuestion[] {
  return questions.map((question) => ({
    ...question,
    status: overrides[question.id] ?? question.status,
  }));
}

/** Summarise the split, for the State of the Record. */
export function questionCounts(questions: RecordQuestion[]): {
  open: number;
  investigating: number;
  answered: number;
  dismissed: number;
  total: number;
} {
  const counts = { open: 0, investigating: 0, answered: 0, dismissed: 0, total: questions.length };
  for (const question of questions) {
    if (question.status === 'open') counts.open += 1;
    else if (question.status === 'investigating') counts.investigating += 1;
    else if (question.status === 'answered') counts.answered += 1;
    else counts.dismissed += 1;
  }
  return counts;
}
