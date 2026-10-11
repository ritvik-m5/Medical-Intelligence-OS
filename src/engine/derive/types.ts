import type { DocKind, ISODate, Severity } from '../types';

export type { Severity };

/* ------------------------------------------------------------------ */
/* The derivation model                                                */
/*                                                                    */
/* Everything this system concludes — a contradiction, a care gap, a   */
/* trend, a quality problem, an answer — is emitted as a Derivation: a */
/* directed acyclic graph of steps that ends in exactly one conclusion. */
/*                                                                    */
/* A conclusion is never a sentence. It is a proof object that a       */
/* machine can check and a person can traverse, down to the characters */
/* of the source documents. That property is what makes the platform   */
/* auditable, and it is the thing that cannot be copied by putting a   */
/* language model in front of a PDF.                                   */
/* ------------------------------------------------------------------ */

export type DerivationCategory =
  | 'consistency'
  | 'safety'
  | 'gap'
  | 'trend'
  | 'quality'
  | 'evidence';

export const CATEGORY_LABEL: Record<DerivationCategory, string> = {
  consistency: 'Consistency',
  safety: 'Safety',
  gap: 'Care gap',
  trend: 'Trajectory',
  quality: 'Data quality',
  evidence: 'Evidence',
};

export type RuleId =
  | 'temporal.medication_overlap_conflict'
  | 'temporal.status_reversal'
  | 'temporal.list_contradicts_course'
  | 'temporal.allergy_prescription_overlap'
  | 'safety.duplicate_therapy'
  | 'safety.contraindicated_pair'
  | 'gap.monitoring_absent'
  | 'gap.unresolved_discontinuation'
  | 'gap.immunization_due'
  | 'gap.documentation_silence'
  | 'trend.threshold_crossed'
  | 'trend.rapid_change'
  | 'trend.reversal'
  | 'quality.implausible_value'
  | 'quality.unit_mismatch'
  | 'quality.restated_value'
  | 'quality.same_day_conflict'
  | 'quality.demographic_mismatch'
  | 'quality.value_flag_mismatch'
  | 'quality.cross_record_dose_discrepancy'
  | 'evidence.external_reference';

export const RULE_LABEL: Record<RuleId, string> = {
  'temporal.medication_overlap_conflict': 'Medication courses conflict',
  'temporal.status_reversal': 'Status reversed without a documented restart',
  'temporal.list_contradicts_course': 'Medication list contradicts the documented course',
  'temporal.allergy_prescription_overlap': 'Prescription overlaps a recorded allergy',
  'safety.duplicate_therapy': 'Two medications of the same class active at once',
  'safety.contraindicated_pair': 'Co-prescribed pair with a documented interaction',
  'gap.monitoring_absent': 'Expected monitoring not documented',
  'gap.unresolved_discontinuation': 'Stopped therapy with no documented alternative',
  'gap.immunization_due': 'Routine immunization overdue',
  'gap.documentation_silence': 'Active problem silent in the record',
  'trend.threshold_crossed': 'Measurement crossed a clinical threshold',
  'trend.rapid_change': 'Rate of change is unusually fast',
  'trend.reversal': 'Trajectory reversed direction',
  'quality.implausible_value': 'Value outside the plausible range',
  'quality.unit_mismatch': 'Same measurement reported in different units',
  'quality.restated_value': 'Value restated from an earlier period',
  'quality.same_day_conflict': 'Same measurement, same day, two values',
  'quality.demographic_mismatch': 'Administrative field recorded inconsistently',
  'quality.value_flag_mismatch': 'Reported flag contradicts the reported value',
  'quality.cross_record_dose_discrepancy': 'Same medication at two doses across records',
  'evidence.external_reference': 'External reference material linked to this concept',
};

export type StepKind = 'premise' | 'interval' | 'rule' | 'conclusion';

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  premise: 'Documented',
  interval: 'Derived interval',
  rule: 'Rule applied',
  conclusion: 'Conclusion',
};

/** One node of the proof. */
export interface DerivationStep {
  id: string;
  kind: StepKind;
  label: string;
  /** For premise and interval steps: the facts this node rests on. */
  factIds: string[];
  docIds: string[];
  /** For rule steps: which rule fired. */
  ruleId?: RuleId;
  /** Ids of the steps this node consumes. A DAG, never a cycle. */
  dependsOn: string[];
  /** Why this node follows from its dependencies. Shown to the user. */
  justification: string;
  confidence: number;
}

export type EvidenceGrade = 'A' | 'B' | 'C' | 'D';

export const GRADE_LABEL: Record<EvidenceGrade, string> = {
  A: 'Grade A — directly traceable primary source',
  B: 'Grade B — clinical narrative',
  C: 'Grade C — patient-reported or derived',
  D: 'Grade D — weak or unverifiable',
};

