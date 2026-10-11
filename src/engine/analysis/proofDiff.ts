import type { Derivation, DerivationStep, StepKind } from '../derive/types';

/* ------------------------------------------------------------------ */
/* Proof diff                                                          */
/*                                                                    */
/* A finding that moved is not an explanation. This compares two proofs */
/* step by step and classifies every step, so a reader sees which        */
/* premise was replaced, which rule step changed, and which part of the  */
/* reasoning survived untouched.                                        */
/*                                                                    */
/* Alignment is by (kind, label) rather than by step id, because ids are */
/* positional in some proofs: a step inserted near the top would        */
/* otherwise make every following step look replaced.                   */
/* ------------------------------------------------------------------ */

export type StepChange = 'added' | 'removed' | 'replaced' | 'changed' | 'unchanged';

export interface ProofStepSide {
  kind: StepKind;
  label: string;
  justification: string;
  factIds: string[];
}

export interface ProofStepLine {
  index: number;
  change: StepChange;
  before: ProofStepSide | null;
  after: ProofStepSide | null;
  /** Why the classifier reached this verdict. Shown to the reader. */
  reason: string;
}

export interface ProofDiff {
  beforeId: string | null;
  afterId: string | null;
  ruleId: string;
  title: string;
  presence: 'both' | 'only-before' | 'only-after';
  lines: ProofStepLine[];
  counts: Record<StepChange, number>;
  /** The premises that differ, named rather than counted. */
  premises: { added: string[]; removed: string[] };
  headline: string;
  notes: string[];
}

export function toSide(step: DerivationStep): ProofStepSide {
  return {
    kind: step.kind,
    label: step.label,
    justification: step.justification,
    factIds: [...step.factIds].sort(),
  };
}

function sameSide(a: ProofStepSide, b: ProofStepSide): boolean {
  return (
    a.justification === b.justification &&
    a.factIds.length === b.factIds.length &&
    a.factIds.every((id, index) => id === b.factIds[index])
  );
}

const keyOf = (step: ProofStepSide) => `${step.kind}\u0001${step.label}`;

/**
 * Longest common subsequence of the two step sequences.
 *
 * Returns index pairs, in order, that align without crossing. This is what keeps
 * an inserted premise from being reported as a rewrite of everything after it.
 */
export function align(before: ProofStepSide[], after: ProofStepSide[]): Array<[number, number]> {
  const rows = before.length;
  const cols = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      table[row][col] =
        keyOf(before[row]) === keyOf(after[col])
          ? table[row + 1][col + 1] + 1
          : Math.max(table[row + 1][col], table[row][col + 1]);
    }
  }

  const pairs: Array<[number, number]> = [];
  let row = 0;
  let col = 0;
  while (row < rows && col < cols) {
    if (keyOf(before[row]) === keyOf(after[col])) {
      pairs.push([row, col]);
      row += 1;
      col += 1;
    } else if (table[row + 1][col] >= table[row][col + 1]) {
      row += 1;
    } else {
      col += 1;
    }
  }
  return pairs;
}

const EMPTY: Record<StepChange, number> = {
  added: 0,
  removed: 0,
  replaced: 0,
  changed: 0,
  unchanged: 0,
};

/** The premises that differ, as sets. */
export function premiseDelta(before: Derivation | null, after: Derivation | null) {
  const beforeFacts = new Set(before?.factIds ?? []);
  const afterFacts = new Set(after?.factIds ?? []);
  return {
    added: Array.from(afterFacts).filter((id) => !beforeFacts.has(id)),
    removed: Array.from(beforeFacts).filter((id) => !afterFacts.has(id)),
  };
}

/**
 * Diff two proofs.
 *
 * Either side may be null: a finding present on one side only is still diffed, so
 * the reader sees the whole proof that appeared or vanished rather than the bare
 * fact that it did.
 */
