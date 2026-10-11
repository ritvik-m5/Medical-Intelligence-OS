import { describe, expect, it } from 'vitest';
import { buildSampleGraph } from '../../data/sampleCorpus';
import { derive, derivationSummary, ruleHealth } from './engine';

const graph = buildSampleGraph();
const asOf = graph.stats.spanEnd;
const derivations = derive(graph, asOf);

describe('derivation engine', () => {
  it('runs every rule without a failure', () => {
    const health = ruleHealth(graph, asOf);
    expect(health.every((h) => !h.failed)).toBe(true);
    expect(health.length).toBeGreaterThanOrEqual(14);
  });

  it('produces derivations across several categories', () => {
    const summary = derivationSummary(derivations);
    expect(summary.total).toBeGreaterThan(5);
    expect(Object.keys(summary.byCategory).length).toBeGreaterThanOrEqual(3);
  });

  it('every derivation carries a proof, a question and a non-conclusion', () => {
    for (const derivation of derivations) {
      expect(derivation.steps.length).toBeGreaterThanOrEqual(2);
      expect(derivation.question.length).toBeGreaterThan(10);
      expect(derivation.notConcluded.length).toBeGreaterThan(20);
      expect(derivation.confidence).toBeGreaterThan(0);
      expect(derivation.confidence).toBeLessThanOrEqual(0.99);
      expect(derivation.depth).toBeGreaterThanOrEqual(1);
    }
  });

  it('proof graphs are acyclic and topologically ordered', () => {
    for (const derivation of derivations) {
      const seen = new Set<string>();
      for (const step of derivation.steps) {
        for (const dependency of step.dependsOn) {
          expect(seen.has(dependency)).toBe(true);
        }
        seen.add(step.id);
      }
      expect(seen.has(derivation.conclusionId)).toBe(true);
    }
  });

  it('every premise step resolves to a real fact span', () => {
    for (const derivation of derivations) {
      for (const step of derivation.steps) {
        for (const factId of step.factIds) {
          const fact = graph.facts.find((f) => f.id === factId);
          expect(fact).toBeDefined();
          const doc = graph.documents.find((d) => d.id === fact!.docId);
          expect(doc!.text.slice(fact!.span[0], fact!.span[1]).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('detects the stale medication list through interval reasoning', () => {
    const hit = derivations.find((d) => d.ruleId === 'temporal.list_contradicts_course');
    expect(hit).toBeDefined();
    expect(hit!.entityKeys).toContain('medication:atorvastatin');
    expect(hit!.severity).toBe('high');
  });

  it('detects the allergy overlap as an interval intersection', () => {
    const hit = derivations.find((d) => d.ruleId === 'temporal.allergy_prescription_overlap');
    expect(hit).toBeDefined();
    expect(hit!.steps.some((s) => s.kind === 'interval')).toBe(true);
  });

  it('detects the implausible potassium value as a data-quality finding', () => {
    const hit = derivations.find(
      (d) =>
        d.ruleId === 'quality.implausible_value' && d.entityKeys.includes('measurement:potassium'),
    );
    expect(hit).toBeDefined();
    expect(hit!.category).toBe('quality');
  });

  it('detects the blood type mismatch', () => {
    const hit = derivations.find(
      (d) =>
        d.ruleId === 'quality.demographic_mismatch' &&
        d.entityKeys.includes('demographic:blood-type'),
    );
    expect(hit).toBeDefined();
  });

  it('ranks high severity first and is deterministic', () => {
    const severities = derivations.map((d) => d.severity);
    const firstMedium = severities.indexOf('medium');
    if (firstMedium >= 0) expect(severities.slice(firstMedium).includes('high')).toBe(false);

    const again = derive(graph, asOf);
    expect(again.map((d) => d.id)).toEqual(derivations.map((d) => d.id));
  });

  it('propagates confidence rather than asserting it', () => {
    for (const derivation of derivations) {
      const premiseConfidences = derivation.steps
        .filter((s) => s.kind === 'premise' || s.kind === 'interval')
        .map((s) => s.confidence);
      if (premiseConfidences.length === 0) continue;
      expect(derivation.confidence).toBeLessThanOrEqual(Math.min(...premiseConfidences) + 0.001);
    }
  });

  it('assigns an evidence grade from the sources behind it', () => {
    for (const derivation of derivations) {
      expect(['A', 'B', 'C', 'D']).toContain(derivation.grade);
    }
  });
});
