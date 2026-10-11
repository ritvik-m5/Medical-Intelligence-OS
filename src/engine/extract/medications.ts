import type { FactFlag, SectionKind } from '../types';
import type { ExtractContext, FactDraft } from './context';
import { overlaps, preferredKindsFor } from './context';
import { matchConcepts, pickSpec } from '../text/lexicon';
import { entityKeyFor } from '../text/lexiconTypes';
import { buildDraft } from './draft';
import { clauseAround, detectDose } from './status';
import { pushFlag } from './confidence';

const MED_SECTIONS: SectionKind[] = [
  'current_medications',
  'discontinued_medications',
  'medication_history',
  'plan',
  'history',
  'instructions',
];

const MED_LIST_SECTIONS: SectionKind[] = [
  'current_medications',
  'discontinued_medications',
  'medication_history',
];

/** "Avoid penicillins" is not a prescription. */
const AVOIDANCE = /\b(avoid|do not take|do not use|never take|not to take|refrain from|discontinue use of)\b/i;

/** Cues that make a medication mention trustworthy outside a medication section. */
const MED_CUES =
  /\b(prescribed|started on|started|initiated|taking|continues|continue|discontinued|stopped|restarted|dose|dosage|mg\b|mcg\b|units\b|refill|rx\b|prn\b|daily|bid\b|tid\b|qhs\b)\b/i;

export function extractMedications(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];

  for (const seg of ctx.segments) {
    const sectionKind = seg.section?.kind;
    const inMedSection = sectionKind ? MED_SECTIONS.includes(sectionKind) : false;
    if (sectionKind === 'allergies' || sectionKind === 'immunizations') continue;
    if (!inMedSection && !MED_CUES.test(seg.text)) continue;

    const preferred = preferredKindsFor(sectionKind);
    const consumed: Array<[number, number]> = [];

    for (const m of matchConcepts(seg.text)) {
      const span: [number, number] = [seg.start + m.start, seg.start + m.end];
      if (overlaps(consumed, span)) continue;
      const spec = pickSpec(m.specs, preferred.length ? preferred : ['medication']);
      if (spec.kind !== 'medication') continue;

      // A bare drug name with no dose context inside a prose paragraph is weak;
      // inside a medication list it is strong. The extractor records which it was.
      const dose = detectDose(seg.text, m.start, m.end);
      const [cs, ce] = clauseAround(seg.text, m.start, m.end);
      const quote = seg.text.slice(cs, ce).trim();
      const inMedList = sectionKind ? MED_LIST_SECTIONS.includes(sectionKind) : false;
      if (!inMedList && AVOIDANCE.test(quote)) continue;

      const flags: FactFlag[] = [];
      if (!dose.dose && !inMedSection) pushFlag(flags, 'ambiguous_text');

      const draft = buildDraft({
        ctx,
        spec,
        label: spec.label,
        entityKey: entityKeyFor('medication', spec.key),
        span,
        quote,
        extractor: inMedSection ? 'med.section-list' : 'med.inline',
        sectionKind,
        sectionId: seg.section?.id,
        date: ctx.doc.date,
        attrs: {
          drugClass: spec.drugClass ?? spec.category,
          dose: dose.dose ?? 'not stated',
          doseUnit: dose.doseUnit ?? 'not stated',
          route: dose.route ?? 'not stated',
          frequency: dose.frequency ?? 'not stated',
          asNeeded: dose.asNeeded,
          doseText: dose.raw ?? '',
        },
      });
      draft.flags.push(...flags);
      drafts.push(draft);
      consumed.push(span);
    }
  }

  return drafts;
}
