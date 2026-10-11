import type { RuleContext, RuleOutput } from './rule';
import { ProofBuilder, RULE_RELIABILITY, combineConfidence, factAuthority, windowOf } from './rule';
import { factsForEntity } from './rulesSupport';
import { conflictsOf, factsOfConflict, groupFacts, labelForConflict } from './conflicts';
import { formatDate } from '../text/normalize';

/* ------------------------------------------------------------------ */
/* Data-quality rules                                                  */
/*                                                                    */
/* These rules are about the record, not the patient. They exist       */
/* because a platform that silently trusts bad data is more dangerous  */
/* than one that has none.                                             */
/* ------------------------------------------------------------------ */

/** A value the extractor read but refuses to treat as a clinical finding. */
export function implausibleValues(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const entity of ctx.graph.entities) {
    if (entity.kind !== 'measurement' && entity.kind !== 'vital') continue;
    const flagged = factsForEntity(ctx, entity.key).filter((f) =>
      f.flags.includes('implausible_value'),
    );
    if (flagged.length === 0) continue;

    const builder = new ProofBuilder(`implausible_${entity.key}`);
    const premiseSteps = flagged.map((fact) =>
      builder.premise(
        fact,
        `${entity.label} ${fact.valueNum} ${fact.unit ?? ''} on ${fact.occurredAt}`,
        `Read as written: "${fact.quote}". ${String(fact.attrs.plausibilityNote ?? '')}`,
      ),
    );
    const ruleStep = builder.rule(
      'quality.implausible_value',
      `Outside the plausible range declared for ${entity.label}`,
      premiseSteps,
      'Each concept carries a physiologically and analytically plausible window. Values outside it are far more often transcription or unit errors than real findings, so they are reported as data-quality problems rather than results.',
      RULE_RELIABILITY['quality.implausible_value'] ?? 0.9,
      flagged.map((f) => f.id),
      flagged.map((f) => f.docId),
    );
    const conclusion = builder.conclusion(
      `${flagged.length} ${entity.label} ${flagged.length === 1 ? 'value is' : 'values are'} outside the plausible range`,
      [ruleStep],
      'The engine reports the value it read and flags it. It never corrects the number, because silently altering a source value would be worse than flagging it.',
      combineConfidence(
        flagged.map(factAuthority),
        'all',
        RULE_RELIABILITY['quality.implausible_value'] ?? 0.9,
      ),
      flagged.map((f) => f.id),
      flagged.map((f) => f.docId),
    );

    out.push({
      ruleId: 'quality.implausible_value',
      category: 'quality',
      severity: 'high',
      title: `${entity.label} has a value outside the plausible range`,
      statement: flagged
        .map((f) => `${f.valueNum} ${f.unit ?? ''} on ${formatDate(f.occurredAt)}`)
        .join('; '),
      builder,
      conclusionId: conclusion,
      premiseFacts: flagged,
      entityKeys: [entity.key],
      window: windowOf(flagged),
      question: `Is the reported ${entity.label} value correct as written, or is there a decimal or unit error in the source document?`,
      notConcluded:
        'The engine does not correct or discard the value. It reports exactly what the document said and why it was questioned.',
      satisfiableBy: `A corrected ${entity.label} result, or confirmation that the reported value is accurate.`,
    });
  }

  return out;
}

/** The same measurement reported in more than one unit across documents. */
export function unitMismatch(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const entity of ctx.graph.entities) {
    if (entity.kind !== 'measurement' && entity.kind !== 'vital') continue;
    const withValues = factsForEntity(ctx, entity.key).filter((f) => f.valueNum !== undefined);
    const units = Array.from(new Set(withValues.map((f) => f.unit ?? 'none')));
    if (units.length < 2) continue;

    const representatives = units
      .map((unit) => withValues.find((f) => (f.unit ?? 'none') === unit))
      .filter((f): f is (typeof withValues)[number] => Boolean(f));

    const builder = new ProofBuilder(`units_${entity.key}`);
    const premiseSteps = representatives.map((fact) =>
      builder.premise(fact, `${entity.label} reported in ${fact.unit ?? 'no unit'}`),
    );
    const ruleStep = builder.rule(
      'quality.unit_mismatch',
      `Units present: ${units.join(', ')}`,
      premiseSteps,
      'Values in different units were deliberately never compared. Converting without a declared factor would fabricate a trend, so the platform refuses to and reports the mismatch instead.',
      RULE_RELIABILITY['quality.unit_mismatch'] ?? 0.97,
      representatives.map((f) => f.id),
      representatives.map((f) => f.docId),
    );
    const conclusion = builder.conclusion(
      `${entity.label} appears in ${units.length} different units`,
      [ruleStep],
      'No trend is computed for this concept until the units agree. The engine reports the mismatch and leaves the values as written.',
      combineConfidence(
        representatives.map(factAuthority),
        'all',
        RULE_RELIABILITY['quality.unit_mismatch'] ?? 0.97,
      ),
      representatives.map((f) => f.id),
      representatives.map((f) => f.docId),
    );

    out.push({
      ruleId: 'quality.unit_mismatch',
      category: 'quality',
      severity: 'medium',
      title: `${entity.label} is reported in ${units.length} different units`,
      statement: `The record contains ${entity.label} values in ${units.join(' and ')}, so no comparison between them was made.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: representatives,
      entityKeys: [entity.key],
      window: windowOf(representatives),
      question: `Which unit applies to this patient's ${entity.label} results?`,
      notConcluded:
        'The engine does not assume a conversion. Conversion is only applied where a published factor exists and the stated unit is unambiguous.',
      satisfiableBy: 'Confirmation of the reporting laboratory unit.',
    });
  }

  return out;
}

