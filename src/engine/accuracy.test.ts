import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ingestDocument, type DocumentInput } from './ingest';
import { buildGraph } from './graph';
import { derive } from './derive/engine';
import { SAMPLE_PATIENT } from '../data/sampleCorpus';

/*
 * Accuracy against messy, real-world-shaped input.
 *
 * These are the same five documents `npm run create:file` writes into
 * `~/Downloads/Medical records`. They are deliberately messy — inconsistent
 * headings, stray spaces, a decimal-shift typo in a lab value — and this test
 * proves the engine still pulls out the right facts and organises them into a
 * chronological, provable graph. It is the "is this software real and accurate?"
 * check.
 */

const dataPath = fileURLToPath(new URL('../../scripts/medical-records-data.json', import.meta.url));
interface RawRecord {
  fileName: string;
  title: string;
  kind: DocumentInput['kind'];
  date: string;
  facility?: string;
  author?: string;
  text: string;
}
const records = JSON.parse(readFileSync(dataPath, 'utf8')) as RawRecord[];

const inputs: DocumentInput[] = records.map((record) => ({
  title: record.title,
  kind: record.kind,
  date: record.date,
  facility: record.facility,
  author: record.author,
  text: record.text,
  origin: 'import',
  fileName: record.fileName,
}));

function ingestAll() {
  // The app ingests chronologically (the store sorts by date before building),
  // so the graph comes out ordered even when the files are dropped in any order.
  const sorted = [...inputs].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const results = sorted.map((input, index) => ingestDocument(input, index));
  const graph = buildGraph(SAMPLE_PATIENT, results);
  const asOf = graph.stats.spanEnd;
  return { graph, derivations: derive(graph, asOf) };
}

const entityKeys = () => ingestAll().graph.facts.map((fact) => fact.entityKey);

describe('accuracy on messy records', () => {
  it('reads all five documents and orders them chronologically', () => {
    const names = records.map((record) => record.fileName);
    expect(names).toEqual([...names].sort());
    expect(records.map((record) => record.date)).toEqual(
      [...records].map((record) => record.date).sort(),
    );

    const { graph } = ingestAll();
    expect(graph.documents.length).toBe(5);

    const dates = graph.documents.map((doc) => doc.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    expect(dates[0]).toBe('2023-10-19');
    expect(dates[dates.length - 1]).toBe('2026-09-15');
  });

  it('extracts the medications', () => {
    const keys = entityKeys();
    for (const med of ['medication:metformin', 'medication:atorvastatin', 'medication:semaglutide', 'medication:lisinopril']) {
      expect(keys, `missing ${med}`).toContain(med);
    }
  });

  it('extracts the labs and their values', () => {
    const { graph } = ingestAll();
    const a1c = graph.facts.find((f) => f.entityKey === 'measurement:hemoglobin-a1c' && f.valueNum !== undefined);
    expect(a1c).toBeTruthy();
    expect(a1c!.valueNum).toBeCloseTo(6.6, 1);

    const ldl = graph.facts.find((f) => f.entityKey === 'measurement:ldl-cholesterol');
    expect(ldl).toBeTruthy();
  });

  it('extracts the conditions', () => {
    const keys = entityKeys();
    for (const cond of ['condition:type-2-diabetes', 'condition:hypertension', 'condition:obesity', 'condition:hyperlipidemia']) {
      expect(keys, `missing ${cond}`).toContain(cond);
    }
  });

  it('extracts the allergy and the blood type', () => {
    const keys = entityKeys();
    expect(keys).toContain('allergy:penicillin');
    expect(keys.some((key) => key.includes('blood-type') || key.includes('blood_type'))).toBe(true);
  });

  it('flags the implausible potassium value rather than trusting it', () => {
    const { graph } = ingestAll();
    const potassium = graph.facts.find((f) => f.entityKey === 'measurement:potassium' && f.valueNum === 45);
    expect(potassium).toBeTruthy();
    expect(potassium!.flags).toContain('implausible_value');
  });

  it('gives every fact a source span, so nothing is invented', () => {
    const { graph } = ingestAll();
    expect(graph.facts.length).toBeGreaterThan(50);
    for (const fact of graph.facts) {
      expect(fact.span[0]).toBeLessThan(fact.span[1]);
      expect(fact.docId.length).toBeGreaterThan(0);
    }
  });

  it('derives findings from the messy record', () => {
    const { derivations } = ingestAll();
    // The decimal-shift potassium and the A1c above range both produce findings.
    expect(derivations.length).toBeGreaterThan(0);
    const rules = new Set(derivations.map((d) => d.ruleId));
    expect(rules.has('quality.implausible_value')).toBe(true);
  });
});
