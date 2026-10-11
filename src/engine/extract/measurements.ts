import type { ISODate } from '../types';
import type { ExtractContext, FactDraft } from './context';
import { overlaps, preferredKindsFor } from './context';
import { matchConcepts, pickSpec } from '../text/lexicon';
import { entityKeyFor } from '../text/lexiconTypes';
import { DATE_PATTERN, parseDate } from '../text/normalize';
import { findValueAfter, findValueBefore, type FoundValue } from './values';
import { buildDraft } from './draft';
import { clauseAround } from './status';

const SEGMENT_DATE = new RegExp(`(${DATE_PATTERN})`);

/** Units that only ever express a dose, never a laboratory concentration. */
const DOSING_UNITS = new Set(['mg', 'mcg', 'g', 'units', 'iu', 'ml', 'mg/ml']);

function dateOnSegment(segText: string, docDate: ISODate): { date: ISODate; matched: boolean } {
  const m = SEGMENT_DATE.exec(segText);
  if (m) {
    const parsed = parseDate(m[1], Number(docDate.slice(0, 4)));
    if (parsed) return { date: parsed, matched: true };
  }
  return { date: docDate, matched: false };
}

/**
 * Extract measurements and vital signs.
 *
 * Two value layouts are supported because real reports use both:
 *   "LDL Cholesterol   142 H   mg/dL   (<100)"   value follows the label
 *   "142   LDL Cholesterol"                      value precedes the label
 */
export function extractMeasurements(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];
  const { doc } = ctx;

  for (const seg of ctx.segments) {
    const sectionKind = seg.section?.kind;
    const preferred = preferredKindsFor(sectionKind);
    const consumed: Array<[number, number]> = [];

    // Composite blood pressure first — "138/86" is two facts, not one number.
    const bp = /\b(?:blood pressure|bp)\b[^0-9]{0,12}(\d{2,3})\s*\/\s*(\d{2,3})/i.exec(seg.text);
    if (bp) {
      const { date } = dateOnSegment(seg.text, doc.date);
      const span: [number, number] = [seg.start + bp.index, seg.start + bp.index + bp[0].length];
      const quote = seg.text.slice(bp.index, bp.index + bp[0].length).trim();
      const pairs = [
        { key: 'systolic-blood-pressure', label: 'Systolic BP', value: Number(bp[1]), companion: 'diastolic' },
        { key: 'diastolic-blood-pressure', label: 'Diastolic BP', value: Number(bp[2]), companion: 'systolic' },
      ];
      for (const pair of pairs) {
        const spec = pickSpec(
          matchConcepts(pair.key.replace(/-/g, ' ')).flatMap((m) => m.specs),
          ['vital'],
        );
        drafts.push(
          buildDraft({
            ctx,
            spec,
            label: pair.label,
            entityKey: entityKeyFor('vital', pair.key),
            value: pair.value,
            unit: 'mmHg',
            valueText: `${pair.value} mmHg`,
            span,
            quote,
            extractor: 'vital.pattern',
            sectionKind,
            sectionId: seg.section?.id,
            date,
            attrs: { composite: 'blood-pressure', companion: pair.companion },
          }),
        );
      }
      consumed.push([bp.index, bp.index + bp[0].length]);
    }

    for (const m of matchConcepts(seg.text)) {
      const span: [number, number] = [seg.start + m.start, seg.start + m.end];
      if (overlaps(consumed, span)) continue;
      const spec = pickSpec(m.specs, preferred);
      if (spec.kind !== 'measurement' && spec.kind !== 'vital') continue;

      let found: FoundValue | null = findValueAfter(seg.text, m.end);
      if (!found) found = findValueBefore(seg.text, m.start);
      if (!found) continue;

      // A number carrying a dosing unit inside a medication list is a dose, not a
      // measurement. Without this guard, "Vitamin D 2000 units daily" becomes a
      // fabricated 2000 ng/mL lab result.
      if (found.unit && DOSING_UNITS.has(found.unit.toLowerCase())) continue;

      // Do not swallow a neighbouring concept's value.
      if (found.offset - m.end > 60) continue;
      const between = seg.text.slice(m.end, Math.max(m.end, found.offset + found.length));
      if (matchConcepts(between).length > 0) continue;

      const { date, matched } = dateOnSegment(seg.text, doc.date);
      const [cs, ce] = clauseAround(seg.text, m.start, m.end);

      // The `span` is the measurement payload (value + direction + unit +
      // reference range), not merely the concept mention. The concept mention is
      // retained in `attrs.entitySpan` so the UI can show both and the proof still
      // links to the actual value characters.
      const entitySpan: [number, number] = [seg.start + m.start, seg.start + m.end];
      const valueSpan: [number, number] = [seg.start + found.offset, seg.start + found.offset + found.length];
      const relValueEnd = found.offset + found.length;
      const quoteStart = Math.min(cs, found.offset);
      const quoteEnd = Math.max(ce, relValueEnd);

      drafts.push(
        buildDraft({
          ctx,
          spec,
          label: spec.label,
          entityKey: entityKeyFor(spec.kind, spec.key),
          value: found.value,
          unit: found.unit,
          valueText: found.raw,
          comparator: found.comparator,
          referenceRange: found.referenceRange,
          span: valueSpan,
          quote: seg.text.slice(quoteStart, quoteEnd).trim(),
          extractor: found.unit ? 'lab.table-row' : 'lab.inline',
          sectionKind,
          sectionId: seg.section?.id,
          date,
          attrs: {
            documentFlag: found.flag ?? 'none',
            dateFromSegment: matched,
            fasting: /\bfasting\b/i.test(seg.text),
            statedUnit: found.unit ?? 'not stated',
            entitySpanStart: entitySpan[0],
            entitySpanEnd: entitySpan[1],
            valueSpanStart: valueSpan[0],
            valueSpanEnd: valueSpan[1],
          },
        }),
      );
      consumed.push(entitySpan);
      consumed.push(valueSpan);
    }
  }

  return drafts;
}