/**
 * Two different values for the same measurement on the same day.
 *
 * The disagreement itself is detected once by the conflict layer. This rule's
 * job is to turn it into a proof, and grouping the cited facts by day and unit is
 * presentation, so it happens here.
 */
export function sameDayConflict(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];

  for (const conflict of conflictsOf(ctx, ['measurement_value_conflict'])) {
    const facts = factsOfConflict(ctx, conflict);
    const entityKey = conflict.entityKey ?? facts[0]?.entityKey;
    if (!entityKey) continue;
    const label = labelForConflict(ctx, conflict);

    const groups = groupFacts(facts, (fact) => `${fact.occurredAt}|${fact.unit ?? 'none'}`);

    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const values = new Set(group.map((fact) => fact.valueNum));
      if (values.size < 2) continue;

      const [date] = key.split('|');
      const distinctDocs = new Set(group.map((fact) => fact.docId));

      const builder = new ProofBuilder(`sameday_${entityKey}_${date}`);
      const premiseSteps = group.map((fact) =>
        builder.premise(fact, `${label} ${fact.valueNum} ${fact.unit ?? ''} on ${fact.occurredAt}`),
      );
      const ruleStep = builder.rule(
        'quality.same_day_conflict',
        `${group.length} statements of ${label} dated ${date}, with ${values.size} distinct values`,
        premiseSteps,
        'Two documents describing the same day give different values for one measurement in one unit. Duplicate results from different laboratories are not automatically wrong, so the engine reports the disagreement and does not pick a winner.',
        RULE_RELIABILITY['quality.same_day_conflict'] ?? 0.95,
        group.map((fact) => fact.id),
        group.map((fact) => fact.docId),
      );
      const conclusion = builder.conclusion(
        `${label} has conflicting values for ${date}`,
        [ruleStep],
        `The documents disagree about ${label} on ${date}. Both values are shown with their sources.`,
        combineConfidence(
          group.map(factAuthority),
          'all',
          RULE_RELIABILITY['quality.same_day_conflict'] ?? 0.95,
        ),
        group.map((fact) => fact.id),
        group.map((fact) => fact.docId),
      );

      out.push({
        ruleId: 'quality.same_day_conflict',
        category: 'quality',
        severity: distinctDocs.size > 1 ? 'high' : 'medium',
        title: `${label} has two different values for ${formatDate(date)}`,
        statement: group
          .map((fact) => `${fact.valueNum} ${fact.unit ?? ''} (${fact.docId.slice(0, 8)})`)
          .join(' vs '),
        builder,
        conclusionId: conclusion,
        premiseFacts: group,
        entityKeys: [entityKey],
        window: { start: date, end: date },
        question: `Which ${label} result is correct for ${formatDate(date)}?`,
        notConcluded:
          'The engine does not choose between two conflicting results. Both are reported with their source documents.',
        satisfiableBy: 'Confirmation of the correct result from the performing laboratory.',
      });
    }
  }

  return out;
}

