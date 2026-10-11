import { describe, expect, it } from 'vitest';
import { buildCohortGraphs, buildPrimaryGraph } from '../../data/cohortIndex';
import { redact } from './redactApply';
import { REDACTION_POLICIES } from './redactPolicy';
import { assessQuality } from './quality';
import { derive } from '../derive/engine';

const graph = buildPrimaryGraph();

describe('de-identification', () => {
  const policy = REDACTION_POLICIES.find((p) => p.id === 'research')!;
  const result = redact(graph, policy);

  it('never mutates the input graph', () => {
    const before = graph.facts.length;
    redact(graph, policy);
    expect(graph.facts.length).toBe(before);
  });

  it('removes the excluded kinds and says so', () => {
    expect(result.graph.facts.some((f) => f.entityKey.startsWith('demographic:'))).toBe(false);
    expect(result.graph.facts.some((f) => f.entityKey.startsWith('social:'))).toBe(false);
    expect(result.manifest.removed.some((r) => r.kind === 'entity-kind')).toBe(true);
    expect(result.manifest.counts.factsRemoved).toBeGreaterThan(0);
  });

  it('shifts dates by a constant so intervals survive', () => {
    const sorted = [...graph.documents].sort((a, b) => a.date.localeCompare(b.date));
    const redacted = [...result.graph.documents].sort((a, b) => a.date.localeCompare(b.date));
    expect(redacted[0].date < sorted[0].date).toBe(true);
    const before = Date.parse(sorted[1].date) - Date.parse(sorted[0].date);
    const after = Date.parse(redacted[1].date) - Date.parse(redacted[0].date);
    expect(after).toBe(before);
  });

  it('recomputes identifiers so the export cannot be joined back', () => {
    const originalIds = new Set(graph.facts.map((f) => f.id));
    expect(result.graph.facts.some((f) => originalIds.has(f.id))).toBe(false);
  });

  it('pseudonymises the subject and records residual risk', () => {
    expect(result.graph.patient.name).toMatch(/^Subject-/);
    expect(result.manifest.residualRisk.length).toBeGreaterThan(0);
  });

  it('keeps every fact anchored to a span after redaction', () => {
    for (const fact of result.graph.facts) {
      const doc = result.graph.documents.find((d) => d.id === fact.docId);
      expect(doc).toBeDefined();
      expect(doc!.text.slice(fact.span[0], fact.span[1]).length).toBeGreaterThan(0);
    }
  });
});

describe('record quality', () => {
  it('scores every dimension and reports provenance integrity', () => {
    const report = assessQuality({
      graph,
      derivations: derive(graph, graph.stats.spanEnd),
      asOf: graph.stats.spanEnd,
    });
    expect(report.dimensions.length).toBeGreaterThanOrEqual(9);
    expect(report.overall).toBeGreaterThan(0);
    expect(report.overall).toBeLessThanOrEqual(100);
    expect(report.dimensions.find((d) => d.id === 'provenance')!.score).toBe(100);
  });

  it('scores different records differently', () => {
    const cohort = buildCohortGraphs();
    const scores = cohort.map(
      (entry) =>
        assessQuality({
          graph: entry.graph,
          derivations: derive(entry.graph, entry.graph.stats.spanEnd),
          asOf: entry.graph.stats.spanEnd,
        }).overall,
    );
    expect(scores.every((s) => s > 0 && s <= 100)).toBe(true);
    expect(new Set(scores).size).toBeGreaterThan(1);
  });
});
