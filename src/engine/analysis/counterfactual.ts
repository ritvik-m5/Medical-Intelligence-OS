import type { ConditionSpan, Derivation, MedicationCourse } from '../derive/types';
import type { HealthGraph } from '../types';
import { impactOf, type ImpactReport } from './impact';
import { proofDiff, type ProofDiff } from './proofDiff';

/* ------------------------------------------------------------------ */
/* Counterfactual engine                                               */
/*                                                                    */
/* "What if this document were not here?" is a question about a record  */
/* that does not exist. The answer is useful and it is not history, and */
/* the two must never be confused.                                      */
/*                                                                    */
/* So every result from this module:                                    */
/*                                                                    */
/*   is labelled COUNTERFACTUAL                                         */
/*   states whether the branch has actually been run                    */
/*   shows baseline → intervention → changed proof                      */
/*   carries a list of what the engine refuses to claim                 */
/*                                                                    */
/* It never produces a recommendation. A counterfactual says what the    */
/* record would support; what to do about it is not this system's to    */
/* say, and there is no code path here that could say it.               */
/* ------------------------------------------------------------------ */

export type Intervention =
  | { kind: 'withhold-rule'; ruleId: string }
  | { kind: 'withhold-document'; docId: string }
  | { kind: 'add-document'; title: string }
  | { kind: 'as-of'; date: string };

export interface CounterfactualChange {
  id: string;
  ruleId: string;
  title: string;
  change: 'lost' | 'gained' | 'moved';
  /** The step-by-step proof diff, when both sides exist. */
  proof: ProofDiff | null;
}

export interface CounterfactualResult {
  /** Always this string. It is the point of the type. */
  label: 'COUNTERFACTUAL';
  intervention: Intervention;
  question: string;
  /** False when the branch has not been executed. Nothing is inferred from it. */
  executed: boolean;
  baseline: { identity: string; findings: number };
  interventionResult: { identity: string; findings: number } | null;
  changed: CounterfactualChange[];
  /** Impact analysis, when the intervention removes evidence. */
  impact: ImpactReport | null;
  /** What the engine declines to conclude from this. Always populated. */
  notClaimed: string[];
  notes: string[];
}

/** The sentence that describes what was changed. */
export function describeIntervention(intervention: Intervention, graph: HealthGraph): string {
  switch (intervention.kind) {
    case 'withhold-rule':
      return `If rule ${intervention.ruleId} had not been applied`;
    case 'withhold-document': {
      const document = graph.documents.find((doc) => doc.id === intervention.docId);
      return `If ${document ? `“${document.title}”` : `document ${intervention.docId}`} had never been written`;
    }
    case 'add-document':
      return `If “${intervention.title}” had also been in the record`;
    case 'as-of':
      return `If the record had been read as of ${intervention.date}`;
  }
}

/**
 * The statements this engine will not make from a counterfactual.
 *
 * Hard-coded rather than configurable: a caller that could remove them could
 * present a hypothetical as a finding, which is the one thing this layer exists
 * to prevent.
 */
export const NOT_CLAIMED = [
  'This is not a statement about the record. Nothing here says what was true, only what would follow if the record had been different.',
  'No clinical recommendation follows from this. A counterfactual result is not advice, and this system does not produce advice.',
  'A finding disappearing does not mean it was wrong. It means the remaining evidence no longer supports it.',
  'A finding appearing does not mean it is correct. It means the added evidence would support it under the same rules.',
] as const;

/**
 * Run a counterfactual.
 *
 * `branch` is the artifact produced by actually re-deriving with the
 * intervention applied. Passing null is legitimate and common: the question is
 * posed, and the system says plainly that it has not been answered rather than
 * estimating what the answer would be.
 */
export function counterfactual(
  intervention: Intervention,
  baseline: { identity: string; graph: HealthGraph; derivations: Derivation[] },
  branch: { identity: string; graph: HealthGraph; derivations: Derivation[] } | null,
  context: { courses?: MedicationCourse[]; spans?: ConditionSpan[] } = {},
): CounterfactualResult {
  const question = describeIntervention(intervention, baseline.graph);
  const notes: string[] = [];

  if (!branch) {
    notes.push(
      'The branch has not been run. This describes the question, not an answer to it: nothing below has been re-derived.',
    );
  }

  const before = new Map(baseline.derivations.map((entry) => [entry.id, entry]));
  const after = new Map((branch?.derivations ?? []).map((entry) => [entry.id, entry]));
  const changed: CounterfactualChange[] = [];

  if (branch) {
    for (const [id, derivation] of before) {
      const other = after.get(id);
      if (!other) {
        changed.push({
          id,
          ruleId: derivation.ruleId,
          title: derivation.title,
          change: 'lost',
          proof: proofDiff(derivation, null),
        });
        continue;
      }
      const diff = proofDiff(derivation, other);
      if (diff.counts.unchanged !== diff.lines.length || diff.premises.removed.length > 0) {
        changed.push({
          id,
          ruleId: derivation.ruleId,
          title: derivation.title,
          change: 'moved',
          proof: diff,
        });
      }
    }
    for (const [id, derivation] of after) {
      if (!before.has(id)) {
        changed.push({
          id,
          ruleId: derivation.ruleId,
          title: derivation.title,
          change: 'gained',
          proof: proofDiff(null, derivation),
        });
      }
    }
    changed.sort((a, b) => a.change.localeCompare(b.change) || a.id.localeCompare(b.id));
  }

  /*
   * Impact analysis is only meaningful for an intervention that removes
   * evidence. A rule withheld removes a finding rather than a fact, and asking
   * "what depends on this fact" of it would produce a misleading empty chain.
   */
  const impact =
    intervention.kind === 'withhold-document'
      ? impactOf({ kind: 'document', id: intervention.docId }, baseline.graph, baseline.derivations, context)
      : intervention.kind === 'withhold-rule'
        ? impactOf({ kind: 'rule', id: intervention.ruleId }, baseline.graph, baseline.derivations, context)
        : null;

  return {
    label: 'COUNTERFACTUAL',
    intervention,
    question,
    executed: branch !== null,
    baseline: { identity: baseline.identity, findings: baseline.derivations.length },
    interventionResult: branch
      ? { identity: branch.identity, findings: branch.derivations.length }
      : null,
    changed,
    impact,
    notClaimed: [...NOT_CLAIMED],
    notes,
  };
}
