import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findContradictions, qualityFlags } from '../contradiction';
import { buildGraph } from '../graph';
import { ingestDocument, type DocumentInput } from '../ingest';
import { derivePatientFromCorpus } from '../patient/derive';
import { verifyFacts } from '../verify';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/medical-records-data.json');

interface FixtureDoc {
  title: string;
  kind: DocumentInput['kind'];
  date: string;
  facility?: string;
  author?: string;
  text: string;
}

function buildAlexMorganGraph() {
  const data = JSON.parse(readFileSync(FIXTURE, 'utf8')) as FixtureDoc[];
  const inputs: DocumentInput[] = data.map((doc) => ({
    title: doc.title,
    kind: doc.kind,
    date: doc.date,
    facility: doc.facility,
    author: doc.author,
    text: doc.text,
    origin: 'upload',
  }));
  const results = inputs.map((input, index) => ingestDocument(input, 2000 + index));
  const patient = derivePatientFromCorpus(
    { id: 'local-record', name: '', synthetic: false },
    results,
  );
  return buildGraph(patient, results);
}

describe('Alex Morgan medication reconciliation (5-document fixture)', () => {
  const graph = buildAlexMorganGraph();
  const contradictions = findContradictions(graph);

  it('does not treat discontinued atorvastatin 20 mg as a same-day active dose conflict with 40 mg', () => {
    const doseConflict = contradictions.find(
      (c) => c.kind === 'dose_conflict' && c.entityKey === 'medication:atorvastatin',
    );
    expect(doseConflict).toBeUndefined();

    const atorFacts = graph.facts.filter((f) => f.entityKey === 'medication:atorvastatin');
    const june = atorFacts.filter((f) => f.occurredAt === '2026-06-24');
    const active40 = june.find((f) => f.status === 'active' && f.attrs.dose === 40);
    const stopped20 = june.find((f) => f.status === 'discontinued' && f.attrs.dose === 20);
    expect(active40).toBeDefined();
    expect(stopped20).toBeDefined();
  });

  it('surfaces metformin 1000 mg vs 500 mg as a cross-record dose discrepancy with uncertainty', () => {
    const hit = contradictions.find(
      (c) =>
        c.kind === 'cross_record_dose_discrepancy' && c.entityKey === 'medication:metformin',
    );
    expect(hit).toBeDefined();
    expect(hit!.detail.toLowerCase()).toMatch(/unsure|500|1000/);
    expect(hit!.notConcluded.toLowerCase()).toMatch(/does not decide/);
  });

  it('does not label semaglutide or lisinopril cross-date differences as dose errors', () => {
    for (const key of ['medication:semaglutide', 'medication:lisinopril'] as const) {
      const errorKinds = contradictions.filter(
        (c) =>
          c.entityKey === key &&
          (c.kind === 'dose_conflict' || c.kind === 'cross_record_dose_discrepancy'),
      );
      expect(errorKinds).toEqual([]);
    }
  });
});

describe('Alex Morgan potassium provenance (September 2026 lab)', () => {
  const graph = buildAlexMorganGraph();
  const contradictions = findContradictions(graph);

  it('preserves 45 mmol/L as the source-reported value with a plausibility flag', () => {
    const potassium = graph.facts.filter(
      (f) => f.entityKey === 'measurement:potassium' && f.valueNum === 45,
    );
    expect(potassium.length).toBe(1);
    expect(potassium[0].flags).toContain('implausible_value');
    expect(potassium[0].valueNum).toBe(45);
    expect(potassium[0].attrs.canonicalisedFrom).toBeUndefined();
  });

  it('links the numeric 45 in the source text, not only the label Potassium', () => {
    const fact = graph.facts.find(
      (f) => f.entityKey === 'measurement:potassium' && f.valueNum === 45,
    )!;
    const doc = graph.documents.find((d) => d.id === fact.docId)!;
    const slice = doc.text.slice(fact.span[0], fact.span[1]);
    expect(slice).toMatch(/\b45\b/);
    expect(fact.quote).toContain('45');
    const verification = verifyFacts(graph);
    expect(verification.problems.length).toBe(0);
  });

  it('classifies the potassium issue as a data-quality anomaly, not a cross-document disagreement', () => {
    const implausible = qualityFlags(graph).find(
      (c) => c.kind === 'implausible_measurement' && c.entityKey === 'measurement:potassium',
    );
    expect(implausible).toBeDefined();
    const valueConflict = contradictions.find(
      (c) => c.kind === 'measurement_value_conflict' && c.entityKey === 'measurement:potassium',
    );
    expect(valueConflict).toBeUndefined();
  });
});
