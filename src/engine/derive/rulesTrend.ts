import type { RuleContext, RuleOutput } from './rule';
import { ProofBuilder, RULE_RELIABILITY, combineConfidence, factAuthority, windowOf } from './rule';
import { buildTrajectory } from './trajectory';
import { formatDate } from '../text/normalize';

/* ------------------------------------------------------------------ */
/* Trajectory rules                                                    */
/*                                                                    */
/* These rules only speak about direction when the fitted line actually */
/* explains the data. Every projection is labelled as extrapolation.    */
/* ------------------------------------------------------------------ */

const MIN_R2_FOR_DIRECTION = 0.4;

/** A measurement whose latest value sits outside its reference range. */
export function thresholdCrossed(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const entity of ctx.graph.entities) {
    if (entity.kind !== 'measurement' && entity.kind !== 'vital') continue;
    const trajectory = buildTrajectory(ctx.graph, entity.key, { asOf: ctx.asOf });
    if (!trajectory || trajectory.n < 2) continue;
    if (trajectory.direction === 'insufficient') continue;

    const latestPoint = trajectory.points[trajectory.points.length - 1];
    const latestFact = ctx.factsById.get(latestPoint.factId);
    if (!latestFact) continue;
    const ref = latestFact.referenceRange;
    if (!ref || (ref.low === undefined && ref.high === undefined)) continue;

    const beyondHigh = ref.high !== undefined && latestPoint.value > ref.high;
    const beyondLow = ref.low !== undefined && latestPoint.value < ref.low;
    if (!beyondHigh && !beyondLow) continue;

    const direction = beyondHigh ? 'above' : 'below';
    const limit = beyondHigh ? (ref.high as number) : (ref.low as number);
    const firstPoint = trajectory.points[0];
    const firstFact = ctx.factsById.get(firstPoint.factId);
    if (!firstFact) continue;

    const builder = new ProofBuilder(`threshold_${entity.key}_${latestFact.id}`);
    const firstStep = builder.premise(
      firstFact,
      `${entity.label} ${firstPoint.value} ${trajectory.unit ?? ''} on ${firstPoint.date}`.trim(),
    );
    const latestStep = builder.premise(
      latestFact,
      `${entity.label} ${latestPoint.value} ${trajectory.unit ?? ''} on ${latestPoint.date}`.trim(),
      `Latest reading in the series. The reference range stated with it is ${ref.text ?? `${ref.low ?? ''}–${ref.high ?? ''}`}.`,
    );
    const fitStep = builder.rule(
      'trend.threshold_crossed',
      trajectory.n >= 3
        ? `Linear fit over ${trajectory.n} readings: ${trajectory.slopePerYear} ${trajectory.unit ?? ''}/year, R² ${trajectory.r2}`
        : `Only ${trajectory.n} readings, so no line was fitted`,
      [firstStep, latestStep],
      trajectory.n >= 3
        ? `Ordinary least squares over ${trajectory.n} readings spanning ${trajectory.spanDays} days. R² of ${trajectory.r2} means the line explains about ${Math.round(trajectory.r2 * 100)} percent of the variation.`
        : 'With fewer than three readings no line is fitted, so this finding rests on the two documented values alone.',
      RULE_RELIABILITY['trend.threshold_crossed'] ?? 0.88,
      [firstFact.id, latestFact.id],
      [firstFact.docId, latestFact.docId],
    );
    const conclusion = builder.conclusion(
      `${entity.label} is ${direction} the reference limit`,
      [fitStep],
      `The most recent reading sits ${direction} the limit stated in the source document. The engine reports the position of the value and, where a line was fitted, its direction. It does not interpret what that means clinically.`,
      combineConfidence(
        [factAuthority(firstFact), factAuthority(latestFact)],
        'all',
        RULE_RELIABILITY['trend.threshold_crossed'] ?? 0.88,
      ),
      [firstFact.id, latestFact.id],
      [firstFact.docId, latestFact.docId],
    );

    const projection =
      trajectory.threshold?.extrapolated && trajectory.threshold.daysToCrossing !== undefined
        ? ` At the fitted rate the value would reach ${trajectory.threshold.value} in about ${trajectory.threshold.daysToCrossing} days — a projection from a line, not a prediction.`
        : '';

    out.push({
      ruleId: 'trend.threshold_crossed',
      category: 'trend',
      severity: 'medium',
      title: `${entity.label} is ${direction} the reference limit (${latestPoint.value} ${trajectory.unit ?? ''} vs ${limit})`,
      statement: `The latest documented ${entity.label} is ${latestPoint.value} ${trajectory.unit ?? ''} on ${formatDate(latestPoint.date)}, ${direction} the reference limit of ${limit}.${projection}`,
      builder,
      conclusionId: conclusion,
      premiseFacts: [firstFact, latestFact],
      entityKeys: [entity.key],
      window: windowOf([firstFact, latestFact]),
      question: `Was this ${entity.label} result reviewed, and is a repeat planned?`,
      notConcluded:
        'A value outside a reference range is not a diagnosis, and a fitted direction is not a prediction. The engine reports position and direction only.',
      satisfiableBy: `A later ${entity.label} result showing the value back inside the range.`,
    });
  }

  return out;
}

