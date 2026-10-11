import type { HealthGraph, ISODate } from '../types';
import type { ConditionSpan, Derivation, MedicationCourse, Severity } from '../derive/types';
import { derive, derivationSummary, type DerivationSummary } from '../derive/engine';
import { buildConditionSpans, buildMedicationCourses } from '../derive/intervals';
import { assessQuality } from './quality';
import type { QualityReport } from '../derive/types';

/* ------------------------------------------------------------------ */
/* Cohort layer                                                        */
/*                                                                    */
/* The same engines, iterated over many subjects. This is what turns a */
/* single-patient tool into a platform: a rule is written once and      */
/* evaluated across a population, and the prevalence of each finding    */
/* becomes a first-class number rather than an anecdote.                */
/* ------------------------------------------------------------------ */

export interface CohortSubject {
  id: string;
  label: string;
  graph: HealthGraph;
}

export interface SubjectAnalysis {
  id: string;
  label: string;
  derivations: Derivation[];
  summary: DerivationSummary;
  quality: QualityReport;
  courses: MedicationCourse[];
  spans: ConditionSpan[];
  counts: {
    documents: number;
    facts: number;
    entities: number;
    activeConditions: number;
    activeMedications: number;
  };
}

export function analyseSubject(subject: CohortSubject, asOf: ISODate): SubjectAnalysis {
  const derivations = derive(subject.graph, asOf);
  const courses = buildMedicationCourses(subject.graph);
  const spans = buildConditionSpans(subject.graph);
  return {
    id: subject.id,
    label: subject.label,
    derivations,
    summary: derivationSummary(derivations),
    quality: assessQuality({ graph: subject.graph, derivations, asOf }),
    courses,
    spans,
    counts: {
      documents: subject.graph.documents.length,
      facts: subject.graph.facts.length,
      entities: subject.graph.entities.length,
      activeConditions: spans.filter((s) => s.state === 'open').length,
      activeMedications: courses.filter((c) => c.state === 'open').length,
    },
  };
}

export interface RulePrevalence {
  ruleId: string;
  subjects: number;
  findings: number;
  share: number;
}

export interface CohortAnalysis {
  asOf: ISODate;
  subjects: SubjectAnalysis[];
  rulePrevalence: RulePrevalence[];
  categoryTotals: Record<string, number>;
  severityTotals: Record<Severity, number>;
  qualityMean: number;
  qualityLowest: { id: string; label: string; score: number } | null;
  totalFindings: number;
  notes: string[];
}

export function analyseCohort(subjects: CohortSubject[], asOf: ISODate): CohortAnalysis {
  const analyses = subjects.map((subject) => analyseSubject(subject, asOf));

  const ruleCounts = new Map<string, { subjects: Set<string>; findings: number }>();
  const categoryTotals: Record<string, number> = {};
  const severityTotals: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  let totalFindings = 0;

  for (const analysis of analyses) {
    for (const derivation of analysis.derivations) {
      const entry = ruleCounts.get(derivation.ruleId) ?? {
        subjects: new Set<string>(),
        findings: 0,
      };
      entry.subjects.add(analysis.id);
      entry.findings += 1;
      ruleCounts.set(derivation.ruleId, entry);

      categoryTotals[derivation.category] = (categoryTotals[derivation.category] ?? 0) + 1;
      severityTotals[derivation.severity] += 1;
      totalFindings += 1;
    }
  }

  const rulePrevalence: RulePrevalence[] = Array.from(ruleCounts.entries())
    .map(([ruleId, entry]) => ({
      ruleId,
      subjects: entry.subjects.size,
      findings: entry.findings,
      share: analyses.length === 0 ? 0 : Math.round((entry.subjects.size / analyses.length) * 100),
    }))
    .sort((a, b) => b.subjects - a.subjects || b.findings - a.findings);

  const qualityScores = analyses.map((a) => a.quality.overall);
  const qualityMean =
    qualityScores.length === 0
      ? 0
      : Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length);

  const lowest = [...analyses].sort((a, b) => a.quality.overall - b.quality.overall)[0];
  const qualityLowest = lowest
    ? { id: lowest.id, label: lowest.label, score: lowest.quality.overall }
    : null;

  const notes: string[] = [
    'Prevalence here is prevalence within this cohort of imported records, not in a population. Nothing in this view is an epidemiological estimate.',
    'Rules fire on documentation. A subject with no findings may have a well-kept record, a sparse record, or no imported documents at all.',
  ];
  if (analyses.some((a) => a.counts.documents < 3)) {
    notes.push(
      'At least one subject has fewer than three documents, so rule prevalence is dominated by import completeness rather than by care.',
    );
  }

  return {
    asOf,
    subjects: analyses,
    rulePrevalence,
    categoryTotals,
    severityTotals,
    qualityMean,
    qualityLowest,
    totalFindings,
    notes,
  };
}


