import { describe, expect, it } from 'vitest';
import { buildCohortGraphs, buildPrimaryGraph } from '../../data/cohortIndex';
import { analyseCohort, COHORT_QUERIES, runCohortQuery } from './cohort';
import { AuditLog, MemoryAuditStore } from './audit';
import { loadRecord, saveRecord, MemoryBackend } from './persistence';

const graph = buildPrimaryGraph();

describe('cohort layer', () => {
  const cohort = buildCohortGraphs();
  const analysis = analyseCohort(
    cohort.map((c) => ({ id: c.id, label: c.label, graph: c.graph })),
    '2026-12-31',
  );

  it('analyses every subject with the same engines', () => {
    expect(analysis.subjects.length).toBe(3);
    expect(analysis.totalFindings).toBeGreaterThan(10);
    expect(analysis.rulePrevalence.length).toBeGreaterThan(3);
  });

  it('reports prevalence as a share of subjects', () => {
    for (const prevalence of analysis.rulePrevalence) {
      expect(prevalence.share).toBeGreaterThan(0);
      expect(prevalence.share).toBeLessThanOrEqual(100);
      expect(prevalence.subjects).toBeLessThanOrEqual(3);
    }
  });

  it('runs every cohort query and always carries a caveat', () => {
    for (const query of COHORT_QUERIES) {
      const hits = runCohortQuery(analysis, query);
      expect(Array.isArray(hits)).toBe(true);
      expect(query.caveat.length).toBeGreaterThan(20);
    }
  });

  it('always states that prevalence is not epidemiological', () => {
    expect(analysis.notes[0]).toContain('not in a population');
  });
});

describe('audit log', () => {
  it('appends, filters and exports', () => {
    const log = new AuditLog(new MemoryAuditStore());
    log.record('ingest', 'Imported a document', { docIds: ['doc_1'] });
    log.record('query', 'Asked about cholesterol', { factIds: ['fct_1'] });
    expect(log.all().length).toBe(2);
    expect(log.filter('query').length).toBe(1);
    expect(log.toJSON()).toContain('medical-memory.audit/v1');
  });
});

describe('persistence', () => {
  it('round-trips the corpus rather than the derived graph', () => {
    const backend = new MemoryBackend();
    const save = saveRecord(backend, graph, [
      { title: 'x', kind: 'visit_note', text: 'hello', origin: 'paste' },
    ]);
    expect(save.ok).toBe(true);
    const loaded = loadRecord(backend);
    expect(loaded.status).toBe('loaded');
    expect(loaded.record?.documents.length).toBe(1);
  });

  it('refuses to silently load a future schema', () => {
    const backend = new MemoryBackend();
    backend.write('medical-memory.record.v1', JSON.stringify({ version: 99, documents: [] }));
    const loaded = loadRecord(backend);
    expect(loaded.status).toBe('version-mismatch');
    expect(loaded.message).toContain('migration');
  });

  it('reports corruption rather than throwing', () => {
    const backend = new MemoryBackend();
    backend.write('medical-memory.record.v1', 'not json at all');
    const loaded = loadRecord(backend);
    expect(loaded.status).toBe('corrupt');
    expect(loaded.record).toBeNull();
  });
});
