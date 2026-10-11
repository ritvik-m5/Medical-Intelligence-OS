import type { RuleContext, RuleOutput } from './rule';
import { ProofBuilder, RULE_RELIABILITY, combineConfidence, factAuthority, windowOf } from './rule';
import { ALLERGY_CROSS_REACTIVITY } from '../relations';
import { factsForEntity, isSentenceLevel } from './rulesSupport';
import { formatDate } from '../text/normalize';

/* ------------------------------------------------------------------ */
/* Temporal rules — these reason over intervals, not dates             */
/* ------------------------------------------------------------------ */

/**
 * A list that presents a stopped medication as current.
 *
 * The rule only fires when the *strength of evidence differs*: the stop was
 * documented in a sentence, and the later "active" came from a heading. That
 * distinction is why this rule can be confident, and it is only available
 * because the extractor records where every status came from.
 */
export function listContradictsCourse(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const entity of ctx.graph.entities) {
    if (entity.kind !== 'medication') continue;
    const facts = factsForEntity(ctx, entity.key);

    const sentenceStops = facts.filter((f) => f.status === 'discontinued' && isSentenceLevel(f));
    if (sentenceStops.length === 0) continue;

    // Every sentence-level stop is tested against later lists, not just the most
    // recent one: a medication can be stopped, listed, stopped again, and listed
    // again, and each round is a separate contradiction.
    const pairs: Array<{ stop: (typeof sentenceStops)[number]; listed: (typeof sentenceStops)[number] }> = [];
    for (const stop of sentenceStops) {
      const staleList = facts.filter(
        (f) =>
          f.occurredAt > stop.occurredAt &&
          f.status === 'active' &&
          !isSentenceLevel(f) &&
          (f.sectionKind === 'current_medications' || f.sectionKind === 'medication_history'),
      );
      if (staleList.length === 0) continue;
      pairs.push({ stop, listed: staleList[0] });
    }
    if (pairs.length === 0) continue;
    const { stop, listed } = pairs[pairs.length - 1];

    const builder = new ProofBuilder(`list_${entity.key}_${listed.id}`);
    const stopStep = builder.premise(
      stop,
      `${entity.label} documented as discontinued on ${stop.occurredAt}`,
      `A sentence in a ${stop.docKind.replace(/_/g, ' ')} states the stop: "${stop.quote}". The status came from the wording itself, not from a heading.`,
    );
    const listStep = builder.premise(
      listed,
      `${entity.label} still listed under "${listed.sectionKind.replace(/_/g, ' ')}" on ${listed.occurredAt}`,
      `The status came from the section heading, not from a sentence about this patient. Reconciliation lists are frequently copied forward without review, so a heading is weaker evidence than a sentence.`,
    );
    const confidence = combineConfidence(
      [factAuthority(stop), factAuthority(listed)],
      'all',
      RULE_RELIABILITY['temporal.list_contradicts_course'] ?? 0.9,
    );
    const conclusion = builder.conclusion(
      `${entity.label} appears stopped in one document and current in a later list`,
      [stopStep, listStep],
      'Sentence-level documentation is weighted above heading-level documentation, so the platform reports the list as contradicting the documented course. It does not decide which is correct.',
      confidence,
      [stop.id, listed.id],
      [stop.docId, listed.docId],
    );

    out.push({
      ruleId: 'temporal.list_contradicts_course',
      category: 'consistency',
      severity: 'high',
      title: `${entity.label} is stopped in one document and current in a later list`,
      statement: `${entity.label} was documented as discontinued on ${formatDate(stop.occurredAt)}, and a list dated ${formatDate(listed.occurredAt)} still presents it as a current medication.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: [stop, listed],
      entityKeys: [entity.key],
      window: windowOf([stop, listed]),
      question: `Is ${entity.label} currently being taken?`,
      notConcluded:
        'The engine does not decide whether the medication is being taken. It reports that a sentence and a list disagree, and which of the two it weighs more heavily.',
      satisfiableBy: `A sentence-level statement after ${formatDate(listed.occurredAt)} confirming whether ${entity.label} is being taken.`,
    });
  }

  return out;
}

/**
 * A prescription course that overlaps a recorded allergy interval.
 *
 * Interval reasoning, not date comparison: the allergy is an open interval from
 * its first documentation, and the course is an interval with a start and an end.
 * The engine asks whether they intersect, which is the question that matters.
 */
export function allergyOverlapsCourse(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const [allergyKey, cross] of Object.entries(ALLERGY_CROSS_REACTIVITY)) {
    const allergyEntityKey = `allergy:${allergyKey}`;
    const allergyFacts = factsForEntity(ctx, allergyEntityKey);
    if (allergyFacts.length === 0) continue;
    const firstAllergy = allergyFacts[0];

    for (const drugKey of cross.drugs) {
      const medicationKey = `medication:${drugKey}`;
      const drugFacts = factsForEntity(ctx, medicationKey);
      const overlapping = ctx.courses.filter(
        (course) => course.entityKey === medicationKey && course.interval.start >= firstAllergy.occurredAt,
      );

      for (const course of overlapping) {
        const startFact = drugFacts.find((f) => f.id === course.startFactId);
        if (!startFact) continue;

        const builder = new ProofBuilder(`allergy_${allergyKey}_${drugKey}_${course.startFactId}`);
        const allergyStep = builder.premise(
          firstAllergy,
          `${firstAllergy.label} allergy first documented ${firstAllergy.occurredAt}`,
          `Recorded as an allergy: "${firstAllergy.quote}". Treated as an open interval from this date because no later document resolves it.`,
        );
        const intervalStep = builder.interval(
          `${course.label} course from ${course.interval.start}${course.interval.end ? ` to ${course.interval.end}` : ' (open)'}`,
          [allergyStep],
          [startFact.id, ...(course.endFactId ? [course.endFactId] : [])],
          [startFact.docId],
          `Course reconstructed from the documented start${course.interval.end ? ' and stop' : ''}. It begins on or after the allergy was recorded.`,
          course.confidence,
        );
        const relationStep = builder.rule(
          'temporal.allergy_prescription_overlap',
          'Cross-reactivity relation applied',
          [allergyStep, intervalStep],
          cross.rationale,
          RULE_RELIABILITY['temporal.allergy_prescription_overlap'] ?? 0.82,
        );
        const conclusion = builder.conclusion(
          `${course.label} overlaps a recorded ${firstAllergy.label} allergy`,
          [relationStep],
          'The allergy interval and the medication course intersect, and the two substances are related. The engine reports the overlap and the relationship. It does not conclude that harm occurred or that the prescription was wrong.',
          combineConfidence(
            [factAuthority(firstAllergy), course.confidence],
            'all',
            RULE_RELIABILITY['temporal.allergy_prescription_overlap'] ?? 0.82,
          ),
          [firstAllergy.id, startFact.id],
          [firstAllergy.docId, startFact.docId],
        );

        out.push({
          ruleId: 'temporal.allergy_prescription_overlap',
          category: 'safety',
          severity: 'high',
          title: `${course.label} documented while a ${firstAllergy.label} allergy is on file`,
          statement: `${course.label} was documented from ${formatDate(course.interval.start)} while a ${firstAllergy.label} allergy recorded on ${formatDate(firstAllergy.occurredAt)} remained open.`,
          builder,
          conclusionId: conclusion,
          premiseFacts: [firstAllergy, startFact],
          entityKeys: [medicationKey, allergyEntityKey],
          window: windowOf([firstAllergy, startFact]),
          question: `Was ${course.label} prescribed deliberately despite the recorded ${firstAllergy.label} allergy?`,
          notConcluded:
            'Allergies are frequently outdated, mislabelled, or intentionally overridden. The engine reports the pairing, the relationship used, and the source of each statement — nothing more.',
          satisfiableBy: `A documented allergy reconciliation after ${formatDate(course.interval.start)} recording the outcome.`,
        });
      }
    }
  }

  return out;
}

