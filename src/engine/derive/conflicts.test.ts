import { describe, expect, it } from 'vitest';
import { buildRuleContext } from './engine';
import { derive } from './engine';
import { conflictsOf, factsOfConflict, groupFacts, labelForConflict } from './conflicts';
import { findContradictions, qualityFlagContradictions } from '../contradiction';
import { buildPrimaryGraph } from '../../data/cohortIndex';
import { addDays } from '../text/normalize';

/* Conflict-layer tests.
 *
 * Two claims are being defended. First, that detection now happens once, so the
 * raw conflict list and the derivations built from it cannot disagree. Second,
 * that the Time Machine still works: a conflict cannot be visible before both of
 * the documents that disagree have been written.
 */

const graph = buildPrimaryGraph();
const end = graph.stats.spanEnd;

describe('detection happens once', () => {
  it('exposes the raw conflicts on the rule context', () => {
    const ctx = buildRuleContext(graph, end);
    expect(ctx.conflicts.length).toBe(
      findContradictions(graph).length + qualityFlagContradictions(graph).length,
    );
    expect(ctx.conflicts.length).toBeGreaterThan(0);
  });

  it('produces exactly one derivation per same-day conflict', () => {
    const ctx = buildRuleContext(graph, end);
    const conflicts = conflictsOf(ctx, ['measurement_value_conflict']);
    const derivations = derive(graph, end, { only: ['quality.same_day_conflict'] });

    expect(conflicts.length).toBeGreaterThan(0);
    // One conflict can carry more than one date group, so count the groups.
    const expected = conflicts.reduce((total, conflict) => {
      const facts = factsOfConflict(ctx, conflict);
      const groups = groupFacts(facts, (fact) => `${fact.occurredAt}|${fact.unit ?? 'none'}`);
      let count = 0;
      for (const group of groups.values()) {
        if (group.length >= 2 && new Set(group.map((f) => f.valueNum)).size >= 2) count += 1;
      }
      return total + count;
    }, 0);

    expect(derivations.length).toBe(expected);
  });

  it('produces one derivation per demographic conflict', () => {
    const ctx = buildRuleContext(graph, end);
    const conflicts = conflictsOf(ctx, ['demographic_conflict']);
    const derivations = derive(graph, end, { only: ['quality.demographic_mismatch'] });

    expect(conflicts.length).toBeGreaterThan(0);
    expect(derivations.length).toBe(conflicts.length);
  });

  it('cites only facts the conflict itself named', () => {
    const ctx = buildRuleContext(graph, end);
    const derivations = derive(graph, end, { only: ['quality.same_day_conflict'] });
    const conflictFacts = new Set(
      ctx.conflicts.flatMap((conflict) => conflict.factIds),
    );

    for (const derivation of derivations) {
      for (const id of derivation.factIds) expect(conflictFacts.has(id)).toBe(true);
    }
  });

  it('filters by kind', () => {
    const ctx = buildRuleContext(graph, end);
    const only = conflictsOf(ctx, ['demographic_conflict']);
    expect(only.every((conflict) => conflict.kind === 'demographic_conflict')).toBe(true);
    expect(only.length).toBeLessThan(ctx.conflicts.length);
  });
});

describe('the Time Machine still works', () => {
  it('hides a conflict until every document that disagrees has been written', () => {
    const ctx = buildRuleContext(graph, end);
    const conflicts = conflictsOf(ctx, ['measurement_value_conflict']);
    expect(conflicts.length).toBeGreaterThan(0);

    const target = conflicts[0];
    const facts = factsOfConflict(ctx, target);
    const latest = facts.reduce(
      (max, fact) => (fact.occurredAt > max ? fact.occurredAt : max),
      facts[0].occurredAt,
    );

    // One day before the latest statement, the disagreement is not yet knowable.
    const before = buildRuleContext(graph, addDays(latest, -1));
    const visibleBefore = conflictsOf(before, ['measurement_value_conflict']);
    expect(visibleBefore.some((conflict) => conflict.id === target.id)).toBe(false);

    // On the day itself, it is.
    const on = buildRuleContext(graph, latest);
    const visibleOn = conflictsOf(on, ['measurement_value_conflict']);
    expect(visibleOn.some((conflict) => conflict.id === target.id)).toBe(true);
  });

  it('reports fewer findings when the evaluation date is moved back', () => {
    const early = derive(graph, '2023-01-01').length;
    const late = derive(graph, end).length;
    expect(early).toBeLessThan(late);
  });

  it('never surfaces a conflict whose evidence is in the future', () => {
    for (const asOf of ['2022-06-01', '2023-06-01', '2024-06-01', '2025-06-01']) {
      const ctx = buildRuleContext(graph, asOf);
      for (const conflict of conflictsOf(ctx, ['measurement_value_conflict', 'demographic_conflict'])) {
        for (const fact of factsOfConflict(ctx, conflict)) {
          expect(fact.occurredAt <= asOf).toBe(true);
        }
      }
    }
  });
});

describe('helpers', () => {
  it('resolves a conflict\u2019s facts against the graph', () => {
    const ctx = buildRuleContext(graph, end);
    const facts = factsOfConflict(ctx, ctx.conflicts[0]);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.length).toBe(ctx.conflicts[0].factIds.length);
  });

  it('drops ids that do not resolve rather than throwing', () => {
    const ctx = buildRuleContext(graph, end);
    const facts = factsOfConflict(ctx, {
      ...ctx.conflicts[0],
      factIds: ['not_a_real_fact'],
    });
    expect(facts).toEqual([]);
  });

  it('groups by a key and skips null keys', () => {
    const ctx = buildRuleContext(graph, end);
    const facts = factsOfConflict(ctx, ctx.conflicts[0]);
    const grouped = groupFacts(facts, () => null);
    expect(grouped.size).toBe(0);
  });

  it('falls back to the fact label when there is no entity', () => {
    const ctx = buildRuleContext(graph, end);
    const conflict = { ...ctx.conflicts[0], entityKey: undefined };
    const label = labelForConflict(ctx, conflict);
    expect(label.length).toBeGreaterThan(0);
  });
});
