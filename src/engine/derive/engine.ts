import type { Derivation, DerivationCategory, RuleId, Severity } from './types';
import { finalizeDerivation, type RuleContext, type RuleOutput } from './rule';
import { buildConditionSpans, buildMedicationCourses } from './intervals';
import { allergyOverlapsCourse, listContradictsCourse } from './rulesTemporal';
import { contraindicatedPairs, duplicateTherapy } from './rulesSafety';
import { monitoringAbsent, unresolvedDiscontinuation } from './rulesGaps';
import { demographicMismatch, documentationSilence } from './rulesSilence';
import { immunizationDue } from './rulesVaccine';
import { rapidChange, thresholdCrossed } from './rulesTrend';
import { crossRecordDoseDiscrepancy, implausibleValues, sameDayConflict, unitMismatch, valueFlagMismatch } from './rulesQuality';
import { findContradictions, qualityFlagContradictions } from '../contradiction';
import type { Fact, HealthGraph, ISODate } from '../types';

/* ------------------------------------------------------------------ */
/* The inference engine                                                */
/*                                                                    */
/* One pass over the graph, every rule, one output type. The engine    */
/* owns ordering, de-duplication and ranking, so a new rule is a pure   */
/* function and nothing else in the platform has to change.            */
/* ------------------------------------------------------------------ */

export function buildRuleContext(graph: HealthGraph, asOf: ISODate): RuleContext {
  return {
    graph,
    asOf,
    courses: buildMedicationCourses(graph, asOf),
    spans: buildConditionSpans(graph, asOf),
    // Detected once. Rules that care about disagreement read this rather than
    // scanning the graph again, so there is exactly one answer to "do these two
    // documents disagree".
    conflicts: [...findContradictions(graph), ...qualityFlagContradictions(graph)],
    factsById: new Map(graph.facts.map((f) => [f.id, f])),
  };
}

export type RuleFn = (ctx: RuleContext) => RuleOutput[];

export interface RuleRegistryEntry {
  id: RuleId;
  category: DerivationCategory;
  describe: string;
  run: RuleFn;
}

/**
 * The rule registry.
 *
 * Everything the platform concludes is produced by an entry here, which is what
 * makes the surface area auditable: there is a finite, inspectable list of the
 * ways this system is capable of forming an opinion.
 */
export const RULE_REGISTRY: RuleRegistryEntry[] = [
  {
    id: 'temporal.list_contradicts_course',
    category: 'consistency',
    describe:
      'A sentence says a medication was stopped and a later list still presents it as current.',
    run: listContradictsCourse,
  },
  {
    id: 'temporal.allergy_prescription_overlap',
    category: 'safety',
    describe: 'A medication course interval overlaps a recorded allergy interval.',
    run: allergyOverlapsCourse,
  },
  {
    id: 'safety.duplicate_therapy',
    category: 'safety',
    describe: 'Two drugs of the same declared class have overlapping active courses.',
    run: duplicateTherapy,
  },
  {
    id: 'safety.contraindicated_pair',
    category: 'safety',
    describe: 'A declared interaction pair is co-prescribed over overlapping periods.',
    run: contraindicatedPairs,
  },
  {
    id: 'gap.monitoring_absent',
    category: 'gap',
    describe: 'An open condition has no documented monitoring measurement inside the window.',
    run: monitoringAbsent,
  },
  {
    id: 'gap.unresolved_discontinuation',
    category: 'gap',
    describe: 'A therapy was stopped, its indication is still open, and nothing replaced it.',
    run: unresolvedDiscontinuation,
  },
  {
    id: 'gap.immunization_due',
    category: 'gap',
    describe: 'A routine annual immunization has no documented dose in the last year.',
    run: immunizationDue,
  },
  {
    id: 'gap.documentation_silence',
    category: 'gap',
    describe: 'An open condition has not been mentioned for a long period.',
    run: documentationSilence,
  },
  {
    id: 'trend.threshold_crossed',
    category: 'trend',
    describe: 'The latest value of a measurement sits outside its stated reference range.',
    run: thresholdCrossed,
  },
  {
    id: 'trend.rapid_change',
    category: 'trend',
    describe: 'A fitted rate of change exceeds the declared threshold for the concept.',
    run: rapidChange,
  },
  {
    id: 'quality.implausible_value',
    category: 'quality',
    describe: 'A value lies outside the plausible range declared for its concept.',
    run: implausibleValues,
  },
  {
    id: 'quality.unit_mismatch',
    category: 'quality',
    describe: 'One measurement is reported in more than one unit across documents.',
    run: unitMismatch,
  },
  {
    id: 'quality.same_day_conflict',
    category: 'quality',
    describe: 'Two documents give different values for one measurement on one day.',
    run: sameDayConflict,
  },
  {
    id: 'quality.demographic_mismatch',
    category: 'quality',
    describe: 'An administrative field is recorded with two different values.',
    run: demographicMismatch,
  },
  {
    id: 'quality.value_flag_mismatch',
    category: 'quality',
    describe: 'A direction flag contradicts the numeric value in the same row.',
    run: valueFlagMismatch,
  },
  {
    id: 'quality.cross_record_dose_discrepancy',
    category: 'quality',
    describe: 'The same medication is documented at two different doses across records.',
    run: crossRecordDoseDiscrepancy,
  },
];

