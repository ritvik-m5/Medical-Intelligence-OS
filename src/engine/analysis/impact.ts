import type { ConditionSpan, Derivation, MedicationCourse } from '../derive/types';
import { RULE_LABEL } from '../derive/types';
import type { Fact, HealthGraph } from '../types';

/* ------------------------------------------------------------------ */
/* Dependency impact                                                   */
/*                                                                    */
/* Remove one thing from a record and ask what stops being true. The    */
/* answer is not a number: it is a chain, and every link in it has to   */
/* be traceable back to the removal that caused it.                     */
/*                                                                    */
/*   document → facts → entities → derivations → findings → exports     */
/*                                                                    */
/* Nothing here re-derives anything. It reads the dependency structure  */
/* the engine already recorded — fact.docId, derivation.factIds,        */
/* entity.factIds — and propagates along it. That is why the report can */
/* name the reason for every edge rather than asserting a count.        */
/* ------------------------------------------------------------------ */

export type ImpactTarget =
  | { kind: 'document'; id: string }
  | { kind: 'fact'; id: string }
  | { kind: 'derivation'; id: string }
  | { kind: 'rule'; id: string }
  | { kind: 'entity'; key: string };

export interface ImpactEdge {
  from: string;
  to: string;
  /** How the two are connected. Every value is a relation the engine records. */
  relation: 'contains' | 'cites' | 'aggregates' | 'produces';
  /** Why this edge exists, in terms a reader can check against the source. */
  detail: string;
}

export interface LostFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: string;
}

export interface ThinnedFinding {
  id: string;
  ruleId: string;
  title: string;
  /** Premises that survive, of the premises the proof rests on. */
  surviving: number;
  total: number;
}

export interface ImpactReport {
  target: ImpactTarget;
  /** A sentence stating what was removed. */
  headline: string;
  /** Facts the removal takes with it. */
  removedFacts: string[];
  /** Entities that lose evidence. */
  affectedEntities: Array<{ key: string; label: string; lost: number; remaining: number }>;
  /** Findings that cannot be derived without the removed facts. */
  lostFindings: LostFinding[];
  /**
   * Findings that still hold but rest on a thinner evidence base.
   *
   * Reported separately because the distinction matters: one is a conclusion the
   * record no longer supports, the other is a conclusion it supports less well.
   */
  thinnedFindings: ThinnedFinding[];
  /** Intervals the removed facts participate in. */
  intervals: Array<{ kind: 'medication' | 'condition'; label: string; reason: string }>;
  /** What would change in an export. */
  exports: { resources: number; kinds: string[]; note: string };
  /** Rule prevalences that would move, within this record. */
  cohort: Array<{ ruleId: string; label: string; before: number; after: number }>;
  /** Every propagation edge, in order, so the chain can be read or audited. */
  edges: ImpactEdge[];
  notes: string[];
}

export function ruleLabel(ruleId: string): string {
  return RULE_LABEL[ruleId as keyof typeof RULE_LABEL] ?? ruleId;
}

/** Which facts a target takes with it when it is removed. */
export function removedFactsFor(target: ImpactTarget, graph: HealthGraph): string[] {
  switch (target.kind) {
    case 'document':
      return graph.facts.filter((fact) => fact.docId === target.id).map((fact) => fact.id);
    case 'fact':
      return graph.facts.some((fact) => fact.id === target.id) ? [target.id] : [];
    case 'entity': {
      const entity = graph.entities.find((entry) => entry.key === target.key);
      return entity ? [...entity.factIds] : [];
    }
    case 'rule':
    case 'derivation':
      // Neither takes facts away: one removes a finding, the other removes itself.
      return [];
  }
}

/** Facts that would remain, after the removal. */
export function survivingFacts(graph: HealthGraph, removed: Set<string>): Fact[] {
  return graph.facts.filter((fact) => !removed.has(fact.id));
}

/**
 * Compute what depends on a target.
 *
 * Pure: it reads the graph and the derivations and returns a report. It does not
 * rebuild anything, so it cannot silently disagree with the artifact it is
 * describing.
 */
