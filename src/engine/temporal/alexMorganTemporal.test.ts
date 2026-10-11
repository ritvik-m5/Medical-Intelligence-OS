import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findContradictions, qualityFlags } from '../contradiction';
import { derive, buildRuleContext } from '../derive/engine';
import { conflictsOf } from '../derive/conflicts';
import { buildGraph } from '../graph';
import { ingestDocument, type DocumentInput } from '../ingest';
import { derivePatientFromCorpus } from '../patient/derive';
import { snapshotAt } from '../timeline';
import {
  filterContradictionsAsOf,
  filterQualityFlagsAsOf,
  factsKnowableAsOf,
} from './eligibility';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/medical-records-data.json');

interface FixtureDoc {
  title: string;
  kind: DocumentInput['kind'];
  date: string;
  facility?: string;
  author?: string;
  text: string;
}

function buildFromDocs(docs: FixtureDoc[], sequenceBase = 3000) {
  const inputs: DocumentInput[] = docs.map((doc) => ({
    title: doc.title,
    kind: doc.kind,
    date: doc.date,
    facility: doc.facility,
    author: doc.author,
    text: doc.text,
    origin: 'upload',
  }));
  const results = inputs.map((input, index) => ingestDocument(input, sequenceBase + index));
  const patient = derivePatientFromCorpus(
    { id: 'local-record', name: '', synthetic: false },
    results,
  );
  return buildGraph(patient, results);
}

function metforminCrossRecord(contradictions: ReturnType<typeof findContradictions>) {
  return contradictions.find(
    (c) => c.kind === 'cross_record_dose_discrepancy' && c.entityKey === 'medication:metformin',
  );
}

function potassiumQuality(flags: ReturnType<typeof qualityFlags>) {
  return flags.find(
    (f) => f.kind === 'implausible_measurement' && f.entityKey === 'measurement:potassium',
  );
}

function metforminDerivation(asOf: string, graph: ReturnType<typeof buildGraph>) {
  return derive(graph, asOf).find((d) => d.ruleId === 'quality.cross_record_dose_discrepancy' && d.entityKeys.includes('medication:metformin'));
}

function potassiumDerivation(asOf: string, graph: ReturnType<typeof buildGraph>) {
  return derive(graph, asOf).find(
    (d) => d.ruleId === 'quality.implausible_value' && d.entityKeys.includes('measurement:potassium'),
  );
}

describe('Alex Morgan temporal eligibility', () => {
  const allDocs = JSON.parse(readFileSync(FIXTURE, 'utf8')) as FixtureDoc[];
  const fullGraph = buildFromDocs(allDocs);

  it('A: hides metformin cross-record discrepancy before June reconciliation is knowable', () => {
    const beforeJune = '2026-06-23';
    const filtered = filterContradictionsAsOf(findContradictions(fullGraph), fullGraph, beforeJune);
    expect(metforminCrossRecord(filtered)).toBeUndefined();
    expect(metforminDerivation(beforeJune, fullGraph)).toBeUndefined();

    const onJune = '2026-06-24';
    const onDay = filterContradictionsAsOf(findContradictions(fullGraph), fullGraph, onJune);
    const hit = metforminCrossRecord(onDay);
    expect(hit).toBeDefined();
    expect(hit!.detail).toMatch(/unsure|500|1000/i);
    expect(metforminDerivation(onJune, fullGraph)).toBeDefined();
  });

  it('B: hides potassium quality flag before September lab is knowable', () => {
    const beforeLab = '2026-09-14';
    expect(filterQualityFlagsAsOf(qualityFlags(fullGraph), beforeLab).find((f) => f.entityKey === 'measurement:potassium')).toBeUndefined();
    expect(potassiumDerivation(beforeLab, fullGraph)).toBeUndefined();
    expect(
      factsKnowableAsOf(fullGraph, beforeLab).some(
        (f) => f.entityKey === 'measurement:potassium' && f.valueNum === 45,
      ),
    ).toBe(false);

    const onLabDay = '2026-09-15';
    const flag = potassiumQuality(filterQualityFlagsAsOf(qualityFlags(fullGraph), onLabDay));
    expect(flag).toBeDefined();
    expect(flag!.facts[0].valueNum).toBe(45);
    expect(potassiumDerivation(onLabDay, fullGraph)).toBeDefined();
  });

  it('D: snapshot facts match knowable facts for the same asOf', () => {
    for (const cutoff of ['2026-06-23', '2026-06-24', '2026-09-14', '2026-09-15']) {
      const snap = snapshotAt(fullGraph, cutoff);
      const eligible = factsKnowableAsOf(fullGraph, cutoff);
      expect(new Set(snap.facts.map((f) => f.id))).toEqual(new Set(eligible.map((f) => f.id)));
    }
  });

  it('derive conflicts agree with filtered contradictions for metformin and potassium', () => {
    const ctx = (asOf: string) => buildRuleContext(fullGraph, asOf);
    expect(conflictsOf(ctx('2026-06-23'), ['cross_record_dose_discrepancy']).some((c) => c.entityKey === 'medication:metformin')).toBe(false);
    expect(conflictsOf(ctx('2026-06-24'), ['cross_record_dose_discrepancy']).some((c) => c.entityKey === 'medication:metformin')).toBe(true);
    expect(conflictsOf(ctx('2026-09-14'), ['implausible_measurement']).some((c) => c.entityKey === 'measurement:potassium')).toBe(false);
    expect(conflictsOf(ctx('2026-09-15'), ['implausible_measurement']).some((c) => c.entityKey === 'measurement:potassium')).toBe(true);
  });
});

