import { describe, expect, it } from 'vitest';
import { buildSampleGraph } from '../data/sampleCorpus';
import { findContradictions, qualityFlags } from './contradiction';
import { diffSnapshots, snapshotAt } from './timeline';
import { ask, detectIntent, resolveEntities } from './query';

const graph = buildSampleGraph();

describe('ingestion and graph construction', () => {
  it('ingests every sample document', () => {
    expect(graph.documents.length).toBe(18);
    expect(graph.facts.length).toBeGreaterThan(200);
    expect(graph.entities.length).toBeGreaterThan(60);
  });

  it('keeps every fact anchored to a real span in its source document', () => {
    for (const fact of graph.facts) {
      const doc = graph.documents.find((d) => d.id === fact.docId);
      expect(doc).toBeDefined();
      const slice = doc!.text.slice(fact.span[0], fact.span[1]);
      expect(slice.length).toBeGreaterThan(0);
      expect(fact.quote.length).toBeGreaterThan(0);
      expect(fact.span[1]).toBeGreaterThan(fact.span[0]);
      // The strongest provenance invariant: the characters the engine claims to
      // have read must actually be inside the quote it shows the user.
      expect(fact.quote).toContain(slice);
    }
  });

  it('records extractor, confidence and flags on every fact', () => {
    for (const fact of graph.facts) {
      expect(fact.extractor).toBeTruthy();
      expect(fact.confidence).toBeGreaterThan(0);
      expect(fact.confidence).toBeLessThanOrEqual(0.99);
      expect(Array.isArray(fact.flags)).toBe(true);
    }
  });

  it('reads the LDL series across the whole timeline', () => {
    const ldl = graph.facts
      .filter((f) => f.entityKey === 'measurement:ldl-cholesterol')
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const values = ldl.map((f) => f.valueNum);
    expect(values).toContain(142);
    expect(values).toContain(132);
    expect(ldl[0].occurredAt).toBe('2022-03-21');
  });

  it('reads the A1c series and keeps restated values out of the reading series', () => {
    const a1c = graph.facts.filter((f) => f.entityKey === 'measurement:hemoglobin-a1c');
    const values = new Set(a1c.map((f) => f.valueNum));
    expect(values).toEqual(new Set([5.9, 5.8, 6.4, 6.1, 6.6]));

    const readings = a1c
      .filter((f) => f.attrs.restated !== true)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    expect(readings[0].occurredAt).toBe('2022-03-21');
    expect(readings[0].valueNum).toBe(5.9);
  });

  it('marks values that are restated in later narrative notes', () => {
    const restated = graph.facts.filter((f) => f.attrs.restated === true);
    expect(restated.length).toBeGreaterThan(0);
    for (const fact of restated) {
      expect(fact.flags).toContain('historical_context');
    }
  });

  it('flags the decimal-shift potassium value instead of believing it', () => {
    const potassium = graph.facts.filter(
      (f) => f.entityKey === 'measurement:potassium' && f.valueNum === 45,
    );
    expect(potassium.length).toBe(1);
    expect(potassium[0].flags).toContain('implausible_value');
    expect(String(potassium[0].attrs.plausibilityNote)).toContain('4.5');
  });

  it('never produces a measurement fact from a dosing unit', () => {
    const bogus = graph.facts.filter(
      (f) => f.entityKey === 'measurement:vitamin-d-25-oh' && (f.valueNum ?? 0) > 300,
    );
    expect(bogus).toEqual([]);
  });

  it('marks inferred relations so they can be distinguished from read ones', () => {
    const inferred = graph.edges.filter((e) => e.inferred);
    const stated = graph.edges.filter((e) => !e.inferred);
    expect(inferred.length).toBeGreaterThan(0);
    expect(stated.length).toBeGreaterThan(inferred.length);
  });
});


describe('contradiction engine', () => {
  const contradictions = findContradictions(graph);

  it('detects the medication that is stopped and then listed as current', () => {
    const hit = contradictions.find((c) => c.entityKey === 'medication:atorvastatin');
    expect(hit).toBeDefined();
    expect(['medication_status_conflict', 'medication_listed_after_stop']).toContain(hit!.kind);
    expect(hit!.factIds.length).toBeGreaterThanOrEqual(2);
    expect(hit!.questionForClinician).toBeTruthy();
    expect(hit!.notConcluded.length).toBeGreaterThan(20);
  });

  it('detects the prescription written against a recorded allergy', () => {
    const hit = contradictions.find((c) => c.kind === 'medication_allergy_conflict');
    expect(hit).toBeDefined();
    expect(hit!.docIds.length).toBeGreaterThanOrEqual(2);
  });

  it('detects the conflicting blood type', () => {
    const hit = contradictions.find((c) => c.entityKey === 'demographic:blood-type');
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe('high');
  });

  it('detects the implausible potassium result as a data-quality warning', () => {
    const hit = qualityFlags(graph).find(
      (c) => c.kind === 'implausible_measurement' && c.entityKey === 'measurement:potassium',
    );
    expect(hit).toBeDefined();
    expect(contradictions.find((c) => c.kind === 'implausible_measurement')).toBeUndefined();
  });

  it('detects the same measurement reported twice with different values on one date', () => {
    const hit = contradictions.find(
      (c) => c.kind === 'measurement_value_conflict' && c.entityKey === 'measurement:potassium',
    );
    expect(hit).toBeDefined();
  });

  it('detects the condition that is resolved and later documented again', () => {
    const hit = contradictions.find((c) => c.kind === 'condition_resolution_conflict');
    expect(hit).toBeDefined();
  });

  it('never concludes a cause, and always asks a resolvable question', () => {
    for (const c of contradictions) {
      expect(c.factIds.length).toBeGreaterThan(0);
      expect(c.docIds.length).toBeGreaterThan(0);
      expect(c.questionForClinician.length).toBeGreaterThan(10);
      expect(c.notConcluded.length).toBeGreaterThan(20);
      expect(c.window.start <= c.window.end).toBe(true);
      for (const id of c.factIds) {
        expect(graph.facts.some((f) => f.id === id)).toBe(true);
      }
    }
  });
});

