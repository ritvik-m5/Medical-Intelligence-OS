import type { RuleContext, RuleOutput } from './rule';
import { ProofBuilder, RULE_RELIABILITY, combineConfidence, factAuthority } from './rule';
import { CONDITION_MONITORING, CLASS_TREATS } from '../relations';
import { factsForEntity, shortKey } from './rulesSupport';
import { addDays, daysBetween, formatDate } from '../text/normalize';

/* ------------------------------------------------------------------ */
/* Care-gap rules                                                      */
/*                                                                    */
/* A care gap is not an opinion about what should happen. It is a       */
/* statement that the record documents a condition (or a drug with a    */
/* monitoring requirement) and does not document the follow-up that     */
/* condition implies. Every gap names the exact documentation that      */
/* would clear it.                                                      */
/* ------------------------------------------------------------------ */

const MONITORING_WINDOW_DAYS = 365;

interface Expectation {
  labKeys: string[];
  because: string;
}

function expectationFor(short: string): Expectation | null {
  const labs = CONDITION_MONITORING[short];
  if (!labs || labs.length === 0) return null;
  return {
    labKeys: labs,
    because: `The declared monitoring map for ${short.replace(/-/g, ' ')} lists ${labs.join(', ')} as the measurements normally used to follow it.`,
  };
}

const LAB_GUIDELINE = {
  title: 'MedlinePlus medical test index',
  source: 'MedlinePlus (NIH)',
  url: 'https://medlineplus.gov/lab-tests/',
};

/**
 * An active condition whose usual monitoring has not been documented inside the
 * window.
 */
export function monitoringAbsent(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const span of ctx.spans) {
    if (span.state !== 'open') continue;
    const short = shortKey(span.entityKey);
    const expectation = expectationFor(short);
    if (!expectation) continue;

    const startFact = ctx.factsById.get(span.startFactId);
    if (!startFact) continue;

    // The window runs from the later of: when the condition was documented, and
    // one year before the evaluation date. A condition documented last month has
    // not missed a yearly check yet.
    const windowStart = addDays(ctx.asOf, -MONITORING_WINDOW_DAYS);
    const effectiveFrom = span.interval.start > windowStart ? span.interval.start : windowStart;
    if (daysBetween(effectiveFrom, ctx.asOf) < 30) continue;

    const present: Array<{ key: string; facts: ReturnType<typeof factsForEntity> }> = [];
    const missing: string[] = [];

    for (const labKey of expectation.labKeys) {
      const measurementFacts = [
        ...factsForEntity(ctx, `measurement:${labKey}`),
        ...factsForEntity(ctx, `vital:${labKey}`),
      ].filter((f) => f.occurredAt >= effectiveFrom && f.occurredAt <= ctx.asOf);
      if (measurementFacts.length > 0) present.push({ key: labKey, facts: measurementFacts });
      else missing.push(labKey);
    }

    if (missing.length === 0) continue;
    if (present.length === expectation.labKeys.length) continue;

    const premiseFacts = [startFact, ...present.flatMap((p) => p.facts)];
    const builder = new ProofBuilder(`gap_${span.entityKey}_${ctx.asOf}`);
    const conditionStep = builder.premise(
      startFact,
      `${span.label} documented as active from ${span.interval.start}`,
      `The condition interval is open: "${startFact.quote}". No later document closes it.`,
    );
    const expectationStep = builder.rule(
      'gap.monitoring_absent',
      `Expected monitoring: ${expectation.labKeys.join(', ')}`,
      [conditionStep],
      expectation.because,
      RULE_RELIABILITY['gap.monitoring_absent'] ?? 0.86,
      [startFact.id],
      [startFact.docId],
    );
    const missingStep = builder.add({
      kind: 'rule',
      label: `Not documented between ${effectiveFrom} and ${ctx.asOf}`,
      factIds: [],
      docIds: [],
      ruleId: 'gap.monitoring_absent',
      dependsOn: [expectationStep],
      justification: `No fact for ${missing.join(', ')} exists in the graph inside that window. This is a statement about the imported documents, not about what was done.`,
      confidence: factAuthority(startFact),
    });
    const conclusion = builder.conclusion(
      `${span.label} is active with no documented ${missing.join(' or ')} in the last ${MONITORING_WINDOW_DAYS} days`,
      [missingStep],
      'The engine reports the absence of documentation for measurements this condition normally generates. It does not conclude that the tests were not performed, only that they are not in this record.',
      combineConfidence(
        [factAuthority(startFact)],
        'all',
        RULE_RELIABILITY['gap.monitoring_absent'] ?? 0.86,
      ),
      premiseFacts.map((f) => f.id),
      premiseFacts.map((f) => f.docId),
    );

    out.push({
      ruleId: 'gap.monitoring_absent',
      category: 'gap',
      severity: 'medium',
      title: `${span.label}: no documented ${missing.join(' or ')} since ${formatDate(effectiveFrom)}`,
      statement: `${span.label} is documented as active, and the record contains no ${missing.join(' or ')} dated between ${formatDate(effectiveFrom)} and ${formatDate(ctx.asOf)}.`,
      builder,
      conclusionId: conclusion,
      premiseFacts,
      entityKeys: [span.entityKey],
      window: { start: effectiveFrom, end: ctx.asOf },
      question: `Has ${missing.join(' or ')} been done since ${formatDate(effectiveFrom)}?`,
      notConcluded:
        'Absence of documentation is not absence of care. The result may exist outside this record. The engine reports the gap in the record and the measurements that would close it.',
      satisfiableBy: `A document containing ${missing.join(' or ')} dated after ${formatDate(effectiveFrom)}.`,
      guideline: LAB_GUIDELINE,
    });
  }

  return out;
}