export function proofDiff(
  before: Derivation | null,
  after: Derivation | null,
  labelOf: (factId: string) => string = (id) => id,
): ProofDiff {
  const presence: ProofDiff['presence'] =
    before && after ? 'both' : before ? 'only-before' : 'only-after';

  const beforeSteps = (before?.steps ?? []).map(toSide);
  const afterSteps = (after?.steps ?? []).map(toSide);
  const pairs = align(beforeSteps, afterSteps);

  const lines: ProofStepLine[] = [];
  const counts = { ...EMPTY };
  const push = (line: Omit<ProofStepLine, 'index'>) => {
    lines.push({ ...line, index: lines.length });
    counts[line.change] += 1;
  };

  let beforeCursor = 0;
  let afterCursor = 0;

  // The sentinel pair flushes whatever trails the last alignment.
  const walk: Array<[number, number]> = [
    ...pairs,
    [beforeSteps.length, afterSteps.length] as [number, number],
  ];

  for (const [beforeIndex, afterIndex] of walk) {
    const removed = beforeSteps.slice(beforeCursor, beforeIndex);
    const added = afterSteps.slice(afterCursor, afterIndex);
    const paired = Math.min(removed.length, added.length);

    // A step removed and one added at the same position, of the same kind, is a
    // replacement rather than two unrelated events.
    for (let index = 0; index < paired; index += 1) {
      const sameKind = removed[index].kind === added[index].kind;
      if (sameKind) {
        push({
          change: 'replaced',
          before: removed[index],
          after: added[index],
          reason: `The ${removed[index].kind} step was replaced by a different one of the same kind.`,
        });
      } else {
        push({
          change: 'removed',
          before: removed[index],
          after: null,
          reason: `The ${removed[index].kind} step is not in the branch.`,
        });
        push({
          change: 'added',
          before: null,
          after: added[index],
          reason: `A new ${added[index].kind} step was introduced.`,
        });
      }
    }
    for (let index = paired; index < removed.length; index += 1) {
      push({
        change: 'removed',
        before: removed[index],
        after: null,
        reason: `The ${removed[index].kind} step is not in the branch.`,
      });
    }
    for (let index = paired; index < added.length; index += 1) {
      push({
        change: 'added',
        before: null,
        after: added[index],
        reason: `The ${added[index].kind} step is new in the branch.`,
      });
    }

    if (beforeIndex < beforeSteps.length && afterIndex < afterSteps.length) {
      const left = beforeSteps[beforeIndex];
      const right = afterSteps[afterIndex];
      const equal = sameSide(left, right);
      push({
        change: equal ? 'unchanged' : 'changed',
        before: left,
        after: right,
        reason: equal
          ? 'Identical on both sides.'
          : left.factIds.length !== right.factIds.length
            ? `Same step, resting on ${left.factIds.length} premises before and ${right.factIds.length} now.`
            : 'Same step, with a different justification or different premises.',
      });
    }

    beforeCursor = beforeIndex + 1;
    afterCursor = afterIndex + 1;
  }

  const premises = premiseDelta(before, after);
  const ruleId = (after ?? before)!.ruleId;
  const title = (after ?? before)!.title;

  const notes: string[] = [];
  if (presence === 'only-before') {
    notes.push('This finding exists only in the baseline. The branch does not derive it at all.');
  }
  if (presence === 'only-after') {
    notes.push('This finding exists only in the branch. The baseline does not derive it at all.');
  }
  if (premises.removed.length > 0) {
    notes.push(`Premises no longer cited: ${premises.removed.map(labelOf).join(', ')}.`);
  }
  if (premises.added.length > 0) {
    notes.push(`Premises newly cited: ${premises.added.map(labelOf).join(', ')}.`);
  }

  const headline =
    counts.unchanged === lines.length
      ? 'The proof is identical on both sides.'
      : `${counts.unchanged} of ${lines.length} steps unchanged` +
        (counts.replaced ? `, ${counts.replaced} replaced` : '') +
        (counts.changed ? `, ${counts.changed} changed` : '') +
        (counts.added ? `, ${counts.added} added` : '') +
        (counts.removed ? `, ${counts.removed} removed` : '') +
        '.';

  return {
    beforeId: before?.id ?? null,
    afterId: after?.id ?? null,
    ruleId,
    title,
    presence,
    lines,
    counts,
    premises,
    headline,
    notes,
  };
}
