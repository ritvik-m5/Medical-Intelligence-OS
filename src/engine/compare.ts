import type { Derivation, EvidenceGrade, Severity, StepKind } from './derive/types';
import type { ArtifactIdentity } from './identity';
import { engineDelta, type EngineDelta } from './versions';

/* ------------------------------------------------------------------ */
/* Comparing two runs                                                  */
/*                                                                    */
/* A diff of counts is not a diff of findings. "17 findings, 3 added"   */
/* tells a reader nothing about whether the record changed or the       */
/* engine did, and nothing at all about why any individual finding      */
/* moved.                                                              */
/*                                                                    */
/* So every difference here is reported at the level of the proof: the  */
/* rule that fired, the steps it took, the premises it rested on, and   */
/* the confidence that came out. Two runs of the same finding under     */
/* different rules are shown side by side rather than summarised.       */
/* ------------------------------------------------------------------ */

export interface ComparableRun {
  /** What to call this run in the comparison. */
  label: string;
  identity: ArtifactIdentity;
  derivations: Derivation[];
}

/** One side of a proof comparison, flattened for display. */
export interface ProofSide {
  ruleId: string;
  severity: Severity;
  grade: EvidenceGrade;
  confidence: number;
  steps: Array<{
    kind: StepKind;
    label: string;
    justification: string;
    factIds: string[];
  }>;
  factCount: number;
  statement: string;
  notConcluded: string;
}

export type FindingStatus = 'added' | 'removed' | 'changed' | 'same';

export interface FindingDelta {
  id: string;
  title: string;
  status: FindingStatus;
  /** The rule that produced it on whichever side has it. */
  ruleId: string;
  /** Human-readable description of what moved. */
  changes: string[];
  before: ProofSide | null;
  after: ProofSide | null;
}

export interface RunComparison {
  a: { label: string; identity: ArtifactIdentity };
  b: { label: string; identity: ArtifactIdentity };
  /** Whether the two runs read the same record. */
  corpus: { same: boolean };
  /** Whether the rule registry is the same. */
  ruleset: { same: boolean };
  /** What changed in the engine between the two versions, when it can be told. */
  engine: { same: boolean; delta: EngineDelta | null };
  counts: {
    a: number;
    b: number;
    added: number;
    removed: number;
    changed: number;
    same: number;
  };
  findings: FindingDelta[];
  notes: string[];
}

function side(derivation: Derivation): ProofSide {
  return {
    ruleId: derivation.ruleId,
    severity: derivation.severity,
    grade: derivation.grade,
    confidence: derivation.confidence,
    steps: derivation.steps.map((step) => ({
      kind: step.kind,
      label: step.label,
      justification: step.justification,
      factIds: step.factIds,
    })),
    factCount: derivation.factIds.length,
    statement: derivation.statement,
    notConcluded: derivation.notConcluded,
  };
}

