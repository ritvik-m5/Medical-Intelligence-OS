import type { Derivation } from '../derive/types';
import type { HealthGraph } from '../types';
import type { BranchOperation } from '../platform/artifactStore';

/* ------------------------------------------------------------------ */
/* Evidence stability                                                  */
/*                                                                    */
/* A confidence number is a claim the engine makes about one proof. It  */
/* says nothing about whether the proof would survive a different       */
/* record, a withheld rule, or an earlier evaluation date.              */
/*                                                                    */
/* This computes the properties that answer that, from the artifact and  */
/* from branches that were actually run — never from a heuristic score.  */
/* Where a property cannot be measured it is `null`, and the            */
/* classification says so rather than implying stability.                */
/* ------------------------------------------------------------------ */

export type StabilityClass = 'stable' | 'sensitive' | 'fragile' | 'unsupported';

export interface BranchRun {
  label: string;
  operation: BranchOperation;
  derivations: Derivation[];
}

export interface StabilityProfile {
  derivationId: string;
  ruleId: string;
  title: string;
  /** Facts the proof rests on. */
  evidenceCount: number;
  /** Distinct documents those facts came from. */
  independentDocuments: number;
  /** Premise facts that still re-read from their own span. */
  supportingSpans: number;
  /** Premise facts carrying a flag that weakens them. */
  weakSpans: number;
  /** Longest path from a premise to the conclusion. */
  dependencyDepth: number;
  /** Distinct rules appearing in the proof. */
  rulesInvolved: number;
  /** Share of branch runs in which this finding is absent. `null` = not measured. */
  branchSensitivity: number | null;
  /** Share of earlier-dated branches in which it is absent. `null` = not measured. */
  dateSensitivity: number | null;
  classification: StabilityClass;
  /** Why the classification was reached, one reason per rule applied. */
  reasons: string[];
}

/** Flags that mean the fact itself is less reliable than it looks. */
const WEAKENING = new Set([
  'implausible_value',
  'ambiguous_status',
  'ambiguous_text',
  'low_ocr_quality',
  'unit_inferred',
  'unit_unusual',
  'unresolved_entity',
]);

/** True when the fact's span still resolves inside its own document. */
export function spanIsSound(graph: HealthGraph, factId: string): boolean {
  const fact = graph.facts.find((entry) => entry.id === factId);
  if (!fact) return false;
  const document = graph.documents.find((doc) => doc.id === fact.docId);
  if (!document) return false;
  const [start, end] = fact.span;
  return start >= 0 && end <= document.text.length && end > start;
}

/**
 * Profile one finding.
 *
 * `branches` are runs that were actually executed. Passing none is not an error:
 * it means branch sensitivity is unmeasured, and that is reported as such rather
 * than being scored as zero.
 */