/**
 * A therapy that was stopped, where the condition it treated is still open and no
 * replacement in the same class was started.
 *
 * The engine does not say the stop was wrong. It says the record shows a gap
 * between stopping something and doing anything else about the reason it was
 * prescribed.
 */
export function unresolvedDiscontinuation(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const course of ctx.courses) {
    if (course.state !== 'closed' || !course.interval.end) continue;
    if (!course.drugClass) continue;

    // Find an open condition that this drug class is declared to treat.
    const openSpans = ctx.spans.filter((span) => span.state === 'open');
    const matchingSpan = openSpans.find((span) => {
      const short = shortKey(span.entityKey);
      return (CLASS_TREATS[course.drugClass ?? ''] ?? []).includes(short);
    });
    if (!matchingSpan) continue;

    // A replacement must be a *different* drug in the same class. Restarting the
    // same medication is a restart, not a substitute, and the list-contradiction
    // rule handles that case instead.
    const replacement = ctx.courses.find(
      (other) =>
        other.entityKey !== course.entityKey &&
        other.drugClass === course.drugClass &&
        (other.interval.end === undefined || other.interval.end >= course.interval.end!),
    );
    if (replacement) continue;

    const stopFact = ctx.factsById.get(course.endFactId ?? '');
    const startFact = ctx.factsById.get(course.startFactId);
    const spanFact = ctx.factsById.get(matchingSpan.startFactId);
    if (!stopFact || !startFact || !spanFact) continue;

    const builder = new ProofBuilder(`unres_${course.entityKey}_${matchingSpan.entityKey}`);
    const startStep = builder.premise(startFact, `${course.label} started ${course.interval.start}`);
    const stopStep = builder.premise(
      stopFact,
      `${course.label} stopped ${course.interval.end}`,
      `The stop is documented: "${stopFact.quote}".`,
    );
    const spanStep = builder.premise(
      spanFact,
      `${matchingSpan.label} still documented as active`,
      `The condition interval remains open from ${matchingSpan.interval.start}.`,
    );
    const gapStep = builder.rule(
      'gap.unresolved_discontinuation',
      `No active ${course.drugClass} in the record after ${course.interval.end}`,
      [startStep, stopStep, spanStep],
      `${course.drugClass} is declared to treat ${matchingSpan.label.toLowerCase()}, the condition is still open, and no other ${course.drugClass} course is documented as active afterwards.`,
      RULE_RELIABILITY['gap.unresolved_discontinuation'] ?? 0.8,
      [startFact.id, stopFact.id, spanFact.id],
      [startFact.docId, stopFact.docId, spanFact.docId],
    );
    const conclusion = builder.conclusion(
      `${course.label} was stopped while ${matchingSpan.label} remained active, with no replacement documented`,
      [gapStep],
      'The engine reports the sequence: therapy stopped, condition still open, nothing documented to take its place. It does not conclude that replacement was indicated.',
      combineConfidence(
        [factAuthority(startFact), factAuthority(stopFact), factAuthority(spanFact)],
        'all',
        RULE_RELIABILITY['gap.unresolved_discontinuation'] ?? 0.8,
      ),
      [startFact.id, stopFact.id, spanFact.id],
      [startFact.docId, stopFact.docId, spanFact.docId],
    );

    out.push({
      ruleId: 'gap.unresolved_discontinuation',
      category: 'gap',
      severity: 'medium',
      title: `${course.label} stopped with ${matchingSpan.label} still active and no replacement`,
      statement: `${course.label} was discontinued on ${formatDate(course.interval.end)}, ${matchingSpan.label} remains documented as active, and no other ${course.drugClass.toLowerCase()} appears in the record afterwards.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: [startFact, stopFact, spanFact],
      entityKeys: [course.entityKey, matchingSpan.entityKey],
      window: { start: course.interval.start, end: ctx.asOf },
      question: `Was a replacement for ${course.label} intended, and is it documented elsewhere?`,
      notConcluded:
        'Stopping therapy is often deliberate, and the replacement may exist outside this record. The engine reports the documented sequence, not the clinical reasoning behind it.',
      satisfiableBy: `A document after ${formatDate(course.interval.end)} showing an active ${course.drugClass.toLowerCase()} or recording the decision not to continue.`,
    });
  }

  return out;
}

