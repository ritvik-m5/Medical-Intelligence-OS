import type { Fact, SourceDocument } from '../types';

export type EvidenceSpanRole = 'primary' | 'entity' | 'value' | 'context';

export interface ResolvedEvidenceSpan {
  role: EvidenceSpanRole;
  start: number;
  end: number;
  text: string;
}

/** Character-offset convention: half-open intervals `[start, end)` into `SourceDocument.text`. */
export function readSpan(doc: SourceDocument, span: [number, number]): string {
  const [start, end] = span;
  return doc.text.slice(start, end);
}

/** All spans that support a fact — primary span plus optional entity/value spans. */
export function evidenceSpansForFact(doc: SourceDocument, fact: Fact): ResolvedEvidenceSpan[] {
  const spans: ResolvedEvidenceSpan[] = [
    {
      role: 'primary',
      start: fact.span[0],
      end: fact.span[1],
      text: readSpan(doc, fact.span),
    },
  ];

  const valueStart = fact.attrs.valueSpanStart;
  const valueEnd = fact.attrs.valueSpanEnd;
  if (typeof valueStart === 'number' && typeof valueEnd === 'number' && valueEnd > valueStart) {
    spans.push({
      role: 'value',
      start: valueStart,
      end: valueEnd,
      text: readSpan(doc, [valueStart, valueEnd]),
    });
  }

  const entityStart = fact.attrs.entitySpanStart;
  const entityEnd = fact.attrs.entitySpanEnd;
  if (typeof entityStart === 'number' && typeof entityEnd === 'number' && entityEnd > entityStart) {
    spans.push({
      role: 'entity',
      start: entityStart,
      end: entityEnd,
      text: readSpan(doc, [entityStart, entityEnd]),
    });
  }

  return spans;
}

export interface SpanValidationProblem {
  factId: string;
  role: EvidenceSpanRole;
  reason: string;
}

/**
 * Validate every span attached to a fact against its source document and quote.
 * Failures are returned explicitly; callers decide eligibility for verified status.
 */
export function validateFactEvidenceSpans(
  doc: SourceDocument,
  fact: Fact,
): SpanValidationProblem[] {
  const problems: SpanValidationProblem[] = [];
  const spans = evidenceSpansForFact(doc, fact);

  for (const span of spans) {
    if (span.start < 0 || span.end <= span.start || span.end > doc.text.length) {
      problems.push({
        factId: fact.id,
        role: span.role,
        reason: `Span ${span.start}..${span.end} is outside the document (length ${doc.text.length}).`,
      });
      continue;
    }
    if (span.text.length === 0) {
      problems.push({ factId: fact.id, role: span.role, reason: 'Span is empty.' });
      continue;
    }
    if (!fact.quote.includes(span.text) && !doc.text.includes(span.text)) {
      problems.push({
        factId: fact.id,
        role: span.role,
        reason: 'Span text is not present in the fact quote or source document.',
      });
    }
  }

  return problems;
}
