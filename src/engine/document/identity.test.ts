import { describe, expect, it } from 'vitest';
import {
  assessDuplicate,
  compareFacts,
  normalizeContent,
  type DocumentShape,
} from './identity';

/*
 * Document identity. The hard invariant under test: a normalized duplicate
 * must NEVER erase medically meaningful differences. Whitespace and line
 * endings collapse; numbers, units, dates, doses, negations and headings do
 * not.
 */

const base: DocumentShape = {
  title: 'Lipid Panel',
  kind: 'lab_report',
  date: '2026-09-15',
  facility: 'Northside Laboratories',
  text: 'LDL Cholesterol 132 mg/dL\nHDL Cholesterol 46 mg/dL\nPotassium 4.3 mmol/L',
};

const withText = (text: string): DocumentShape => ({ ...base, text });

describe('normalizeContent', () => {
  it('collapses whitespace and line endings', () => {
    expect(normalizeContent('LDL   132  mg/dL\r\nHDL  46\r\n')).toBe(
      'LDL 132 mg/dL\nHDL 46',
    );
  });

  it('normalizes Unicode form', () => {
    // "mg/dL" with a combining slash vs precomposed: same after NFC.
    expect(normalizeContent('Vitamine\u0301 D')).toBe(normalizeContent('Vitamine\u0301 D'));
  });

  it('never erases numbers, units, negations, or headings', () => {
    const text = 'Current Medications\nAtorvastatin 20 mg\nDenies chest pain\n';
    const normalized = normalizeContent(text);
    expect(normalized).toContain('20');
    expect(normalized).toContain('mg');
    expect(normalized).toContain('Denies');
    expect(normalized).toContain('Current Medications');
  });
});

describe('assessDuplicate', () => {
  it('detects an exact duplicate', () => {
    const result = assessDuplicate(base, { ...base });
    expect(result.type).toBe('exact');
  });

  it('detects a whitespace-only duplicate as normalized', () => {
    const messy = withText('LDL   Cholesterol   132 mg/dL\nHDL Cholesterol 46 mg/dL\nPotassium 4.3 mmol/L\n');
    const result = assessDuplicate(base, messy);
    expect(result.type).toBe('normalized');
  });

  it('detects line-ending differences as normalized', () => {
    const crlf = withText('LDL Cholesterol 132 mg/dL\r\nHDL Cholesterol 46 mg/dL\r\nPotassium 4.3 mmol/L');
    expect(assessDuplicate(base, crlf).type).toBe('normalized');
  });

  it('does NOT treat a changed lab value as normalized', () => {
    const changed = withText('LDL Cholesterol 128 mg/dL\nHDL Cholesterol 46 mg/dL\nPotassium 4.3 mmol/L');
    const result = assessDuplicate(base, changed);
    expect(result.type).not.toBe('normalized');
    expect(result.type).not.toBe('exact');
    // Same metadata and structure, but a value differs: likely the same record.
    expect(result.type).toBe('likely-same');
  });

  it('does NOT treat a unit change as normalized', () => {
    const changed = withText('LDL Cholesterol 132 mmol/L\nHDL Cholesterol 46 mg/dL\nPotassium 4.3 mmol/L');
    const result = assessDuplicate(base, changed);
    expect(result.type).not.toBe('normalized');
    expect(result.type).not.toBe('likely-same');
  });

  it('does NOT treat a date change as a duplicate', () => {
    const later = { ...base, date: '2026-09-16' };
    const result = assessDuplicate(base, later);
    expect(result.type).not.toBe('exact');
    expect(result.type).not.toBe('normalized');
    expect(result.type).toBe('related');
  });

  it('does NOT treat a negation change as normalized', () => {
    const a = withText('Denies chest pain\nLDL 132 mg/dL');
    const b = withText('Reports chest pain\nLDL 132 mg/dL');
    expect(assessDuplicate(a, b).type).not.toBe('normalized');
    expect(assessDuplicate(a, b).type).not.toBe('likely-same');
  });

  it('detects a dose change as likely-same, not normalized', () => {
    const a: DocumentShape = { title: 'Medication List', kind: 'medication_list', date: '2026-06-24', facility: 'Riverbend', text: 'Atorvastatin 20 mg at bedtime' };
    const b = { ...a, text: 'Atorvastatin 40 mg at bedtime' };
    const result = assessDuplicate(a, b);
    expect(result.type).toBe('likely-same');
  });

  it('marks unrelated documents as distinct', () => {
    const other: DocumentShape = { title: 'Chest X-Ray', kind: 'imaging_report', date: '2025-01-01', facility: 'Other Hospital', text: 'No acute abnormality.' };
    expect(assessDuplicate(base, other).type).toBe('distinct');
  });

  it('explains why, instead of only scoring', () => {
    const changed = withText('LDL Cholesterol 128 mg/dL\nHDL Cholesterol 46 mg/dL\nPotassium 4.3 mmol/L');
    const result = assessDuplicate(base, changed);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.matchingFields).toContain('date');
    expect(result.matchingFields).toContain('kind');
  });
});

describe('compareFacts', () => {
  it('counts added, removed, and changed facts by entity key', () => {
    const diff = compareFacts(
      [
        { entityKey: 'measurement:ldl-cholesterol', valueNum: 132, unit: 'mg/dL' },
        { entityKey: 'measurement:potassium', valueNum: 4.3, unit: 'mmol/L' },
      ],
      [
        { entityKey: 'measurement:ldl-cholesterol', valueNum: 128, unit: 'mg/dL' },
        { entityKey: 'measurement:tsh', valueNum: 2.8, unit: 'mIU/L' },
      ],
    );

    expect(diff.changed).toBe(1); // LDL value changed
    expect(diff.added).toBe(1); // TSH
    expect(diff.removed).toBe(1); // Potassium
    expect(diff.same).toBe(0);
  });
});
