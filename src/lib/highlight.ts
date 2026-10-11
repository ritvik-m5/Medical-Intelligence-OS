import type { Fact, SourceDocument } from '../engine/types';

export interface HighlightSegment {
  text: string;
  factId?: string;
  /** CSS class fragment describing the fact kind, e.g. `is-measurement`. */
  kindClass?: string;
  flagged?: boolean;
}

/**
 * Split a document into renderable segments with its facts highlighted.
 *
 * The reason this exists: showing a fact next to a document is not provenance.
 * Showing the exact characters the engine read, inside the document they came
 * from, is. Overlapping spans are resolved longest-first so the display never
 * renders the same characters twice.
 */
export function highlightDocument(doc: SourceDocument, facts: Fact[]): HighlightSegment[] {
  const spans = facts
    .map((fact) => ({ fact, start: fact.span[0], end: fact.span[1] }))
    .filter((s) => s.end > s.start && s.start >= 0 && s.end <= doc.text.length)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      segments.push({ text: doc.text.slice(cursor, span.start) });
    }
    segments.push({
      text: doc.text.slice(span.start, span.end),
      factId: span.fact.id,
      kindClass: `is-${span.fact.type}`,
      flagged: span.fact.flags.length > 0,
    });
    cursor = span.end;
  }
  if (cursor < doc.text.length) segments.push({ text: doc.text.slice(cursor) });
  return segments;
}

/** Wrap the quoted span inside its surrounding context, for the drawer. */
export function quoteWithContext(doc: SourceDocument, span: [number, number], radius = 300): {
  before: string;
  quote: string;
  after: string;
} {
  const start = Math.max(0, span[0] - radius);
  const end = Math.min(doc.text.length, span[1] + radius);
  return {
    before: (start > 0 ? '…' : '') + doc.text.slice(start, span[0]),
    quote: doc.text.slice(span[0], span[1]),
    after: doc.text.slice(span[1], end) + (end < doc.text.length ? '…' : ''),
  };
}
