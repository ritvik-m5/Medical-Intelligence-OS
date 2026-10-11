import type { FactDraft } from './context';
import type { ExtractContext } from './context';
import { overlaps, preferredKindsFor } from './context';
import { matchConcepts, pickSpec, SPEC_BY_ENTITY_KEY } from '../text/lexicon';
import { entityKeyFor } from '../text/lexiconTypes';
import { buildDraft } from './draft';
import { clauseAround } from './status';
import { parseDate } from '../text/normalize';

const SYMPTOM_CUES = /\b(reports?|complains? of|complaining of|c\/o|denies|endorses|with|presents? with|symptoms?|feels?|noted)\b/i;
const SOCIAL_CUES = /\b(smok(?:e|es|er|ing)|tobacco|alcohol|etoh|drinks?|exercise|exercises|activity|sedentary|diet|packs per day|pack-year)\b/i;

/** Reported symptoms, kept separate from diagnoses on purpose. */
export function extractSymptoms(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];
  for (const seg of ctx.segments) {
    const sectionKind = seg.section?.kind;
    if (sectionKind === 'current_medications' || sectionKind === 'allergies' || sectionKind === 'immunizations') continue;
    const allowed =
      sectionKind === 'history' ||
      sectionKind === 'assessment' ||
      sectionKind === 'impression' ||
      sectionKind === 'plan' ||
      sectionKind === 'results' ||
      sectionKind === 'social_history';
    if (!allowed && !SYMPTOM_CUES.test(seg.text)) continue;

    const preferred = preferredKindsFor(sectionKind);
    const consumed: Array<[number, number]> = [];
    for (const m of matchConcepts(seg.text)) {
      const span: [number, number] = [seg.start + m.start, seg.start + m.end];
      if (overlaps(consumed, span)) continue;
      const spec = pickSpec(m.specs, preferred.length ? preferred : ['symptom']);
      if (spec.kind !== 'symptom') continue;
      const [cs, ce] = clauseAround(seg.text, m.start, m.end);
      drafts.push(
        buildDraft({
          ctx,
          spec,
          label: spec.label,
          entityKey: entityKeyFor('symptom', spec.key),
          span,
          quote: seg.text.slice(cs, ce).trim(),
          extractor: 'symptom.mention',
          sectionKind,
          sectionId: seg.section?.id,
          date: ctx.doc.date,
          attrs: { category: spec.category, reported: true },
        }),
      );
      consumed.push(span);
    }
  }
  return drafts;
}

export function extractSocial(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];
  for (const seg of ctx.segments) {
    const sectionKind = seg.section?.kind;
    const inSection = sectionKind === 'social_history';
    if (!inSection && !SOCIAL_CUES.test(seg.text)) continue;

    const consumed: Array<[number, number]> = [];
    for (const m of matchConcepts(seg.text)) {
      const span: [number, number] = [seg.start + m.start, seg.start + m.end];
      if (overlaps(consumed, span)) continue;
      const spec = pickSpec(m.specs, ['social']);
      if (spec.kind !== 'social') continue;
      const [cs, ce] = clauseAround(seg.text, m.start, m.end);
      const clause = seg.text.slice(cs, ce).trim();
      drafts.push(
        buildDraft({
          ctx,
          spec,
          label: spec.label,
          entityKey: entityKeyFor('social', spec.key),
          span,
          quote: clause,
          extractor: 'social.mention',
          sectionKind,
          sectionId: seg.section?.id,
          date: ctx.doc.date,
          attrs: { category: spec.category, detail: clause },
        }),
      );
      consumed.push(span);
    }
  }
  return drafts;
}

const BLOOD_TYPE = /\b(?:blood (?:type|group)|abo)\b[:\s]*([ABO]{1,2})\s*(positive|negative|\+|-|pos|neg)\b/i;
const DOB = /\b(?:date of birth|dob)\b[:\s]*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[A-Za-z]{3,9}\.?\s+[0-9]{1,2},?\s*[0-9]{4})/i;
const SEX = /\b(?:sex|gender)\b[:\s]*(male|female|nonbinary|non-binary)\b/i;

/**
 * Demographic assertions. These are dull but they are exactly the fields where a
 * silently wrong value causes harm downstream, so they are extracted with spans
 * like everything else and checked for mutual consistency.
 */
export function extractDemographics(ctx: ExtractContext): FactDraft[] {
  const drafts: FactDraft[] = [];
  const text = ctx.doc.text;
  const push = (
    key: string,
    label: string,
    valueText: string,
    match: RegExpExecArray,
    attrs: Record<string, string | number | boolean>,
  ) => {
    const entityKey = entityKeyFor('demographic', key);
    const spec = SPEC_BY_ENTITY_KEY.get(entityKey);
    if (!spec) return;
    drafts.push(
      buildDraft({
        ctx,
        spec,
        label,
        entityKey,
        span: [match.index, match.index + match[0].length],
        quote: match[0].trim(),
        extractor: 'demographic.pattern',
        sectionKind: 'header',
        date: ctx.doc.date,
        status: 'active',
        attrs: { ...attrs, valueText },
      }),
    );
  };

  const bt = BLOOD_TYPE.exec(text);
  if (bt) {
    const sign = /pos|positive|\+/i.test(bt[2]) ? '+' : '-';
    push('blood-type', 'Blood type', `${bt[1].toUpperCase()}${sign}`, bt, { abo: bt[1].toUpperCase(), rh: sign });
  }
  const dob = DOB.exec(text);
  if (dob) {
    const parsed = parseDate(dob[1]);
    if (parsed) push('date-of-birth', 'Date of birth', parsed, dob, { parsedDate: parsed });
  }
  const sex = SEX.exec(text);
  if (sex) push('sex', 'Sex', sex[1].toLowerCase(), sex, { raw: sex[1] });

  return drafts;
}
