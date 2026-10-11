import type { RuleContext, RuleOutput } from './rule';
import { ProofBuilder, RULE_RELIABILITY, combineConfidence, factAuthority } from './rule';
import { factsForEntity } from './rulesSupport';
import { daysBetween, formatDate } from '../text/normalize';
import { CDC_SCHEDULE_URL } from '../evidence';
import type { DocKind } from '../types';

const ANNUAL_VACCINES: Array<{ key: string; label: string }> = [
  { key: 'influenza-vaccine', label: 'Influenza vaccine' },
  { key: 'covid19-vaccine', label: 'COVID-19 vaccine' },
];

/**
 * Document kinds that could carry an immunization statement.
 *
 * An absence finding has no fact to point at, so it points at the scope it
 * searched instead. Without this, a gap rule emits a conclusion with no evidence
 * pointer whatsoever, and a reader has no way to check it — which defeats the
 * point of every other finding in the engine.
 */
const VACCINE_BEARING_KINDS: DocKind[] = [
  'vaccination_record',
  'visit_note',
  'discharge_summary',
  'procedure_note',
];

/**
 * A routine annual immunization with no dose inside the last year.
 *
 * Only checked when the record itself spans more than a year, because otherwise
 * the absence is an artefact of the import window rather than a gap in care.
 */
export function immunizationDue(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];
  const recordDays = daysBetween(ctx.graph.stats.spanStart, ctx.asOf);
  if (recordDays < 400) return out;

  // The documents that were searched. Cited by every finding below.
  const scopeDocs = ctx.graph.documents.filter(
    (doc) => doc.date <= ctx.asOf && VACCINE_BEARING_KINDS.includes(doc.kind),
  );
  const scopeDocIds = scopeDocs.map((doc) => doc.id);

  for (const vaccine of ANNUAL_VACCINES) {
    const entityKey = `immunization:${vaccine.key}`;
    const facts = factsForEntity(ctx, entityKey).filter((f) => f.occurredAt <= ctx.asOf);
    const recent = facts.filter((f) => daysBetween(f.occurredAt, ctx.asOf) <= 365);
    if (recent.length > 0) continue;

    const last = facts[facts.length - 1];
    const builder = new ProofBuilder(`vax_${vaccine.key}_${ctx.asOf}`);
    const premises: string[] = [];

    if (last) {
      premises.push(
        builder.premise(
          last,
          `Most recent ${vaccine.label} on ${last.occurredAt}`,
          `This is the latest ${vaccine.label} statement in the record.`,
        ),
      );
    } else {
      premises.push(
        builder.add({
          kind: 'premise',
          label: `No ${vaccine.label} in ${scopeDocs.length} searched document${scopeDocs.length === 1 ? '' : 's'}`,
          factIds: [],
          docIds: scopeDocIds,
          justification:
            scopeDocs.length === 0
              ? 'The record contains no document of a kind that records immunizations, so there was nothing to search. This is a statement about the record.'
              : `All ${scopeDocs.length} documents that could carry an immunization were searched and none contains this one. This is a statement about the record, not about the patient.`,
          confidence: scopeDocs.length === 0 ? 0.5 : 0.6,
        }),
      );
    }

    const ruleStep = builder.rule(
      'gap.immunization_due',
      `No dose within 365 days of ${ctx.asOf}`,
      premises,
      `The record spans ${Math.round(recordDays / 30.44)} months, so the absence of an annual dose is a gap in the record rather than an artefact of a short import window.`,
      RULE_RELIABILITY['gap.immunization_due'] ?? 0.84,
      last ? [last.id] : [],
      last ? [last.docId] : scopeDocIds,
    );
    const conclusion = builder.conclusion(
      `${vaccine.label} is not documented in the last year`,
      [ruleStep],
      'The engine reports the absence of documentation and cites the schedule it compared against. It does not conclude that the vaccine was not given.',
      combineConfidence(last ? [factAuthority(last)] : [0.6], 'all', 0.84),
      last ? [last.id] : [],
      last ? [last.docId] : scopeDocIds,
    );

    out.push({
      ruleId: 'gap.immunization_due',
      category: 'gap',
      severity: 'low',
      title: `${vaccine.label} not documented in the last year`,
      statement: last
        ? `The most recent ${vaccine.label} in the record is dated ${formatDate(last.occurredAt)}, more than a year before ${formatDate(ctx.asOf)}.`
        : `No ${vaccine.label} appears in any of the ${scopeDocs.length} documents that could have recorded one.`,
      builder,
      conclusionId: conclusion,
      premiseFacts: last ? [last] : [],
      entityKeys: [entityKey],
      window: { start: last?.occurredAt ?? ctx.graph.stats.spanStart, end: ctx.asOf },
      question: `Has ${vaccine.label} been given in the last year, and is it recorded elsewhere?`,
      notConcluded:
        'The engine compares the record against the published schedule. It does not conclude that a vaccine was withheld, declined, or contraindicated.',
      satisfiableBy: `A vaccination record showing ${vaccine.label} after ${formatDate(last?.occurredAt ?? ctx.graph.stats.spanStart)}.`,
      guideline: {
        title: 'CDC immunization schedules',
        source: 'CDC',
        url: CDC_SCHEDULE_URL,
      },
    });
  }

  return out;
}
