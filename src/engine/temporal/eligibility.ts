import type { Contradiction, Fact, HealthGraph, ISODate, SourceDocument } from '../types';
import type { Draft } from '../contradiction';

/**
 * Temporal eligibility for Medical Memory snapshots.
 *
 * **Knowledge date:** Facts and documents use `occurredAt` / `document.date` as the
 * date the record became available to the engine (document service or collection
 * date), not every retrospective event mentioned inside the prose.
 *
 * **`asOf` cutoff:** Inclusive date-only comparison (`YYYY-MM-DD`). A fact with
 * `occurredAt === asOf` is eligible; a fact on the next calendar day is not.
 *
 * Retrospective documentation (a later note describing an earlier event) still uses
 * the document's service date for eligibility; event timing lives in fact attrs
 * when extractors supply it.
 */

export function factKnowableAsOf(fact: Fact, asOf: ISODate): boolean {
  if (!asOf) return true;
  return fact.occurredAt <= asOf;
}

export function documentKnowableAsOf(doc: SourceDocument, asOf: ISODate): boolean {
  if (!asOf) return true;
  return doc.date <= asOf;
}

export function factsKnowableAsOf(graph: HealthGraph, asOf: ISODate): Fact[] {
  return graph.facts.filter((fact) => factKnowableAsOf(fact, asOf));
}

export function factIdsKnowableAsOf(graph: HealthGraph, asOf: ISODate): Set<string> {
  return new Set(factsKnowableAsOf(graph, asOf).map((f) => f.id));
}

const SINGLE_FACT_CONFLICT_KINDS = new Set<Contradiction['kind']>([
  'implausible_measurement',
  'quality_flag',
  'documentation_gap',
]);

/**
 * A contradiction is knowable at `asOf` when every cited fact exists and none
 * lies in the future relative to the cutoff. Cross-document disagreements need
 * at least two supporting facts once filtered.
 */
export function contradictionKnowableAsOf(
  contradiction: Contradiction,
  factsById: Map<string, Fact>,
  asOf: ISODate,
): boolean {
  const facts = contradiction.factIds
    .map((id) => factsById.get(id))
    .filter((f): f is Fact => Boolean(f));
  if (facts.length === 0) return false;
  if (facts.some((fact) => !factKnowableAsOf(fact, asOf))) return false;
  const minFacts = SINGLE_FACT_CONFLICT_KINDS.has(contradiction.kind) ? 1 : 2;
  return facts.length >= minFacts;
}

export function filterContradictionsAsOf(
  contradictions: Contradiction[],
  graph: HealthGraph,
  asOf: ISODate,
): Contradiction[] {
  const factsById = new Map(graph.facts.map((f) => [f.id, f]));
  return contradictions.filter((c) => contradictionKnowableAsOf(c, factsById, asOf));
}

export function qualityFlagKnowableAsOf(flag: Draft, asOf: ISODate): boolean {
  if (!asOf) return true;
  return flag.facts.every((fact) => factKnowableAsOf(fact, asOf));
}

export function filterQualityFlagsAsOf(flags: Draft[], asOf: ISODate): Draft[] {
  return flags.filter((flag) => qualityFlagKnowableAsOf(flag, asOf));
}
