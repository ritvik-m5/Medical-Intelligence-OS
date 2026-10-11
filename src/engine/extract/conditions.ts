import type { SectionKind } from '../types';
import type { ExtractContext, FactDraft } from './context';
import { overlaps, preferredKindsFor } from './context';
import { matchConcepts, pickSpec } from '../text/lexicon';
import { entityKeyFor } from '../text/lexiconTypes';
import { buildDraft } from './draft';
import { clauseAround } from './status';

const CONDITION_SECTIONS: SectionKind[] = [
  'problem_list',
  'assessment',
  'impression',
  'history',
  'plan',
];

/** Cues strong enough to create a condition outside a problem/assessment section. */
const CONDITION_CUES =
  /\b(diagnos(?:ed|is)|history of|h\/o|problem list|impression|assessment|known|established|chronic|ongoing|managed for|follows? for|status post|s\/p|comorbid)\b/i;

export function extractConditions(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];

  for (const seg of ctx.segments) {
    const sectionKind = seg.section?.kind;
    if (
      sectionKind === 'allergies' ||
      sectionKind === 'immunizations' ||
      sectionKind === 'current_medications' ||
      sectionKind === 'family_history'
    ) {
      continue;
    }
    const inSection = sectionKind ? CONDITION_SECTIONS.includes(sectionKind) : false;
    if (!inSection && !CONDITION_CUES.test(seg.text)) continue;

    const preferred = preferredKindsFor(sectionKind);
    const consumed: Array<[number, number]> = [];

    for (const m of matchConcepts(seg.text)) {
      const span: [number, number] = [seg.start + m.start, seg.start + m.end];
      if (overlaps(consumed, span)) continue;
      const spec = pickSpec(m.specs, preferred.length ? preferred : ['condition']);
      if (spec.kind !== 'condition') continue;

      const [cs, ce] = clauseAround(seg.text, m.start, m.end);
      drafts.push(
        buildDraft({
          ctx,
          spec,
          label: spec.label,
          entityKey: entityKeyFor('condition', spec.key),
          span,
          quote: seg.text.slice(cs, ce).trim(),
          extractor: inSection ? 'condition.assessment' : 'condition.mention',
          sectionKind,
          sectionId: seg.section?.id,
          date: ctx.doc.date,
          attrs: {
            section: sectionKind ?? 'unknown',
            category: spec.category,
            fromAssessment: sectionKind === 'assessment' || sectionKind === 'impression',
          },
        }),
      );
      consumed.push(span);
    }
  }

  return drafts;
}
