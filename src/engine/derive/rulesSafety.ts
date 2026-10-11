import type { RuleContext, RuleOutput } from './rule';
import { ProofBuilder, RULE_RELIABILITY, combineConfidence, factAuthority, windowOf } from './rule';
import { CONTRAINDICATED_PAIRS } from '../relations';
import { factsForEntity } from './rulesSupport';
import { formatDate } from '../text/normalize';
import type { MedicationCourse } from './types';

/* ------------------------------------------------------------------ */
/* Safety rules                                                        */
/* ------------------------------------------------------------------ */

/** Every pair of courses that the documents place as active on the same day. */
export function coursesActiveTogether(
  ctx: RuleContext,
): Array<{ a: MedicationCourse; b: MedicationCourse }> {
  const open = ctx.courses.filter(
    (course) =>
      course.interval.start <= ctx.asOf &&
      (course.interval.end === undefined || course.interval.end >= ctx.asOf),
  );
  const pairs: Array<{ a: MedicationCourse; b: MedicationCourse }> = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i];
      const b = open[j];
      if (a.entityKey === b.entityKey) continue;
      const aEnd = a.interval.end ?? '9999-12-31';
      const bEnd = b.interval.end ?? '9999-12-31';
      if (a.interval.start <= bEnd && b.interval.start <= aEnd) pairs.push({ a, b });
    }
  }
  return pairs;
}

/**
 * Two different drugs of the same class running at the same time.
 *
 * This is the rule that catches therapeutic duplication: two statins, two ACE
 * inhibitors, two proton pump inhibitors. It is interval-based, so it fires on
 * genuinely overlapping courses rather than on two mentions in one document.
 */
export function duplicateTherapy(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const { a, b } of coursesActiveTogether(ctx)) {
    const classA = a.drugClass ?? '';
    if (!classA || classA !== b.drugClass) continue;
    // Analgesics are legitimately combined and would drown the signal.
    if (classA === 'Analgesic / antipyretic' || classA === 'NSAID') continue;

    const startA = factsForEntity(ctx, a.entityKey).find((f) => f.id === a.startFactId);
    const startB = factsForEntity(ctx, b.entityKey).find((f) => f.id === b.startFactId);
    if (!startA || !startB) continue;

    const builder = new ProofBuilder(`dup_${a.entityKey}_${b.entityKey}`);
    const stepA = builder.premise(startA, `${a.label} course from ${a.interval.start}`);
    const stepB = builder.premise(startB, `${b.label} course from ${b.interval.start}`);
    const classStep = builder.rule(
      'safety.duplicate_therapy',
      `Both belong to the class "${classA}"`,
      [stepA, stepB],
      `The lexicon assigns ${a.label} and ${b.label} to the same therapeutic class, so overlapping courses represent duplicate therapy rather than a deliberate combination.`,
      RULE_RELIABILITY['safety.duplicate_therapy'] ?? 0.8,
      [startA.id, startB.id],
      [startA.docId, startB.docId],
    );
    const conclusion = builder.conclusion(
      `${a.label} and ${b.label} are both documented as active in the same class`,
      [classStep],
      'Overlapping courses of two drugs in one class are reported as duplication. The engine does not conclude that either is unnecessary; combination therapy within a class is occasionally intentional.',
      combineConfidence(
        [factAuthority(startA), factAuthority(startB)],
        'all',
        RULE_RELIABILITY['safety.duplicate_therapy'] ?? 0.8,
      ),
      [startA.id, startB.id],
      [startA.docId, startB.docId],
    );

    out.push({
      ruleId: 'safety.duplicate_therapy',
      category: 'safety',
      severity: 'medium',
      title: `${a.label} and ${b.label} are both active in the "${classA}" class`,
      statement: `Two medications from the same therapeutic class are documented as active over overlapping periods.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: [startA, startB],
      entityKeys: [a.entityKey, b.entityKey],
      window: windowOf([startA, startB]),
      question: `Are both ${classA.toLowerCase()} agents still intended to be taken together?`,
      notConcluded:
        'The engine does not conclude that either medication is unnecessary. It reports overlapping courses within one class, which is usually but not always duplication.',
      satisfiableBy: 'A documented medication reconciliation confirming the intended regimen.',
    });
  }

  return out;
}

/**
 * A curated pair of co-prescribed medications with a documented interaction.
 *
 * The pair list is deliberately small and every entry carries its own rationale.
 * A long list of speculative interactions would be worse than a short list of
 * real ones. The engine reports the pair and the reason; it never grades severity.
 */
export function contraindicatedPairs(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const { a, b } of coursesActiveTogether(ctx)) {
    const keyA = a.entityKey.split(':')[1] ?? '';
    const keyB = b.entityKey.split(':')[1] ?? '';
    const pair = CONTRAINDICATED_PAIRS.find(
      (p) =>
        (p.drugs[0] === keyA && p.drugs[1] === keyB) || (p.drugs[0] === keyB && p.drugs[1] === keyA),
    );
    if (!pair) continue;

    const startA = factsForEntity(ctx, a.entityKey).find((f) => f.id === a.startFactId);
    const startB = factsForEntity(ctx, b.entityKey).find((f) => f.id === b.startFactId);
    if (!startA || !startB) continue;

    const builder = new ProofBuilder(`pair_${a.entityKey}_${b.entityKey}`);
    const stepA = builder.premise(startA, `${a.label} course from ${a.interval.start}`);
    const stepB = builder.premise(startB, `${b.label} course from ${b.interval.start}`);
    const pairStep = builder.rule(
      'safety.contraindicated_pair',
      'Declared interaction pair matched',
      [stepA, stepB],
      pair.rationale,
      RULE_RELIABILITY['safety.contraindicated_pair'] ?? 0.78,
      [startA.id, startB.id],
      [startA.docId, startB.docId],
    );
    const conclusion = builder.conclusion(
      `${a.label} and ${b.label} are documented as concurrently active`,
      [pairStep],
      'Both courses overlap and the pair is on the declared interaction list with the stated rationale. The engine reports the co-prescription and the reason; it does not grade the severity of the interaction or recommend an action.',
      combineConfidence(
        [factAuthority(startA), factAuthority(startB)],
        'all',
        RULE_RELIABILITY['safety.contraindicated_pair'] ?? 0.78,
      ),
      [startA.id, startB.id],
      [startA.docId, startB.docId],
    );

    out.push({
      ruleId: 'safety.contraindicated_pair',
      category: 'safety',
      severity: 'medium',
      title: `${a.label} and ${b.label} are co-prescribed`,
      statement: `${a.label} (from ${formatDate(a.interval.start)}) and ${b.label} (from ${formatDate(b.interval.start)}) are documented as active over overlapping periods.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: [startA, startB],
      entityKeys: [a.entityKey, b.entityKey],
      window: windowOf([startA, startB]),
      question: 'Was this combination reviewed together, and is it still intended?',
      notConcluded:
        'The engine does not grade the severity of an interaction, does not decide whether the combination is acceptable, and does not recommend a change.',
      satisfiableBy: 'A documented medication review addressing the pair.',
    });
  }

  return out;
}

