import type { FactFlag, ISODate, ReferenceRange, SectionKind } from '../types';
import type { ConceptSpec } from '../text/lexiconTypes';
import type { ExtractContext, FactDraft } from './context';
import { assessPlausibility, resolveUnit } from './values';
import { detectStatus } from './status';
import { pushFlag, scoreConfidence } from './confidence';
import { inRange } from '../text/normalize';

/** Phrases that mean the value being quoted describes an earlier event. */
const RESTATEMENT =
  /\b(in|since|last|previous|prior|as of|during|back in)\s+(january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|year|month)\b/i;

export interface BuildDraftInput {
  ctx: ExtractContext;
  spec: ConceptSpec;
  label: string;
  entityKey: string;
  value?: number;
  unit?: string;
  valueText?: string;
  comparator?: '<' | '>' | '<=' | '>=';
  referenceRange?: ReferenceRange;
  span: [number, number];
  quote: string;
  extractor: string;
  sectionKind?: SectionKind;
  sectionId?: string;
  date: ISODate;
  status?: FactDraft['status'];
  attrs: Record<string, string | number | boolean>;
}

/**
 * Assemble one fact draft: unit resolution, plausibility, reference-range check,
 * status inference and an explainable confidence score. Every adjustment made
 * here leaves a flag or an attribute behind, so the evidence drawer can justify
 * the number instead of asserting it.
 */
export function buildDraft(input: BuildDraftInput): FactDraft {
  const { spec, ctx } = input;
  const flags: FactFlag[] = [];

  const status = detectStatus(ctx.doc.text, input.span[0], input.span[1], input.sectionKind, spec.kind);
  if (status.sectionDerived) pushFlag(flags, 'section_derived_status');
  if (status.ambiguous) pushFlag(flags, 'ambiguous_status');
  if (status.negated) pushFlag(flags, 'negative_finding');

  // "A1c 6.4 in June" is a restatement of an earlier value inside a later note.
  // It is real documentation, but it is not a new measurement, so it is marked.
  const winStart = Math.max(0, input.span[0] - 30);
  const winEnd = Math.min(ctx.doc.text.length, input.span[1] + 90);
  const restated = RESTATEMENT.test(ctx.doc.text.slice(winStart, winEnd));
  if (restated) pushFlag(flags, 'historical_context');

  let unit = input.unit;
  let value = input.value;
  let note: string | undefined;
  const attrs = { ...input.attrs };

  if (value !== undefined) {
    const resolution = resolveUnit(spec, value, input.unit);
    unit = resolution.unit;
    for (const flag of resolution.flags) pushFlag(flags, flag);
    if (resolution.converted && resolution.canonicalValue !== undefined) {
      note = resolution.note;
      attrs.canonicalisedFrom = `${input.value} ${input.unit ?? ''}`.trim();
      value = resolution.canonicalValue;
    } else if (resolution.canonicalValue !== undefined) {
      value = resolution.canonicalValue;
    }

    const plausibility = assessPlausibility(spec, value);
    for (const flag of plausibility.flags) pushFlag(flags, flag);
    if (plausibility.implausible) {
      note = plausibility.note;
      attrs.plausibilityNote = plausibility.note ?? '';
      if (plausibility.flag === 'critical') pushFlag(flags, 'critical_value');
    }
  }

  const referenceRange: ReferenceRange | undefined = input.referenceRange ?? spec.ref;
  const rangeFromDocument = Boolean(input.referenceRange);
  if (referenceRange && !rangeFromDocument) attrs.referenceRangeSource = 'illustrative-typical';

  if (value !== undefined && referenceRange) {
    const ok = inRange(value, referenceRange);
    if (ok === false) pushFlag(flags, 'outside_reference_range');
    attrs.inReferenceRange = ok === null ? 'unknown' : ok;
  }

  const confidence = scoreConfidence({
    extractor: input.extractor,
    hasUnit: Boolean(unit),
    hasDocumentedRange: rangeFromDocument,
    statusAmbiguous: status.ambiguous,
    statusFromSection: status.sectionDerived,
    implausible: flags.includes('implausible_value'),
    unitInferred: flags.includes('unit_inferred'),
    negated: flags.includes('negative_finding'),
    restated,
    docQuality: ctx.doc.quality,
    entityResolved: true,
  });

  return {
    type: spec.kind,
    entityKey: input.entityKey,
    label: input.label,
    spec,
    valueNum: value,
    valueText: input.valueText,
    unit,
    comparator: input.comparator,
    referenceRange,
    status: input.status ?? status.status,
    occurredAt: input.date,
    sectionKind: input.sectionKind ?? 'unknown',
    sectionId: input.sectionId,
    span: input.span,
    quote: input.quote,
    extractor: input.extractor,
    confidence,
    flags,
    attrs: {
      ...attrs,
      restated,
      statusCue: status.cue ?? 'none',
      extractionNote: note ?? '',
    },
  };
}