/**
 * What a grade measures, in one sentence, for the proof viewer.
 *
 * A grade is about *provenance* — how directly the premises trace back to a
 * primary source — and never about whether a flagged value is trustworthy.
 * A grade-A lab row can still carry an implausible value; the two properties
 * are deliberately independent.
 */
export const GRADE_MEANING =
  'Grade measures provenance only: how directly the premises trace to a primary source. It never certifies that a value is correct — a grade-A row can still be flagged for data quality.';

export interface GuidelineRef {
  title: string;
  source: string;
  url: string;
}

export interface Derivation {
  id: string;
  ruleId: RuleId;
  category: DerivationCategory;
  severity: Severity;
  title: string;
  /** One sentence stating what was derived. Never advice. */
  statement: string;
  /** The proof, topologically ordered: premises first, conclusion last. */
  steps: DerivationStep[];
  conclusionId: string;
  /** Longest path length from a premise to the conclusion. */
  depth: number;
  factIds: string[];
  docIds: string[];
  entityKeys: string[];
  window: { start: ISODate; end: ISODate };
  confidence: number;
  grade: EvidenceGrade;
  /** The single question that would resolve or clear this finding. */
  question: string;
  /** What the engine refuses to conclude. Always populated. */
  notConcluded: string;
  /** What documentation would clear this finding. */
  satisfiableBy?: string;
  guideline?: GuidelineRef;
}

export const DOC_KIND_AUTHORITY_HINT: Partial<Record<DocKind, string>> = {
  lab_report: 'Structured instrument output',
  pathology_report: 'Structured instrument output',
};

/* ------------------------------------------------------------------ */
/* Intervals                                                           */
/* ------------------------------------------------------------------ */

/** Half-open interval: `end` undefined means still open. */
export interface Interval {
  start: ISODate;
  end?: ISODate;
}

export type IntervalRelation =
  | 'before'
  | 'meets'
  | 'overlaps'
  | 'finished-by'
  | 'contains'
  | 'starts'
  | 'equals'
  | 'started-by'
  | 'during'
  | 'finishes'
  | 'overlapped-by'
  | 'met-by'
  | 'after';

/**
 * A medication course reconstructed from documentation.
 *
 * This is the object the interval rules reason over: not "a fact on a date" but
 * "the period during which the record supports that this drug was being taken".
 * The distinction is the whole reason the temporal rules can be precise.
 */
export interface MedicationCourse {
  entityKey: string;
  label: string;
  interval: Interval;
  startFactId: string;
  endFactId?: string;
  /** `open` = no later document closes it. Not the same as "still taking". */
  state: 'open' | 'closed';
  dose?: string;
  drugClass?: string;
  /** True when the closing statement came from a list rather than a sentence. */
  closedByList: boolean;
  confidence: number;
}

/** A condition's documented span. */
export interface ConditionSpan {
  entityKey: string;
  label: string;
  interval: Interval;
  startFactId: string;
  endFactId?: string;
  state: 'open' | 'closed';
  confidence: number;
}

export interface TrajectoryPoint {
  date: ISODate;
  value: number;
  factId: string;
  docId: string;
  flagged: boolean;
}

export interface Trajectory {
  entityKey: string;
  label: string;
  unit?: string;
  points: TrajectoryPoint[];
  n: number;
  /** Ordinary least squares slope, in units per year. */
  slopePerYear: number;
  intercept: number;
  /** Coefficient of determination. A low R² means the line is a poor summary. */
  r2: number;
  direction: 'rising' | 'falling' | 'stable' | 'insufficient';
  /** Mean extraction confidence of the points. */
  confidence: number;
  /** Days of history the fit covers. */
  spanDays: number;
  threshold?: {
    value: number;
    label: string;
    direction: 'above' | 'below';
    crossedOn?: ISODate;
    daysToCrossing?: number;
    extrapolated: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Record quality                                                      */
/* ------------------------------------------------------------------ */

export interface QualityDimension {
  id: string;
  label: string;
  /** 0-100. */
  score: number;
  detail: string;
  /** Facts or documents that justify the score. */
  evidenceFactIds: string[];
}

export interface QualityReport {
  overall: number;
  grade: EvidenceGrade;
  dimensions: QualityDimension[];
  generatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export type AuditKind =
  | 'ingest'
  | 'derive'
  | 'query'
  | 'export'
  | 'redact'
  | 'view'
  | 'reset';

export interface AuditEntry {
  id: string;
  at: string;
  kind: AuditKind;
  summary: string;
  /** What the action touched. Kept so an export can be reconstructed. */
  factIds: string[];
  docIds: string[];
  detail?: string;
}

