import type {
  DocKind,
  Fact,
  ISODate,
  ISODateTime,
  SourceDocument,
} from './types';
import { docId as makeDocId, factId } from './ids';
import { buildSections, buildSegments } from './extract/segments';
import { extractMeasurements } from './extract/measurements';
import { extractMedications } from './extract/medications';
import { extractConditions } from './extract/conditions';
import { extractAllergies, extractImmunizations, extractProcedures } from './extract/clinical';
import { extractDemographics, extractSocial, extractSymptoms } from './extract/contextual';
import type { FactDraft } from './extract/context';
import { DATE_PATTERN, parseDate } from './text/normalize';

export interface DocumentInput {
  title: string;
  kind: DocKind;
  date?: ISODate;
  periodStart?: ISODate;
  periodEnd?: ISODate;
  facility?: string;
  author?: string;
  text: string;
  origin: SourceDocument['origin'];
  fileName?: string;
  mimeType?: string;
  ingestedAt?: ISODateTime;
}

/** Heuristic text-quality score: OCR noise and control characters lower it. */
function assessQuality(text: string): number {
  if (!text) return 0.2;
  const odd = (text.match(/[^\x20-\x7E\n\r\t°µ–—’“”≥≤×·]/g) ?? []).length;
  const ratio = odd / Math.max(1, text.length);
  const veryLong = text.split('\n').filter((l) => l.length > 400).length;
  let quality = 0.98 - ratio * 4;
  if (veryLong > 3) quality -= 0.08;
  return Math.max(0.3, Math.min(0.99, Math.round(quality * 100) / 100));
}

/** Find the most plausible document date when the caller did not supply one. */
export function inferDocumentDate(text: string): ISODate {
  const head = text.slice(0, 600);
  const patterns: RegExp[] = [
    new RegExp(`(?:collected|collection date|specimen date|result date|date of service|service date|visit date|date)\\s*[:#]?\\s*(${DATE_PATTERN})`, 'i'),
    new RegExp(`(${DATE_PATTERN})`),
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(head);
    if (m) {
      const parsed = parseDate(m[1]);
      if (parsed) return parsed;
    }
  }
  const year = new Date().getUTCFullYear();
  return `${year}-01-01`;
}

export interface IngestResult {
  document: SourceDocument;
  facts: Fact[];
  /** Extractor name → number of facts produced. Useful for the extraction inspector. */
  extractorCounts: Record<string, number>;
}

/**
 * Ingest one document end to end: build sections, run every extractor, then
 * reconcile. Nothing is thrown away silently — duplicates are merged, and the
 * losing duplicate's extractor is recorded on the winner.
 */
export function ingestDocument(input: DocumentInput, sequence = 0): IngestResult {
  const date = input.date ?? inferDocumentDate(input.text);
  const id = makeDocId(input.origin + String(sequence), date, input.title);
  const quality = assessQuality(input.text);
  const sections = buildSections(id, input.text);

  const document: SourceDocument = {
    id,
    title: input.title,
    kind: input.kind,
    date,
    facility: input.facility,
    author: input.author,
    origin: input.origin,
    ingestedAt: input.ingestedAt ?? `${date}T09:00`,
    mimeType: input.mimeType,
    fileName: input.fileName,
    text: input.text,
    sections,
    quality,
  };

  const ctx = { doc: document, segments: buildSegments(document) };

  const drafts: FactDraft[] = [
    ...extractMeasurements(ctx),
    ...extractMedications(ctx),
    ...extractConditions(ctx),
    ...extractProcedures(ctx),
    ...extractAllergies(ctx),
    ...extractImmunizations(ctx),
    ...extractSymptoms(ctx),
    ...extractSocial(ctx),
    ...extractDemographics(ctx),
  ];

  const { facts, extractorCounts } = reconcile(drafts, document);
  return { document, facts, extractorCounts };
}

/**
 * Merge duplicate drafts. Two drafts collide when they assert the same entity at
 * the same span, or the same measurement value on the same date. The higher
 * confidence wins and the other extractor is recorded, so a merged fact can still
 * be audited.
 */
export function reconcile(drafts: FactDraft[], doc: SourceDocument): { facts: Fact[]; extractorCounts: Record<string, number> } {
  const extractorCounts: Record<string, number> = {};
  const byKey = new Map<string, FactDraft>();

  for (const draft of drafts) {
    extractorCounts[draft.extractor] = (extractorCounts[draft.extractor] ?? 0) + 1;
    const key =
      draft.type === 'measurement' || draft.type === 'vital'
        ? `${draft.entityKey}|${draft.occurredAt}|${draft.valueNum ?? 'none'}|${draft.unit ?? ''}`
        : `${draft.entityKey}|${draft.span[0]}|${draft.span[1]}`;
    const existing = byKey.get(key);
    if (!existing || draft.confidence > existing.confidence) {
      if (existing) {
        draft.attrs.mergedFrom = existing.extractor;
        draft.flags.push(...existing.flags.filter((f) => !draft.flags.includes(f)));
      }
      byKey.set(key, draft);
    } else {
      existing.attrs.alsoFoundBy = draft.extractor;
    }
  }

  const facts: Fact[] = [];
  for (const draft of Array.from(byKey.values()).sort((a, b) => a.span[0] - b.span[0])) {
    facts.push({
      id: factId([
        doc.id,
        draft.entityKey,
        draft.span[0],
        draft.span[1],
        draft.valueNum ?? draft.status,
      ]),
      type: draft.type,
      entityKey: draft.entityKey,
      label: draft.label,
      valueNum: draft.valueNum,
      valueText: draft.valueText,
      unit: draft.unit,
      comparator: draft.comparator,
      referenceRange: draft.referenceRange,
      status: draft.status,
      occurredAt: draft.occurredAt,
      periodEnd: draft.periodEnd,
      docId: doc.id,
      docKind: doc.kind,
      sectionId: draft.sectionId,
      sectionKind: draft.sectionKind,
      span: draft.span,
      quote: draft.quote,
      extractor: draft.extractor,
      confidence: draft.confidence,
      flags: draft.flags,
      attrs: draft.attrs,
    });
  }

  return { facts, extractorCounts };
}
