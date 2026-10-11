import type { RuleContext, RuleOutput } from './rule';
import { ProofBuilder, RULE_RELIABILITY, combineConfidence, factAuthority, windowOf } from './rule';
import { factsForEntity } from './rulesSupport';
import { conflictsOf, factsOfConflict, groupFacts, labelForConflict } from './conflicts';
import { daysBetween, formatDate } from '../text/normalize';

/* ------------------------------------------------------------------ */
/* Documentation-silence rule                                          */
/* ------------------------------------------------------------------ */

const SILENCE_DAYS = 540;

/**
 * An open condition that no document has mentioned for a long time.
 *
 * This is the quietest and most common defect in a longitudinal record: a problem
 * is entered once and then simply never revisited, so it stays "active" forever.
 */
export function documentationSilence(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const span of ctx.spans) {
    if (span.state !== 'open') continue;
    const facts = factsForEntity(ctx, span.entityKey).filter((f) => f.occurredAt <= ctx.asOf);
    if (facts.length === 0) continue;
    const last = facts[facts.length - 1];
    const silence = daysBetween(last.occurredAt, ctx.asOf);
    if (silence < SILENCE_DAYS) continue;

    const startFact = ctx.factsById.get(span.startFactId);
    if (!startFact) continue;
    const months = Math.round(silence / 30.44);

    const builder = new ProofBuilder(`silence_${span.entityKey}_${ctx.asOf}`);
    const startStep = builder.premise(
      startFact,
      `${span.label} documented as active from ${span.interval.start}`,
    );
    const lastStep = builder.premise(
      last,
      `Last mention on ${last.occurredAt}`,
      `This is the most recent statement about ${span.label} in the imported documents.`,
    );
    const silenceStep = builder.rule(
      'gap.documentation_silence',
      `${months} months without a mention`,
      [startStep, lastStep],
      `No document dated between ${last.occurredAt} and ${ctx.asOf} mentions ${span.label}. The condition interval was never closed, so it remains open by default.`,
      RULE_RELIABILITY['gap.documentation_silence'] ?? 0.7,
      [startFact.id, last.id],
      [startFact.docId, last.docId],
    );
    const conclusion = builder.conclusion(
      `${span.label} is still open but has not been mentioned in ${months} months`,
      [silenceStep],
      'The engine reports the gap in documentation. It does not conclude that the condition resolved, and it does not conclude that it is still present.',
      combineConfidence(
        [factAuthority(startFact), factAuthority(last)],
        'all',
        RULE_RELIABILITY['gap.documentation_silence'] ?? 0.7,
      ),
      [startFact.id, last.id],
      [startFact.docId, last.docId],
    );

    out.push({
      ruleId: 'gap.documentation_silence',
      category: 'gap',
      severity: 'low',
      title: `${span.label} is open but unmentioned for ${months} months`,
      statement: `${span.label} was last documented on ${formatDate(last.occurredAt)}, ${months} months before the evaluation date, and remains open because no document closed it.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: [startFact, last],
      entityKeys: [span.entityKey],
      window: { start: last.occurredAt, end: ctx.asOf },
      question: `Is ${span.label} still being managed, and is it still considered active?`,
      notConcluded:
        'Silence in a record is not a clinical event. The engine flags a gap in documentation, nothing more.',
      satisfiableBy: `Any document after ${formatDate(last.occurredAt)} that mentions ${span.label}, or that closes it.`,
    });
  }

  return out;
}

/**
 * An administrative field recorded two different ways.
 *
 * The disagreement is detected once by the conflict layer. Regrouping the cited
 * facts by their recorded value is presentation, so it stays here.
 */
export function demographicMismatch(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const conflict of conflictsOf(ctx, ['demographic_conflict'])) {
    const facts = factsOfConflict(ctx, conflict);
    const entityKey = conflict.entityKey ?? facts[0]?.entityKey;
    if (!entityKey) continue;
    const label = labelForConflict(ctx, conflict);

    const groups = groupFacts(facts, (fact) => {
      const value = String(fact.attrs.valueText ?? fact.valueText ?? '');
      return value.length > 0 ? value : null;
    });
    if (groups.size < 2) continue;

    const entries = Array.from(groups.entries());
    const representatives = entries.map(([, list]) => list[0]);
    const builder = new ProofBuilder(`demographic_${entityKey}`);
    const premiseSteps = representatives.map((fact) =>
      builder.premise(
        fact,
        `${label} recorded as ${String(fact.attrs.valueText ?? fact.valueText ?? '')}`,
      ),
    );
    const ruleStep = builder.rule(
      'quality.demographic_mismatch',
      `Distinct values recorded: ${entries.map(([value]) => value).join(', ')}`,
      premiseSteps,
      'The same administrative field carries different values in different documents. Unlike a clinical disagreement, there is no interpretation that reconciles them.',
      RULE_RELIABILITY['quality.demographic_mismatch'] ?? 0.96,
      representatives.map((fact) => fact.id),
      representatives.map((fact) => fact.docId),
    );
    const conclusion = builder.conclusion(
      `${label} is recorded inconsistently`,
      [ruleStep],
      'The engine reports both values with their sources and refuses to choose. Administrative values propagate into other systems, so an inconsistency here matters more than it looks.',
      combineConfidence(
        representatives.map(factAuthority),
        'all',
        RULE_RELIABILITY['quality.demographic_mismatch'] ?? 0.96,
      ),
      representatives.map((fact) => fact.id),
      representatives.map((fact) => fact.docId),
    );

    out.push({
      ruleId: 'quality.demographic_mismatch',
      category: 'quality',
      severity: entityKey.endsWith('blood-type') ? 'high' : 'medium',
      title: `${label} is recorded as ${entries.map(([value]) => value).join(' and ')}`,
      statement: `Different documents give different values for ${label}: ${entries
        .map(([value, list]) => `${value} (${list.length} statement${list.length === 1 ? '' : 's'})`)
        .join(', ')}.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: representatives,
      entityKeys: [entityKey],
      window: windowOf(representatives),
      question: `Which ${label.toLowerCase()} is correct?`,
      notConcluded:
        'The engine does not choose between conflicting administrative values. It requires a human to confirm.',
      satisfiableBy: `Confirmation of the correct ${label.toLowerCase()}.`,
    });
  }

  return out;
}

