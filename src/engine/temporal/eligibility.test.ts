import { describe, expect, it } from 'vitest';
import { buildSampleGraph } from '../../data/sampleCorpus';
import { findContradictions } from '../contradiction';
import { filterContradictionsAsOf } from './eligibility';

describe('filterContradictionsAsOf', () => {
  const graph = buildSampleGraph();

  it('drops conflicts that cite a future fact', () => {
    const all = findContradictions(graph);
    expect(all.length).toBeGreaterThan(0);
    const early = filterContradictionsAsOf(all, graph, '2022-01-01');
    expect(early.length).toBeLessThan(all.length);
    for (const conflict of early) {
      for (const id of conflict.factIds) {
        const fact = graph.facts.find((f) => f.id === id);
        expect(fact!.occurredAt <= '2022-01-01').toBe(true);
      }
    }
  });
});