export function stabilityOf(
  derivation: Derivation,
  graph: HealthGraph,
  branches: BranchRun[] = [],
): StabilityProfile {
  const premiseFacts = derivation.factIds
    .map((id) => graph.facts.find((fact) => fact.id === id))
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));

  const evidenceCount = derivation.factIds.length;
  const independentDocuments = new Set(premiseFacts.map((fact) => fact.docId)).size;
  const supportingSpans = derivation.factIds.filter((id) => spanIsSound(graph, id)).length;
  const weakSpans = premiseFacts.filter((fact) =>
    fact.flags.some((flag) => WEAKENING.has(flag)),
  ).length;
  const dependencyDepth = derivation.depth;
  const rulesInvolved = new Set(
    derivation.steps.filter((step) => step.ruleId).map((step) => step.ruleId as string),
  ).size;

  /* How often this finding fails to appear in a branch. */
  const absentIn = (runs: BranchRun[]) =>
    runs.length === 0
      ? null
      : runs.filter((run) => !run.derivations.some((entry) => entry.id === derivation.id)).length /
        runs.length;

  const branchSensitivity = absentIn(branches);
  const dateSensitivity = absentIn(branches.filter((run) => run.operation === 'as-of'));

  const reasons: string[] = [];
  let classification: StabilityClass = 'stable';

  if (evidenceCount === 0) {
    classification = 'unsupported';
    reasons.push('The proof cites no fact at all, so nothing in the record supports it.');
  } else if (derivation.grade === 'D') {
    classification = 'unsupported';
    reasons.push('The evidence grade is D: the proof rests on a source the engine cannot verify.');
  } else if (weakSpans > 0) {
    classification = 'fragile';
    reasons.push(
      `${weakSpans} of ${evidenceCount} premises carry a flag that weakens them — an implausible value, ambiguous wording, an inferred unit, or an unresolved entity.`,
    );
  } else if (evidenceCount === 1) {
    classification = 'fragile';
    reasons.push('A single fact supports the whole conclusion. Removing it removes the finding.');
  } else if (independentDocuments === 1) {
    classification = 'fragile';
    reasons.push(
      `All ${evidenceCount} premises come from one document, so the finding rests on a single source.`,
    );
  } else if (dateSensitivity !== null && dateSensitivity > 0) {
    classification = 'sensitive';
    reasons.push(
      `It is absent in ${Math.round(dateSensitivity * 100)}% of the branches evaluated at an earlier date, so it depends on when the record is read.`,
    );
  } else if (branchSensitivity !== null && branchSensitivity > 0) {
    classification = 'sensitive';
    reasons.push(
      `It is absent in ${Math.round(branchSensitivity * 100)}% of the branches run against this artifact, so it moves when the inputs do.`,
    );
  } else if (branchSensitivity === null) {
    reasons.push(
      'It rests on more than one document, no premise is flagged, and it is not a single-fact conclusion.',
    );
    reasons.push(
      'Branch sensitivity has not been measured: no branch has been run against this artifact, so nothing here says whether it would survive one.',
    );
  } else {
    reasons.push(
      `It survived all ${branches.length} branch${branches.length === 1 ? '' : 'es'} run against this artifact.`,
    );
  }

  if (supportingSpans < evidenceCount) {
    reasons.push(
      `${evidenceCount - supportingSpans} premise${evidenceCount - supportingSpans === 1 ? '' : 's'} do not re-read from a span, which the verification report will also show.`,
    );
  }

  /*
   * Branch sensitivity is reported whenever it has been measured, even when a
   * structural weakness already decided the classification — and its *absence*
   * is reported whenever it has not.
   *
   * The classification is a single word and has to choose; the reasons do not.
   * Dropping a measured fact because a different rule fired first would hide
   * exactly the thing a reader came to this profile to find, and leaving out the
   * unmeasured case would let a fragile finding read as though it had been tested.
   */
  if (branchSensitivity === null) {
    if (classification !== 'stable') {
      reasons.push(
        'Branch sensitivity has not been measured: no branch has been run against this artifact.',
      );
    }
  } else if (classification !== 'sensitive') {
    reasons.push(
      branchSensitivity === 0
        ? `Measured against ${branches.length} branch${branches.length === 1 ? '' : 'es'}: the finding survived all of them.`
        : `Measured against ${branches.length} branch${branches.length === 1 ? '' : 'es'}: it is absent in ${Math.round(branchSensitivity * 100)}%.`,
    );
  }
  if (dateSensitivity !== null && dateSensitivity > 0 && classification !== 'sensitive') {
    reasons.push(
      `Evaluated at an earlier date it is absent in ${Math.round(dateSensitivity * 100)}% of branches, so it also depends on when the record is read.`,
    );
  }

  return {
    derivationId: derivation.id,
    ruleId: derivation.ruleId,
    title: derivation.title,
    evidenceCount,
    independentDocuments,
    supportingSpans,
    weakSpans,
    dependencyDepth,
    rulesInvolved,
    branchSensitivity,
    dateSensitivity,
    classification,
    reasons,
  };
}

/** Profile every finding, and summarise the distribution. */
export function stabilityReport(
  derivations: Derivation[],
  graph: HealthGraph,
  branches: BranchRun[] = [],
): { profiles: StabilityProfile[]; byClass: Record<StabilityClass, number>; notes: string[] } {
  const profiles = derivations.map((derivation) => stabilityOf(derivation, graph, branches));
  const byClass: Record<StabilityClass, number> = {
    stable: 0,
    sensitive: 0,
    fragile: 0,
    unsupported: 0,
  };
  for (const profile of profiles) byClass[profile.classification] += 1;

  const notes = [
    'These labels are derived from the proof and from branches that were actually run. They are not confidence scores, and they do not replace one.',
  ];
  if (branches.length === 0) {
    notes.push(
      'No branch has been run against this artifact, so branch sensitivity is unmeasured for every finding. Run a branch to measure it.',
    );
  }

  return { profiles, byClass, notes };
}
