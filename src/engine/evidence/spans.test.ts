import { describe, expect, it } from 'vitest';
import { buildSampleGraph } from '../../data/sampleCorpus';
import { evidenceSpansForFact, validateFactEvidenceSpans } from './spans';

describe('evidence spans', () => {
  const graph = buildSampleGraph();
  const potassium = graph.facts.find(
    (f) => f.entityKey === 'measurement:potassium' && f.valueNum === 45,
  )!;

  it('exposes value and entity spans for table-row measurements', () => {
    const doc = graph.documents.find((d) => d.id === potassium.docId)!;
    const spans = evidenceSpansForFact(doc, potassium);
    expect(spans.some((s) => s.role === 'value' && s.text.includes('45'))).toBe(true);
    expect(spans.some((s) => s.role === 'entity' && /potassium/i.test(s.text))).toBe(true);
    expect(validateFactEvidenceSpans(doc, potassium)).toEqual([]);
  });
});