describe('time machine', () => {
  it('shows only what was documented as of the requested date', () => {
    const snapshot = snapshotAt(graph, '2023-03-02');
    expect(snapshot.totals.documents).toBe(4);
    expect(snapshot.medications.map((m) => m.entityKey)).toContain('medication:atorvastatin');
    expect(snapshot.medications.map((m) => m.entityKey)).not.toContain('medication:metformin');
    expect(snapshot.measurements.every((m) => m.latest.occurredAt <= '2023-03-02')).toBe(true);
  });

  it('keeps the audit trail of how a status was reached', () => {
    const snapshot = snapshotAt(graph, '2025-06-24');
    const atorvastatin = snapshot.medications.find((m) => m.entityKey === 'medication:atorvastatin');
    expect(atorvastatin).toBeDefined();
    expect(atorvastatin!.statusTrail.length).toBeGreaterThanOrEqual(2);
  });

  it('grows the record as the clock advances', () => {
    const early = snapshotAt(graph, '2022-12-31');
    const late = snapshotAt(graph, '2026-12-31');
    expect(late.totals.facts).toBeGreaterThan(early.totals.facts);
    expect(late.totals.documents).toBeGreaterThan(early.totals.documents);
  });

  it('reports documented change between two dates, always with a caveat', () => {
    const before = snapshotAt(graph, '2025-01-31');
    const after = snapshotAt(graph, '2026-02-28');
    const changes = diffSnapshots(before, after);
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      expect(change.caveat.length).toBeGreaterThan(10);
      expect(change.deltaText.length).toBeGreaterThan(10);
    }
    expect(changes.some((c) => c.entityKey === 'medication:semaglutide')).toBe(true);
  });
});

describe('query engine', () => {
  it('classifies intents', () => {
    expect(detectIntent('Are there conflicts in my records?')).toBe('conflict');
    expect(detectIntent('What changed since last year?')).toBe('change');
    expect(detectIntent('What is my A1c trend?')).toBe('trend');
    expect(detectIntent('What does the potassium test measure?')).toBe('lab_explanation');
    expect(detectIntent('What records do you have?')).toBe('coverage');
    expect(detectIntent('Give me a summary')).toBe('summary');
  });

  it('resolves concepts, preferring the longest alias', () => {
    const resolution = resolveEntities(graph, 'Show me everything related to LDL cholesterol');
    expect(resolution.primary?.key).toBe('measurement:ldl-cholesterol');
  });

  it('answers a cholesterol question with personal citations only', () => {
    const answer = ask(graph, 'Show me everything in my records related to cholesterol');
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.separation.personalFacts).toBeGreaterThan(0);
    for (const citation of answer.citations) {
      const doc = graph.documents.find((d) => d.id === citation.docId);
      expect(doc).toBeDefined();
      expect(citation.quote.length).toBeGreaterThan(0);
      expect(doc!.text.slice(citation.span[0], citation.span[1]).length).toBeGreaterThan(0);
    }
  });

  it('keeps external evidence visibly separate from personal facts', () => {
    const answer = ask(graph, 'What does the potassium test measure?');
    const evidenceBlocks = answer.blocks.filter((b) => b.kind === 'evidence');
    expect(evidenceBlocks.length).toBeGreaterThan(0);
    expect(answer.separation.externalEvidence).toBeGreaterThan(0);
    expect(answer.separation.note.toLowerCase()).toContain('external');
  });

  it('never returns an answer without an auditable plan', () => {
    for (const question of [
      'Are there any conflicts in my medication list?',
      'What changed over the last year?',
      'What is my A1c trend?',
      'When was atorvastatin stopped?',
      'What records do you have?',
    ]) {
      const answer = ask(graph, question);
      expect(answer.plan.length).toBeGreaterThanOrEqual(3);
      expect(answer.blocks.length).toBeGreaterThan(0);
      expect(answer.limitations.length).toBeGreaterThan(0);
      expect(answer.coverage.documentsSearched).toBe(graph.documents.length);
    }
  });

  it('respects the as-of date supplied by the time machine', () => {
    const early = ask(graph, 'Give me a summary of my health record', { asOf: '2023-03-02' });
    const late = ask(graph, 'Give me a summary of my health record', { asOf: '2026-09-15' });
    expect(early.coverage.dateRange?.[1]).toBe('2023-03-02');
    expect(late.coverage.dateRange?.[1]).toBe('2026-09-15');
  });
});