/**
 * Declared fast-change limits.
 *
 * Deliberately a small table rather than a formula. A rate of change is only
 * meaningful in units that someone has agreed on, so the platform declares the
 * threshold per concept and produces no finding where none is declared. Several
 * of these are in wide clinical use; all of them are labelled as declared
 * thresholds in the proof, not as facts.
 */
export const FAST_CHANGE_LIMITS: Record<string, { perYear: number; rationale: string }> = {
  egfr: {
    perYear: 5,
    rationale:
      'A sustained decline of more than about 5 mL/min/1.73m² per year is a widely used definition of rapid kidney function loss.',
  },
  'hemoglobin-a1c': {
    perYear: 1,
    rationale:
      'A rise of one percentage point per year is a large shift in average glycaemia over a twelve month period.',
  },
  creatinine: {
    perYear: 0.3,
    rationale: 'A rise of 0.3 mg/dL per year represents a substantial change in kidney filtration.',
  },
  hemoglobin: {
    perYear: 2,
    rationale: 'A fall of 2 g/dL per year is a large change in red cell mass.',
  },
  weight: {
    perYear: 0.08,
    rationale:
      'Expressed as a fraction of the latest value: a change of more than about eight percent of body weight per year.',
  },
  'ldl-cholesterol': {
    perYear: 40,
    rationale:
      'A change of 40 mg/dL per year is large relative to the effect of most lipid-lowering therapy.',
  },
};

/**
 * A rate of change that exceeds a declared threshold for the concept.
 *
 * The limit comes from FAST_CHANGE_LIMITS. Where no limit is declared, no finding
 * is produced — the platform does not invent thresholds, and a rule that produces
 * nothing is a valid outcome.
 */
export function rapidChange(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const entity of ctx.graph.entities) {
    if (entity.kind !== 'measurement' && entity.kind !== 'vital') continue;
    const short = entity.key.split(':')[1] ?? '';
    const declared = FAST_CHANGE_LIMITS[short];
    if (!declared) continue;

    const trajectory = buildTrajectory(ctx.graph, entity.key, { asOf: ctx.asOf });
    if (!trajectory || trajectory.n < 4) continue;
    if (trajectory.direction === 'insufficient' || trajectory.direction === 'stable') continue;
    if (trajectory.r2 < MIN_R2_FOR_DIRECTION) continue;

    const latest = trajectory.points[trajectory.points.length - 1].value;
    const limit = declared.perYear < 1 ? Math.abs(latest) * declared.perYear : declared.perYear;
    if (limit <= 0) continue;
    if (Math.abs(trajectory.slopePerYear) < limit) continue;

    const firstPoint = trajectory.points[0];
    const lastPoint = trajectory.points[trajectory.points.length - 1];
    const first = ctx.factsById.get(firstPoint.factId);
    const last = ctx.factsById.get(lastPoint.factId);
    if (!first || !last) continue;

    const builder = new ProofBuilder(`rapid_${entity.key}_${last.id}`);
    const firstStep = builder.premise(
      first,
      `${entity.label} ${first.valueNum} ${first.unit ?? ''} on ${first.occurredAt}`,
    );
    const lastStep = builder.premise(
      last,
      `${entity.label} ${last.valueNum} ${last.unit ?? ''} on ${last.occurredAt}`,
    );
    const fitStep = builder.rule(
      'trend.rapid_change',
      `Rate of ${trajectory.slopePerYear} ${trajectory.unit ?? ''} per year over ${trajectory.n} readings`,
      [firstStep, lastStep],
      `The fitted rate exceeds the declared threshold of ${Math.round(limit * 1000) / 1000} ${trajectory.unit ?? ''} per year for this concept. ${declared.rationale} The fit explains about ${Math.round(trajectory.r2 * 100)} percent of the variation.`,
      RULE_RELIABILITY['trend.rapid_change'] ?? 0.72,
      [first.id, last.id],
      [first.docId, last.docId],
    );
    const conclusion = builder.conclusion(
      `${entity.label} is changing faster than the declared threshold`,
      [fitStep],
      'The engine reports the measured rate of change and the threshold it was compared against. It does not conclude why the value is changing.',
      combineConfidence(
        [factAuthority(first), factAuthority(last)],
        'all',
        RULE_RELIABILITY['trend.rapid_change'] ?? 0.72,
      ),
      [first.id, last.id],
      [first.docId, last.docId],
    );

    out.push({
      ruleId: 'trend.rapid_change',
      category: 'trend',
      severity: 'medium',
      title: `${entity.label} is ${trajectory.direction} at ${trajectory.slopePerYear} ${trajectory.unit ?? ''} per year`,
      statement: `Across ${trajectory.n} readings over ${trajectory.spanDays} days, ${entity.label} is ${trajectory.direction} at a fitted rate of ${trajectory.slopePerYear} ${trajectory.unit ?? ''} per year (R² ${trajectory.r2}), against a declared threshold of ${Math.round(limit * 1000) / 1000}.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: [first, last],
      entityKeys: [entity.key],
      window: windowOf([first, last]),
      question: `Is this rate of change expected for this patient, and what is the plan for monitoring it?`,
      notConcluded:
        'A rate of change is a measurement, not an explanation. The engine does not attribute the change to any cause, and the threshold is a declared convention rather than a clinical finding.',
      satisfiableBy: 'A documented explanation for the change, or a later series showing the rate flattening.',
    });
  }

  return out;
}


