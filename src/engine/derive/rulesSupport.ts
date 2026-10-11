import type { Fact } from '../types';
import type { RuleContext } from './rule';
import { SPEC_BY_ENTITY_KEY } from '../text/lexicon';
import { findSpec } from '../text/lexicon';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function factsForEntity(ctx: RuleContext, entityKey: string): Fact[] {
  return (ctx.graph.factsByEntity[entityKey] ?? [])
    .map((id) => ctx.factsById.get(id))
    .filter((f): f is Fact => Boolean(f))
    .filter((f) => f.occurredAt <= ctx.asOf)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.span[0] - b.span[0]);
}

/** True when the status came from the sentence rather than a section heading. */
export function isSentenceLevel(fact: Fact): boolean {
  return !fact.flags.includes('section_derived_status');
}

export function shortKey(entityKey: string): string {
  return entityKey.split(':')[1] ?? entityKey;
}

export function monitoringLabsForDrug(entityKey: string): string[] {
  const spec = SPEC_BY_ENTITY_KEY.get(entityKey) ?? findSpec(shortKey(entityKey));
  return spec?.monitoringLabs ?? [];
}