/* ------------------------------------------------------------------ */
/* Cohort queries                                                      */
/*                                                                    */
/* Each query is a predicate over an analysed subject plus the caveat   */
/* that must be shown with the result. A cohort answer without its      */
/* caveat is a statistic pretending to be a finding.                    */
/* ------------------------------------------------------------------ */

export interface CohortQuery {
  id: string;
  label: string;
  question: string;
  predicate: (analysis: SubjectAnalysis) => boolean;
  /** Rules whose findings are worth showing for a subject that matched. */
  rules?: string[];
  caveat: string;
}

function hasOpenCourseMatching(
  analysis: SubjectAnalysis,
  test: (course: MedicationCourse) => boolean,
): boolean {
  return analysis.courses.some((course) => course.state === 'open' && test(course));
}

export const COHORT_QUERIES: CohortQuery[] = [
  {
    id: 'high-severity',
    label: 'Has a high-severity finding',
    question: 'Which subjects have at least one high-severity derivation?',
    predicate: (a) => a.derivations.some((d) => d.severity === 'high'),
    rules: [
      'temporal.list_contradicts_course',
      'temporal.allergy_prescription_overlap',
      'quality.implausible_value',
      'quality.same_day_conflict',
      'quality.demographic_mismatch',
    ],
    caveat:
      'High severity means the rule considers the disagreement consequential, not that the subject is unwell.',
  },
  {
    id: 'statin-no-lipids',
    label: 'On a statin, monitoring gap',
    question: 'Which subjects are on a statin with a monitoring gap flagged?',
    predicate: (a) =>
      hasOpenCourseMatching(a, (c) => c.drugClass === 'Statin') &&
      a.derivations.some((d) => d.ruleId === 'gap.monitoring_absent'),
    rules: ['gap.monitoring_absent'],
    caveat:
      'Absence of a result in the record is not absence of the test. Referral and laboratory data often sit outside an imported record.',
  },
  {
    id: 'duplicate-class',
    label: 'Two drugs of the same class',
    question: 'Which subjects have overlapping courses within one therapeutic class?',
    predicate: (a) => a.derivations.some((d) => d.ruleId === 'safety.duplicate_therapy'),
    rules: ['safety.duplicate_therapy', 'safety.contraindicated_pair'],
    caveat:
      'Combination therapy within a class is occasionally intentional, so this is a review prompt rather than an error list.',
  },
  {
    id: 'unmonitored-condition',
    label: 'Open condition, monitoring missing',
    question: 'Which subjects have an open condition with no documented monitoring?',
    predicate: (a) => a.derivations.some((d) => d.ruleId === 'gap.monitoring_absent'),
    rules: ['gap.monitoring_absent'],
    caveat: 'Depends entirely on how completely the record was imported.',
  },
  {
    id: 'low-quality-record',
    label: 'Record quality below 70',
    question: 'Which records are hardest to reason over?',
    predicate: (a) => a.quality.overall < 70,
    rules: ['quality.unit_mismatch', 'quality.implausible_value'],
    caveat:
      'A low score is a statement about the documents, not about the care the subject received.',
  },
  {
    id: 'data-quality-only',
    label: 'Quality problems, no clinical conflict',
    question: 'Which subjects have quality findings but no clinical disagreements?',
    predicate: (a) =>
      a.derivations.some((d) => d.category === 'quality') &&
      !a.derivations.some((d) => d.category === 'consistency' || d.category === 'safety'),
    rules: [
      'quality.implausible_value',
      'quality.same_day_conflict',
      'quality.unit_mismatch',
      'quality.restated_value',
    ],
    caveat: 'This is the pattern of a clean record with transcription problems.',
  },
  {
    id: 'overdue-immunization',
    label: 'Routine immunization overdue',
    question: 'Which subjects have no documented annual immunization?',
    predicate: (a) => a.derivations.some((d) => d.ruleId === 'gap.immunization_due'),
    rules: ['gap.immunization_due'],
    caveat: 'Vaccinations given elsewhere are frequently absent from an imported record.',
  },
];

export function runCohortQuery(analysis: CohortAnalysis, query: CohortQuery): SubjectAnalysis[] {
  return analysis.subjects.filter(query.predicate);
}
