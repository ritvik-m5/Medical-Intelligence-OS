import type { Contradiction, ContradictionKind, Fact } from '../types';
import type { RuleContext } from './rule';

/* ------------------------------------------------------------------ */
/* Raw conflicts                                                       */
/*                                                                    */
/* Detecting that two documents disagree is a separate job from deciding */
/* what that disagreement means. `findContradictions` in the engine does */
/* the first; the rules in this folder do the second.                   */
/*                                                                    */
/* Before this module existed, both layers scanned the graph            */
/* independently and could, in principle, disagree about whether a      */
/* disagreement existed at all. Now there is one detector and the rules */
/* consume its output, which is also why `conflicts` sits on the rule   */
/* context beside `courses` and `spans` — all three are reconstructions */
/* of the graph rather than properties of it.                           */
/* ------------------------------------------------------------------ */

/**
 * Conflicts of the given kinds that were knowable as of the evaluation date.
 *
 * `findContradictions` has no notion of "as of": it describes the whole record.
 * The Time Machine needs the subset that existed at a given moment, so a conflict
 * is dropped unless *every* fact supporting it is dated on or before the
 * evaluation date. You cannot know two documents disagree until you have read
 * both of them.
 */
export function conflictsOf(
  ctx: RuleContext,
  kinds: ContradictionKind[],
): Contradiction[] {
  const wanted = new Set<ContradictionKind>(kinds);
  const out: Contradiction[] = [];

  for (const conflict of ctx.conflicts) {
    if (!wanted.has(conflict.kind)) continue;
    const facts = factsOfConflict(ctx, conflict).filter((fact) => fact.occurredAt <= ctx.asOf);
    const minFacts =
      conflict.kind === 'implausible_measurement' ||
      conflict.kind === 'quality_flag' ||
      conflict.kind === 'documentation_gap'
        ? 1
        : 2;
    if (facts.length < minFacts) continue;
    out.push(conflict);
  }

  return out;
}

/** The facts a conflict cites, resolved against the graph. */
export function factsOfConflict(ctx: RuleContext, conflict: Contradiction): Fact[] {
  const facts: Fact[] = [];
  for (const id of conflict.factIds) {
    const fact = ctx.factsById.get(id);
    if (fact) facts.push(fact);
  }
  return facts;
}

/**
 * Group a conflict's facts by a presentation key.
 *
 * Detection is shared; how a rule presents what it found is not. Grouping by
 * day or by recorded value is presentation, so it lives with the rule.
 */
export function groupFacts(
  facts: Fact[],
  keyOf: (fact: Fact) => string | null,
): Map<string, Fact[]> {
  const groups = new Map<string, Fact[]>();
  for (const fact of facts) {
    const key = keyOf(fact);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(fact);
    else groups.set(key, [fact]);
  }
  return groups;
}

/** The entity label for a conflict, falling back to the fact's own label. */
export function labelForConflict(ctx: RuleContext, conflict: Contradiction): string {
  if (conflict.entityKey) {
    const entity = ctx.graph.entities.find((candidate) => candidate.key === conflict.entityKey);
    if (entity) return entity.label;
  }
  const first = conflict.factIds.map((id) => ctx.factsById.get(id)).find(Boolean);
  return first?.label ?? 'this concept';
}
