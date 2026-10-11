import type { Contradiction, Fact, HealthGraph, ISODate } from '../types';
import type {
  ConditionSpan,
  Derivation,
  DerivationCategory,
  GuidelineRef,
  MedicationCourse,
  RuleId,
  Severity,
} from './types';
import { ProofBuilder, combineConfidence, gradeFor } from './grade';

export { ProofBuilder, combineConfidence, factAuthority, gradeFor, SOURCE_AUTHORITY, AUTHORITY_NOTE } from './grade';

/* ------------------------------------------------------------------ */
/* Rule scaffolding                                                    */
/*                                                                    */
/* Every rule returns the same shape. A rule may not emit a conclusion  */
/* without a proof, a question, and a statement of what it refuses to   */
/* conclude — the type system and the builder both enforce it.          */
/* ------------------------------------------------------------------ */

export interface RuleContext {
  graph: HealthGraph;
  asOf: ISODate;
  courses: MedicationCourse[];
  spans: ConditionSpan[];
  /**
   * Raw document-versus-document disagreements, detected once by
   * `findContradictions`.
   *
   * This sits beside `courses` and `spans` because it is the same kind of thing:
   * a reconstruction of the graph that rules consume, rather than a property of
   * it. Rules that detect disagreement read this instead of scanning the graph
   * themselves, so the two layers cannot disagree about whether a disagreement
   * exists. Rules that reason over time still build their own intervals, because
   * that is inference rather than detection.
   */
  conflicts: Contradiction[];
  factsById: Map<string, Fact>;
}

export interface RuleOutput {
  ruleId: RuleId;
  category: DerivationCategory;
  severity: Severity;
  title: string;
  statement: string;
  builder: ProofBuilder;
  conclusionId: string;
  /** Every fact the proof rests on. Also drives the evidence grade. */
  premiseFacts: Fact[];
  entityKeys: string[];
  window: { start: ISODate; end: ISODate };
  question: string;
  notConcluded: string;
  satisfiableBy?: string;
  guideline?: GuidelineRef;
}

/** Reliability of each rule as an inference. Declared, not hidden. */
export const RULE_RELIABILITY: Partial<Record<RuleId, number>> = {
  'temporal.medication_overlap_conflict': 0.94,
  'temporal.status_reversal': 0.95,
  'temporal.list_contradicts_course': 0.9,
  'temporal.allergy_prescription_overlap': 0.82,
  'safety.duplicate_therapy': 0.8,
  'safety.contraindicated_pair': 0.78,
  'gap.monitoring_absent': 0.86,
  'gap.unresolved_discontinuation': 0.8,
  'gap.immunization_due': 0.84,
  'gap.documentation_silence': 0.7,
  'trend.threshold_crossed': 0.88,
  'trend.rapid_change': 0.72,
  'trend.reversal': 0.7,
  'quality.implausible_value': 0.9,
  'quality.unit_mismatch': 0.97,
  'quality.value_flag_mismatch': 0.93,
  'quality.cross_record_dose_discrepancy': 0.8,
  'quality.restated_value': 0.93,
  'quality.same_day_conflict': 0.95,
  'quality.demographic_mismatch': 0.96,
  'evidence.external_reference': 0.99,
};

/**
 * Turn a rule output into a Derivation.
 *
 * Confidence is never set by hand: it is the propagation of the premise
 * authorities through the rule's own declared reliability. That is why two
 * findings built on the same evidence always score the same, and why a finding
 * resting on a patient questionnaire can never outrank one resting on a lab
 * report.
 */
export function finalizeDerivation(output: RuleOutput): Derivation {
  const steps = output.builder.all;
  const premiseConfidences = steps
    .filter((s) => s.kind === 'premise' || s.kind === 'interval')
    .map((s) => s.confidence);
  const reliability = RULE_RELIABILITY[output.ruleId] ?? 0.85;
  const confidence = combineConfidence(
    premiseConfidences.length > 0 ? premiseConfidences : [0.5],
    'all',
    reliability,
  );

  return {
    id: `drv_${output.ruleId.replace(/[^a-z0-9]/gi, '_')}_${output.conclusionId}`,
    ruleId: output.ruleId,
    category: output.category,
    severity: output.severity,
    title: output.title,
    statement: output.statement,
    steps,
    conclusionId: output.conclusionId,
    depth: output.builder.depthOf(output.conclusionId),
    factIds: Array.from(new Set(steps.flatMap((s) => s.factIds))),
    docIds: Array.from(new Set(steps.flatMap((s) => s.docIds))),
    entityKeys: Array.from(new Set(output.entityKeys)),
    window: output.window,
    confidence,
    grade: gradeFor(output.premiseFacts),
    question: output.question,
    notConcluded: output.notConcluded,
    satisfiableBy: output.satisfiableBy,
    guideline: output.guideline,
  };
}

export function windowOf(facts: Fact[]): { start: ISODate; end: ISODate } {
  const dates = facts.map((f) => f.occurredAt).sort();
  return { start: dates[0] ?? '2000-01-01', end: dates[dates.length - 1] ?? '2000-01-01' };
}