/**
   * A documented direction flag that contradicts the numeric value. Reported as
   * a proof, with the value span and the reference interval cited from the source.
   */
  export function valueFlagMismatch(ctx: RuleContext): RuleOutput[] {
    const out: RuleOutput[] = [];

    for (const conflict of conflictsOf(ctx, ['quality_flag'])) {
      const facts = factsOfConflict(ctx, conflict);
      if (facts.length === 0) continue;
      const fact = facts[0];
      const direction = fact.attrs.documentFlag ?? 'none';
      const referenceRange = fact.referenceRange;
      if (!referenceRange || referenceRange.low === undefined || referenceRange.high === undefined) continue;
      const value = fact.valueNum ?? 0;

      const builder = new ProofBuilder(`flagmismatch_${conflict.id}`);
      const premiseStep = builder.premise(
        fact,
        `${fact.label} ${value} ${fact.unit ?? ''} on ${fact.occurredAt}`,
        `Row as written: "${fact.quote}". Direction marker '${direction}' is reported together with the numeric value.`,
      );
      const ruleStep = builder.rule(
        'quality.value_flag_mismatch',
        `Reported '${direction}' flag conflicts with the reference interval ${referenceRange.low}-${referenceRange.high}`,
        [premiseStep],
        'The direction marker and the number are both read from the source, but they do not describe the same finding. The engine reports the conflict without choosing which part is wrong.',
        RULE_RELIABILITY['quality.value_flag_mismatch'] ?? 0.93,
        [fact.id],
        [fact.docId],
      );
      const conclusion = builder.conclusion(
        `Reported value and reported direction flag disagree for ${fact.label}`,
        [ruleStep],
        `The source reports ${fact.label} ${value} ${fact.unit ?? ''} as '${direction}', which is the direction marker for ${direction === 'H' ? 'high' : 'low'}, yet the printed reference interval is ${referenceRange.low}-${referenceRange.high}.`,
        combineConfidence(
          [factAuthority(fact)],
          'all',
          RULE_RELIABILITY['quality.value_flag_mismatch'] ?? 0.93,
        ),
        [fact.id],
        [fact.docId],
      );

      out.push({
        ruleId: 'quality.value_flag_mismatch',
        category: 'quality',
        severity: conflict.severity,
        title: conflict.title,
        statement: `${fact.label} reported as '${direction}' with value ${value} ${fact.unit ?? ''} conflicts with the printed reference interval ${referenceRange.low}-${referenceRange.high}.`,
        builder,
        conclusionId: conclusion,
        premiseFacts: [fact],
        entityKeys: [fact.entityKey],
        window: { start: fact.occurredAt, end: fact.occurredAt },
        question: `Is the reported value or the reported direction flag the transcription error?`,
        notConcluded:
          'The engine reports the conflict between the number and the flag. It does not decide which one is wrong, and it never rewrites the number.',
        satisfiableBy: 'A corrected result or a corrected direction marker from the reporting laboratory.',
      });
    }

    return out;
  }

  /**
   * A documented, cross-record dose difference for one medication. Both sources,
   * both dates, both spans and the stated uncertainty are preserved; no dose is
   * selected as correct.
   */
  export function crossRecordDoseDiscrepancy(ctx: RuleContext): RuleOutput[] {
    const out: RuleOutput[] = [];

    for (const conflict of conflictsOf(ctx, ['cross_record_dose_discrepancy'])) {
      const facts = factsOfConflict(ctx, conflict);
      if (facts.length < 2) continue;

      const [earlier, later] = facts[0].occurredAt <= facts[1].occurredAt ? [facts[0], facts[1]] : [facts[1], facts[0]];
      const label = labelForConflict(ctx, conflict);

      const docTitle = (docId: string): string => {
        const doc = ctx.graph.documents.find((d) => d.id === docId);
        return doc?.title ?? 'document';
      };

      const builder = new ProofBuilder(`crossdose_${conflict.id}`);
      const earlierStep = builder.premise(
        earlier,
        `${label} ${earlier.attrs.dose} ${earlier.attrs.doseUnit ?? ''} on ${earlier.occurredAt}`,
        `Earlier source: ${docTitle(earlier.docId)} (${earlier.occurredAt}) — "${earlier.quote}".`,
      );
      const laterStep = builder.premise(
        later,
        `${label} ${later.attrs.dose} ${later.attrs.doseUnit ?? ''} on ${later.occurredAt}`,
        `Later source: ${docTitle(later.docId)} (${later.occurredAt}) — "${later.quote}".`,
      );

      const ruleStep = builder.rule(
        'quality.cross_record_dose_discrepancy',
        `${label} is documented at two different doses in the record`,
        [earlierStep, laterStep],
        'Both documents were read independently, and at least one of them states that the patient is unsure which dose is correct. The engine reports the two documented doses without choosing either one.',
        RULE_RELIABILITY['quality.cross_record_dose_discrepancy'] ?? 0.8,
        [earlier.id, later.id],
        [earlier.docId, later.docId],
      );

      const conclusion = builder.conclusion(
        `${label} dose documented differently across two records`,
        [ruleStep],
        `${label} was documented at ${earlier.attrs.dose} ${earlier.attrs.doseUnit ?? ''} on ${earlier.occurredAt} and at ${later.attrs.dose} ${later.attrs.doseUnit ?? ''} on ${later.occurredAt}. The patient's uncertainty is documented in the later reconciliation.`,
        combineConfidence(
          [factAuthority(earlier), factAuthority(later)],
          'all',
          RULE_RELIABILITY['quality.cross_record_dose_discrepancy'] ?? 0.8,
        ),
        [earlier.id, later.id],
        [earlier.docId, later.docId],
      );

      out.push({
        ruleId: 'quality.cross_record_dose_discrepancy',
        category: 'quality',
        severity: conflict.severity,
        title: conflict.title,
        statement: `${label} is documented at ${earlier.attrs.dose} ${earlier.attrs.doseUnit ?? ''} on ${earlier.occurredAt} and ${later.attrs.dose} ${later.attrs.doseUnit ?? ''} on ${later.occurredAt}.`,
        builder,
        conclusionId: conclusion,
        premiseFacts: [earlier, later],
        entityKeys: [earlier.entityKey],
        window: { start: earlier.occurredAt, end: later.occurredAt },
        question: `Which ${label} dose is currently correct, and why do the two records disagree?`,
        notConcluded:
          'The engine does not decide which dose is correct. Both documented doses are shown with their dates, sources and the uncertainty stated in the record.',
        satisfiableBy: 'A clarifying medication reconciliation after the later date.',
      });
    }

    return out;
  }