describe('Alex Morgan future-evidence leakage', () => {
  const allDocs = JSON.parse(readFileSync(FIXTURE, 'utf8')) as FixtureDoc[];
  const earlyDocs = allDocs.slice(0, 3);
  const throughJune = allDocs.slice(0, 4);

  it('Test 1: adding June reconciliation does not change June 23 semantic output', () => {
    const cutoff = '2026-06-23';
    const partial = buildFromDocs(earlyDocs, 4000);
    const baseline = {
      snap: snapshotAt(partial, cutoff),
      derivations: derive(partial, cutoff).map((d) => d.id).sort(),
      metformin: metforminDerivation(cutoff, partial),
    };

    const expanded = buildFromDocs(throughJune, 4000);
    const after = {
      snap: snapshotAt(expanded, cutoff),
      derivations: derive(expanded, cutoff).map((d) => d.id).sort(),
      metformin: metforminDerivation(cutoff, expanded),
    };

    expect(after.metformin).toBeUndefined();
    expect(baseline.metformin).toBeUndefined();
    expect(after.snap.totals).toEqual(baseline.snap.totals);
    expect(after.derivations).toEqual(baseline.derivations);
  });

  it('Test 2: adding September lab does not change September 14 snapshot', () => {
    const cutoff = '2026-09-14';
    const partial = buildFromDocs(throughJune, 5000);
    const baselineSnap = snapshotAt(partial, cutoff);
    const baselinePotassium = potassiumDerivation(cutoff, partial);

    const full = buildFromDocs(allDocs, 5000);
    const afterSnap = snapshotAt(full, cutoff);
    const afterPotassium = potassiumDerivation(cutoff, full);

    expect(baselinePotassium).toBeUndefined();
    expect(afterPotassium).toBeUndefined();
    expect(afterSnap.totals).toEqual(baselineSnap.totals);
    expect(
      afterSnap.facts.some((f) => f.entityKey === 'measurement:potassium' && f.valueNum === 45),
    ).toBe(false);
  });

  it('Test 4: remove and restore future document restores later-only findings', () => {
    const cutoffLate = '2026-09-15';
    const full = buildFromDocs(allDocs, 6000);
    expect(potassiumDerivation(cutoffLate, full)).toBeDefined();

    const withoutLab = buildFromDocs(allDocs.slice(0, 4), 6000);
    expect(potassiumDerivation(cutoffLate, withoutLab)).toBeUndefined();

    const restored = buildFromDocs(allDocs, 6000);
    expect(potassiumDerivation(cutoffLate, restored)).toBeDefined();
  });

  it('Test 6: ingestion order does not change historical derivation ids', () => {
    const cutoff = '2026-06-23';
    const forward = buildFromDocs(allDocs, 7000);
    const shuffled = buildFromDocs([allDocs[2], allDocs[0], allDocs[1], allDocs[3], allDocs[4]], 8000);
    const a = derive(forward, cutoff).map((d) => `${d.ruleId}:${d.entityKeys.join(',')}`).sort();
    const b = derive(shuffled, cutoff).map((d) => `${d.ruleId}:${d.entityKeys.join(',')}`).sort();
    expect(a).toEqual(b);
  });
});
