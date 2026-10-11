import { describe, expect, it } from 'vitest';
import { SAMPLE_DOCUMENTS, SAMPLE_PATIENT } from '../../data/sampleCorpus';
import { reconcileImpact, describeDelta } from './reconcile';
import type { DocumentInput } from '../ingest';

/*
 * Reconciliation consequences. The invariant: the UI may never display an
 * impact number that was not returned by the deterministic engine. This test
 * proves `reconcileImpact` actually re-derives — "keep" adds a document and
 * changes real counts, "discard" changes nothing.
 */

const incoming: DocumentInput = {
  title: 'New lab panel',
  kind: 'lab_report',
  date: '2026-09-16',
  facility: 'Northside Laboratories',
  origin: 'upload',
  text: 'Hemoglobin A1c 6.8 %\nLDL Cholesterol 140 mg/dL\nPotassium 4.1 mmol/L',
};

describe('reconcileImpact', () => {
  it('keeps a document by actually re-deriving the artifact', () => {
    const result = reconcileImpact(SAMPLE_PATIENT, SAMPLE_DOCUMENTS, incoming, 'keep');

    expect(result.before.documents).toBe(SAMPLE_DOCUMENTS.length);
    expect(result.after.documents).toBe(SAMPLE_DOCUMENTS.length + 1);
    expect(result.delta.documents).toBe(1);
    // A new lab panel adds real facts and, at minimum, does not remove any.
    expect(result.after.facts).toBeGreaterThanOrEqual(result.before.facts);
    expect(result.verifiedClean).toBe(true);
  });

  it('discards by leaving the artifact untouched', () => {
    const result = reconcileImpact(SAMPLE_PATIENT, SAMPLE_DOCUMENTS, incoming, 'discard');

    expect(result.after).toEqual(result.before);
    expect(result.delta).toEqual({ documents: 0, facts: 0, intervals: 0, findings: 0 });
  });

  it('reports the delta in plain words', () => {
    const result = reconcileImpact(SAMPLE_PATIENT, SAMPLE_DOCUMENTS, incoming, 'keep');
    expect(describeDelta(result.delta)).toContain('+1 document');
    expect(describeDelta({ documents: 0, facts: 0, intervals: 0, findings: 0 })).toContain('no change');
  });
});
