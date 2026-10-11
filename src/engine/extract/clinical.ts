import type { SectionKind } from '../types';
import type { ExtractContext, FactDraft } from './context';
import { overlaps, preferredKindsFor } from './context';
import { matchConcepts, pickSpec } from '../text/lexicon';
import { entityKeyFor } from '../text/lexiconTypes';
import { buildDraft } from './draft';
import { clauseAround } from './status';

const ALLERGY_CUES = /\b(allerg(?:y|ies|ic)|intoleran(?:t|ce)|adverse reaction|reaction to|anaphylaxis|hypersensitivity)\b/i;
const NO_ALLERGY = /\b(nkda|no known (?:drug )?allergies|no known allergies|no allergies|denies allergies)\b/i;

const IMMUNIZATION_CUES = /\b(vaccine|vaccination|vaccinated|immuniz(?:ed|ation)|administered|booster|dose \d of)\b/i;
const PROCEDURE_CUES = /\b(underwent|performed|procedure|surgery|surgical|scheduled for|referred for|recommended|status post|s\/p|completed on|was done|biopsy|imaging|scan)\b/i;

/**
 * Allergies. Only produced where the document actually frames them as allergies,
 * because "penicillin" in a plan section is a prescription, not a contraindication.
 */
export function extractAllergies(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];
  for (const seg of ctx.segments) {
    const sectionKind = seg.section?.kind;
    const inSection = sectionKind === 'allergies';
    if (!inSection && !ALLERGY_CUES.test(seg.text)) continue;
    if (NO_ALLERGY.test(seg.text) && !inSection) continue;

    const preferred = preferredKindsFor(sectionKind);
    const consumed: Array<[number, number]> = [];
    for (const m of matchConcepts(seg.text)) {
      const span: [number, number] = [seg.start + m.start, seg.start + m.end];
      if (overlaps(consumed, span)) continue;
      const spec = pickSpec(m.specs, ['allergy', ...preferred]);
      if (spec.kind !== 'allergy') continue;
      const [cs, ce] = clauseAround(seg.text, m.start, m.end);
      drafts.push(
        buildDraft({
          ctx,
          spec,
          label: spec.label,
          entityKey: entityKeyFor('allergy', spec.key),
          span,
          quote: seg.text.slice(cs, ce).trim(),
          extractor: 'allergy.explicit',
          sectionKind,
          sectionId: seg.section?.id,
          date: ctx.doc.date,
          status: 'active',
          attrs: {
            category: spec.category,
            reaction: reactionFor(seg.text.slice(cs, ce)),
            fromAllergySection: inSection,
          },
        }),
      );
      consumed.push(span);
    }
  }
  return drafts;
}

function reactionFor(clause: string): string {
  const m = /\b(?:reaction|reactions|symptoms?)\s*[:\-]?\s*([a-z ,/]{3,60})/i.exec(clause);
  if (m) return m[1].trim();
  const common = /\b(rash|hives|urticaria|swelling|angioedema|anaphylaxis|difficulty breathing|nausea|vomiting|itching|cough|gi upset|intolerance)\b/i.exec(clause);
  return common ? common[1] : 'not documented';
}

export function extractImmunizations(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];
  for (const seg of ctx.segments) {
    const sectionKind = seg.section?.kind;
    const inSection = sectionKind === 'immunizations';
    if (!inSection && !IMMUNIZATION_CUES.test(seg.text)) continue;

    const consumed: Array<[number, number]> = [];
    for (const m of matchConcepts(seg.text)) {
      const span: [number, number] = [seg.start + m.start, seg.start + m.end];
      if (overlaps(consumed, span)) continue;
      const spec = pickSpec(m.specs, ['immunization']);
      if (spec.kind !== 'immunization') continue;
      const [cs, ce] = clauseAround(seg.text, m.start, m.end);
      drafts.push(
        buildDraft({
          ctx,
          spec,
          label: spec.label,
          entityKey: entityKeyFor('immunization', spec.key),
          span,
          quote: seg.text.slice(cs, ce).trim(),
          extractor: 'immunization.explicit',
          sectionKind,
          sectionId: seg.section?.id,
          date: ctx.doc.date,
          status: 'completed',
          attrs: { category: spec.category },
        }),
      );
      consumed.push(span);
    }
  }
  return drafts;
}

const PROCEDURE_SECTIONS: SectionKind[] = ['procedures', 'plan', 'history', 'assessment', 'impression'];

export function extractProcedures(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];
  for (const seg of ctx.segments) {
    const sectionKind = seg.section?.kind;
    const inSection = sectionKind ? PROCEDURE_SECTIONS.includes(sectionKind) : false;
    if (!inSection && !PROCEDURE_CUES.test(seg.text)) continue;

    const consumed: Array<[number, number]> = [];
    for (const m of matchConcepts(seg.text)) {
      const span: [number, number] = [seg.start + m.start, seg.start + m.end];
      if (overlaps(consumed, span)) continue;
      const spec = pickSpec(m.specs, ['procedure']);
      if (spec.kind !== 'procedure') continue;
      const [cs, ce] = clauseAround(seg.text, m.start, m.end);
      drafts.push(
        buildDraft({
          ctx,
          spec,
          label: spec.label,
          entityKey: entityKeyFor('procedure', spec.key),
          span,
          quote: seg.text.slice(cs, ce).trim(),
          extractor: 'procedure.mention',
          sectionKind,
          sectionId: seg.section?.id,
          date: ctx.doc.date,
          attrs: { category: spec.category, modality: spec.category },
        }),
      );
      consumed.push(span);
    }
  }
  return drafts;
}