export interface DeriveOptions {
  /** Restrict to specific rules. Used by the cohort view and by tests. */
  only?: RuleId[];
  /** Drop findings whose confidence is below this floor. */
  minConfidence?: number;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Run every rule over the graph and return ranked derivations.
 *
 * Deterministic: rules run in registry order and outputs are sorted by severity,
 * then confidence, then most recent evidence. Two runs over the same graph
 * produce the same list in the same order, which is a requirement for anything
 * that will be audited.
 */
export function derive(
  graph: HealthGraph,
  asOf: ISODate,
  options: DeriveOptions = {},
): Derivation[] {
  const ctx = buildRuleContext(graph, asOf);
  const rules = options.only
    ? RULE_REGISTRY.filter((entry) => options.only!.includes(entry.id))
    : RULE_REGISTRY;

  const outputs: RuleOutput[] = [];
  for (const entry of rules) {
    try {
      outputs.push(...entry.run(ctx));
    } catch {
      // A rule that throws must not take the platform down with it. The failure
      // is swallowed here and surfaced by ruleHealth() instead.
      continue;
    }
  }

  const seen = new Set<string>();
  const derivations: Derivation[] = [];
  for (const output of outputs) {
    const derivation = finalizeDerivation(output);
    if (seen.has(derivation.id)) continue;
    seen.add(derivation.id);
    if (options.minConfidence !== undefined && derivation.confidence < options.minConfidence) {
      continue;
    }
    derivations.push(derivation);
  }

  return derivations.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.confidence - a.confidence ||
      b.window.end.localeCompare(a.window.end),
  );
}

export interface DerivationSummary {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<Severity, number>;
  highConfidence: number;
  meanConfidence: number;
  meanDepth: number;
}

export function derivationSummary(derivations: Derivation[]): DerivationSummary {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  let highConfidence = 0;
  let confidenceSum = 0;
  let depthSum = 0;
  for (const derivation of derivations) {
    byCategory[derivation.category] = (byCategory[derivation.category] ?? 0) + 1;
    bySeverity[derivation.severity] += 1;
    if (derivation.confidence >= 0.8) highConfidence += 1;
    confidenceSum += derivation.confidence;
    depthSum += derivation.depth;
  }
  const n = Math.max(1, derivations.length);
  return {
    total: derivations.length,
    byCategory,
    bySeverity,
    highConfidence,
    meanConfidence: Math.round((confidenceSum / n) * 100) / 100,
    meanDepth: Math.round((depthSum / n) * 100) / 100,
  };
}

export interface RuleHealth {
  id: RuleId;
  category: DerivationCategory;
  describe: string;
  produced: number;
  failed: boolean;
}

/** How many findings each rule produced, and whether it threw on this graph. */
export function ruleHealth(graph: HealthGraph, asOf: ISODate): RuleHealth[] {
  const ctx = buildRuleContext(graph, asOf);
  return RULE_REGISTRY.map((entry) => {
    try {
      const produced = entry.run(ctx).length;
      return {
        id: entry.id,
        category: entry.category,
        describe: entry.describe,
        produced,
        failed: false,
      };
    } catch {
      return {
        id: entry.id,
        category: entry.category,
        describe: entry.describe,
        produced: 0,
        failed: true,
      };
    }
  });
}

export function factMapOf(graph: HealthGraph): Map<string, Fact> {
  return new Map(graph.facts.map((f) => [f.id, f]));
}

export function derivationsForEntity(derivations: Derivation[], entityKey: string): Derivation[] {
  return derivations.filter((d) => d.entityKeys.includes(entityKey));
}

export function derivationsByCategory(
  derivations: Derivation[],
  category: DerivationCategory,
): Derivation[] {
  return derivations.filter((d) => d.category === category);
}