export function impactOf(
  target: ImpactTarget,
  graph: HealthGraph,
  derivations: Derivation[],
  context: { courses?: MedicationCourse[]; spans?: ConditionSpan[] } = {},
): ImpactReport {
  const edges: ImpactEdge[] = [];
  const notes: string[] = [];

  const removedList = removedFactsFor(target, graph);
  const removed = new Set(removedList);

  if (target.kind === 'document') {
    const document = graph.documents.find((doc) => doc.id === target.id);
    for (const factId of removedList) {
      const fact = graph.facts.find((entry) => entry.id === factId);
      edges.push({
        from: `document:${target.id}`,
        to: `fact:${factId}`,
        relation: 'contains',
        detail: `“${fact?.quote ?? ''}” is read from this document.`,
      });
    }
    notes.push(
      document
        ? `${document.title} carries ${removedList.length} extracted fact${removedList.length === 1 ? '' : 's'}.`
        : 'The document named is not in this artifact.',
    );
  }

  /* Which derivations lose a premise. */
  const lost: Derivation[] = [];
  const thinned: Array<{ derivation: Derivation; surviving: number }> = [];

  const affectedEntityKeys = new Set<string>();
  for (const factId of removedList) {
    const fact = graph.facts.find((entry) => entry.id === factId);
    if (fact) affectedEntityKeys.add(fact.entityKey);
  }

  for (const derivation of derivations) {
    if (target.kind === 'rule') {
      if (derivation.ruleId !== target.id) continue;
      lost.push(derivation);
      edges.push({
        from: `rule:${target.id}`,
        to: `derivation:${derivation.id}`,
        relation: 'produces',
        detail: `“${derivation.title}” is produced by this rule, and nothing else produces it.`,
      });
      continue;
    }

    if (target.kind === 'derivation') {
      if (derivation.id !== target.id) continue;
      lost.push(derivation);
      continue;
    }

    const lostPremises = derivation.factIds.filter((id) => removed.has(id));
    if (lostPremises.length > 0) {
      lost.push(derivation);
      for (const factId of lostPremises) {
        edges.push({
          from: `fact:${factId}`,
          to: `derivation:${derivation.id}`,
          relation: 'cites',
          detail: `“${derivation.title}” rests on this premise, which the removal takes away.`,
        });
      }
      continue;
    }

    // It survives. Does its evidence base thin?
    const surviving = derivation.factIds.filter((id) => !removed.has(id));
    const touched = surviving.some((id) => {
      const fact = graph.facts.find((entry) => entry.id === id);
      return fact ? affectedEntityKeys.has(fact.entityKey) : false;
    });
    if (touched && removedList.length > 0) {
      thinned.push({ derivation, surviving: surviving.length });
      edges.push({
        from: `entity:${derivation.entityKeys[0] ?? ''}`,
        to: `derivation:${derivation.id}`,
        relation: 'cites',
        detail: `“${derivation.title}” still holds, but the record now supports it with fewer facts.`,
      });
    }
  }

  /* Entities that lose evidence. */
  const affectedEntities = Array.from(affectedEntityKeys)
    .map((key) => {
      const entity = graph.entities.find((entry) => entry.key === key);
      const lostCount = removedList.filter(
        (id) => graph.facts.find((fact) => fact.id === id)?.entityKey === key,
      ).length;
      return {
        key,
        label: entity?.label ?? key,
        lost: lostCount,
        remaining: entity ? entity.factIds.length - lostCount : 0,
      };
    })
    .filter((entry) => entry.lost > 0);

  for (const entity of affectedEntities) {
    edges.push({
      from: `entity:${entity.key}`,
      to: `derivation:*`,
      relation: 'aggregates',
      detail: `${entity.label} loses ${entity.lost} of ${entity.lost + entity.remaining} facts.`,
    });
  }

  /* Intervals the removed facts participate in. */
  const intervals: ImpactReport['intervals'] = [];
  const touches = (ids: Array<string | undefined>) =>
    ids.some((id) => (id ? removed.has(id) : false));

  for (const course of context.courses ?? []) {
    if (touches([course.startFactId, course.endFactId])) {
      intervals.push({
        kind: 'medication',
        label: course.label,
        reason: 'The course is reconstructed partly from facts the removal takes away.',
      });
    }
  }
  for (const span of context.spans ?? []) {
    if (touches([span.startFactId, span.endFactId])) {
      intervals.push({
        kind: 'condition',
        label: span.label,
        reason: 'The span is reconstructed partly from facts the removal takes away.',
      });
    }
  }
  for (const interval of intervals) {
    edges.push({
      from: `interval:${interval.kind}:${interval.label}`,
      to: `derivation:*`,
      relation: 'aggregates',
      detail: interval.reason,
    });
  }

  /* What an export would lose. Counted from real fact types, not estimated. */
  const lostFactObjects = graph.facts.filter((fact) => removed.has(fact.id));
  const resourceKinds = Array.from(new Set(lostFactObjects.map((fact) => fact.type))).sort();
  const exports = {
    resources: lostFactObjects.length,
    kinds: resourceKinds,
    note:
      lostFactObjects.length === 0
        ? 'No fact is removed, so no exported resource changes. Findings can still change, because a rule was withheld rather than evidence.'
        : `${lostFactObjects.length} fact${lostFactObjects.length === 1 ? '' : 's'} would leave the export. Every clinical resource in a bundle carries the span it came from, so the removal is traceable in the export as well as here.`,
  };

  /* Rule prevalences within this record. */
  const beforeCounts = new Map<string, number>();
  const afterCounts = new Map<string, number>();
  const lostIds = new Set(lost.map((entry) => entry.id));
  for (const derivation of derivations) {
    beforeCounts.set(derivation.ruleId, (beforeCounts.get(derivation.ruleId) ?? 0) + 1);
    if (!lostIds.has(derivation.id)) {
      afterCounts.set(derivation.ruleId, (afterCounts.get(derivation.ruleId) ?? 0) + 1);
    }
  }
  const cohort = Array.from(beforeCounts.entries())
    .filter(([ruleId, before]) => (afterCounts.get(ruleId) ?? 0) !== before)
    .map(([ruleId, before]) => ({
      ruleId,
      label: ruleLabel(ruleId),
      before,
      after: afterCounts.get(ruleId) ?? 0,
    }));

  notes.push(
    'Prevalence here is within this one record. A cross-subject cohort result would move the same way, and would require the other subjects to be re-derived rather than assumed.',
  );

  const headline =
    target.kind === 'document'
      ? `DOCUMENT ${target.id} removed`
      : target.kind === 'rule'
        ? `RULE ${target.id} withheld`
        : target.kind === 'fact'
          ? `FACT ${target.id} removed`
          : target.kind === 'entity'
            ? `ENTITY ${target.key} removed`
            : `DERIVATION ${target.id} removed`;

  return {
    target,
    headline,
    removedFacts: removedList,
    affectedEntities,
    lostFindings: lost.map((derivation) => ({
      id: derivation.id,
      ruleId: derivation.ruleId,
      title: derivation.title,
      severity: derivation.severity,
    })),
    thinnedFindings: thinned.map((entry) => ({
      id: entry.derivation.id,
      ruleId: entry.derivation.ruleId,
      title: entry.derivation.title,
      surviving: entry.surviving,
      total: entry.derivation.factIds.length,
    })),
    intervals,
    exports,
    cohort,
    edges,
    notes,
  };
}