/** The premises of a proof, as a comparable set. */
function premiseSet(derivation: Derivation): Set<string> {
  return new Set(derivation.factIds);
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Compare two runs, finding by finding.
 *
 * Matching is by derivation id, which is derived from the rule and the entities
 * it reasoned over. So a finding that survives a change keeps its identity, and
 * one that appears or disappears is reported as such rather than as an edit.
 */
export function compareRuns(a: ComparableRun, b: ComparableRun): RunComparison {
  const before = new Map(a.derivations.map((derivation) => [derivation.id, derivation]));
  const after = new Map(b.derivations.map((derivation) => [derivation.id, derivation]));

  const findings: FindingDelta[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let same = 0;

  for (const derivation of b.derivations) {
    const previous = before.get(derivation.id);
    if (!previous) {
      added += 1;
      findings.push({
        id: derivation.id,
        title: derivation.title,
        status: 'added',
        ruleId: derivation.ruleId,
        changes: [`Produced by ${derivation.ruleId}, which produced nothing here before.`],
        before: null,
        after: side(derivation),
      });
      continue;
    }

    const changes: string[] = [];
    if (previous.ruleId !== derivation.ruleId) {
      changes.push(`rule ${previous.ruleId} → ${derivation.ruleId}`);
    }
    if (previous.severity !== derivation.severity) {
      changes.push(`severity ${previous.severity} → ${derivation.severity}`);
    }
    if (previous.grade !== derivation.grade) {
      changes.push(`evidence grade ${previous.grade} → ${derivation.grade}`);
    }
    if (Math.abs(previous.confidence - derivation.confidence) > 1e-6) {
      changes.push(
        `confidence ${previous.confidence.toFixed(4)} → ${derivation.confidence.toFixed(4)}`,
      );
    }
    if (!sameSet(premiseSet(previous), premiseSet(derivation))) {
      changes.push(`premises ${premiseSet(previous).size} → ${premiseSet(derivation).size} facts`);
    }
    if (previous.steps.length !== derivation.steps.length) {
      changes.push(`proof ${previous.steps.length} → ${derivation.steps.length} steps`);
    }

    if (changes.length > 0) {
      changed += 1;
      findings.push({
        id: derivation.id,
        title: derivation.title,
        status: 'changed',
        ruleId: derivation.ruleId,
        changes,
        before: side(previous),
        after: side(derivation),
      });
    } else {
      same += 1;
      findings.push({
        id: derivation.id,
        title: derivation.title,
        status: 'same',
        ruleId: derivation.ruleId,
        changes: [],
        before: side(previous),
        after: side(derivation),
      });
    }
  }

  for (const derivation of a.derivations) {
    if (after.has(derivation.id)) continue;
    removed += 1;
    findings.push({
      id: derivation.id,
      title: derivation.title,
      status: 'removed',
      ruleId: derivation.ruleId,
      changes: [`Produced by ${derivation.ruleId}, which produces nothing here now.`],
      before: side(derivation),
      after: null,
    });
  }

  // Differences first, and within a status the most severe first.
  const rank: Record<FindingStatus, number> = { added: 0, changed: 1, removed: 2, same: 3 };
  const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort(
    (left, right) =>
      rank[left.status] - rank[right.status] ||
      severityRank[(left.after ?? left.before)!.severity] -
        severityRank[(right.after ?? right.before)!.severity] ||
      left.title.localeCompare(right.title),
  );

  const corpusSame = a.identity.corpusHash === b.identity.corpusHash;
  const rulesetSame = a.identity.rulesetVersion === b.identity.rulesetVersion;
  const engineSame = a.identity.engineVersion === b.identity.engineVersion;
  const delta = engineSame ? null : engineDelta(a.identity.engineVersion, b.identity.engineVersion);

  return {
    a: { label: a.label, identity: a.identity },
    b: { label: b.label, identity: b.identity },
    corpus: { same: corpusSame },
    ruleset: { same: rulesetSame },
    engine: { same: engineSame, delta },
    counts: { a: a.derivations.length, b: b.derivations.length, added, removed, changed, same },
    findings,
    notes: comparisonNotes(a, b, { corpusSame, rulesetSame, engineSame, delta }),
  };
}

function comparisonNotes(
  a: ComparableRun,
  b: ComparableRun,
  state: {
    corpusSame: boolean;
    rulesetSame: boolean;
    engineSame: boolean;
    delta: EngineDelta | null;
  },
): string[] {
  const notes: string[] = [];

  notes.push(
    state.corpusSame
      ? 'Both runs read the same record, so every difference comes from the engine or the rules.'
      : 'These two runs read different records, so a difference in findings may have nothing to do with the engine.',
  );

  if (!state.rulesetSame) {
    notes.push(
      'The rule registry differs between the two runs. A rule added, removed or reordered can change which findings exist without any change to the record.',
    );
  }

  if (state.delta) {
    notes.push(state.delta.explanation);
    if (state.delta.breaking) {
      notes.push(
        'A release between these two versions was declared breaking. The comparison is shown for inspection rather than as a like-for-like reproduction.',
      );
    }
  } else if (!state.engineSame) {
    notes.push(
      `Engine ${a.identity.engineVersion} and ${b.identity.engineVersion} differ, and this build has no record of one of them, so it cannot say what changed.`,
    );
  } else {
    notes.push('Both runs used the same engine version.');
  }

  return notes;
}

/** A one-line summary, for a heading. */
export function comparisonHeadline(comparison: RunComparison): string {
  const { added, removed, changed } = comparison.counts;
  if (added === 0 && removed === 0 && changed === 0) {
    return `Identical: ${comparison.counts.a} findings, none changed.`;
  }
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (changed > 0) parts.push(`${changed} changed`);
  return `${comparison.counts.a} → ${comparison.counts.b} findings · ${parts.join(', ')}.`;
}
