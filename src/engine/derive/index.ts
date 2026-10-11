export { derive, derivationSummary, ruleHealth, RULE_REGISTRY, buildRuleContext } from './engine';
export type { DeriveOptions, RuleHealth, RuleRegistryEntry, RuleFn } from './engine';
export { buildMedicationCourses, buildConditionSpans, coursesFor, spansFor, relate, intersects, overlapDays, intervalContains, describeRelation, factInterval } from './intervals';
export { buildTrajectory, buildAllTrajectories, fitLine } from './trajectory';
export { gradeFor, gradeScore, factAuthority, combineConfidence, SOURCE_AUTHORITY, AUTHORITY_NOTE, ProofBuilder } from './grade';
export {
  CATEGORY_LABEL,
  RULE_LABEL,
  STEP_KIND_LABEL,
  GRADE_LABEL,
} from './types';
export type {
  Derivation,
  DerivationStep,
  DerivationCategory,
  RuleId,
  StepKind,
  EvidenceGrade,
  GuidelineRef,
  Interval,
  IntervalRelation,
  MedicationCourse,
  ConditionSpan,
  Trajectory,
  TrajectoryPoint,
  QualityDimension,
  QualityReport,
  AuditEntry,
  AuditKind,
} from './types';
