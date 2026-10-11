import { describe, expect, it } from 'vitest';
import { compareRuns, comparisonHeadline, type ComparableRun } from './compare';
import { ENGINE_RELEASES, ENGINE_VERSION, engineDelta, releaseFor } from './versions';
import { LocalBuildBackend } from '../builder/backend';
import { artifactIdentity } from './identity';
import type { BuildArtifact } from '../builder/types';
import type { Derivation } from './derive/types';

/* Comparison tests.
 *
 * The claim being defended is that a difference between two runs is reported at
 * the level of the proof, not the level of the count. "3 findings added" is a
 * number; "this rule fired over these premises and did not before" is an
 * explanation.
 */

async function run(prompt: string, label: string): Promise<{ artifact: BuildArtifact; run: ComparableRun }> {
  const backend = new LocalBuildBackend({ pace: 0 });
  const artifact = await backend.run({ prompt, pace: 0 }, () => {});
  return {
    artifact,
    run: { label, identity: artifact.identity, derivations: artifact.derivations },
  };
}

const primary = () => run('reconstruct my four-year history', 'Full record');
const sparse = () => run('I only have a few documents — triage them', 'Sparse record');

describe('the engine version history', () => {
  it('is a dated, ordered history rather than a constant', () => {
    expect(ENGINE_RELEASES.length).toBeGreaterThan(1);
    for (const release of ENGINE_RELEASES) {
      expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.released).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.summary.length).toBeGreaterThan(20);
    }
  });

  it('reports its own head as the version this build runs', () => {
    expect(ENGINE_VERSION).toBe(ENGINE_RELEASES[ENGINE_RELEASES.length - 1].version);
  });

  it('records the rules each release introduced', () => {
    const introduced = ENGINE_RELEASES.flatMap((release) => release.rulesAdded);
    // Every rule the registry has was introduced by some release.
    expect(introduced.length).toBeGreaterThanOrEqual(14);
    expect(introduced).toContain('gap.monitoring_absent');
    expect(introduced).toContain('quality.same_day_conflict');
  });

  it('knows a version it declares and not one it does not', () => {
    expect(releaseFor(ENGINE_VERSION)).not.toBeNull();
    expect(releaseFor('99.0.0')).toBeNull();
  });

  it('explains the difference between two versions it knows', () => {
    const delta = engineDelta('1.0.0', ENGINE_VERSION);
    expect(delta).not.toBeNull();
    expect(delta!.rulesAdded.length).toBeGreaterThan(0);
    expect(delta!.explanation).toContain('rules added');
  });

  it('refuses to guess about a version it has never heard of', () => {
    expect(engineDelta('1.0.0', '99.0.0')).toBeNull();
    expect(engineDelta(ENGINE_VERSION, ENGINE_VERSION)).toBeNull();
  });

  it('flags a breaking release between two versions', () => {
    expect(engineDelta('1.0.0', ENGINE_VERSION)!.breaking).toBe(true);
    // And not between two versions with nothing breaking between them.
    expect(engineDelta('2.1.0', '2.2.0')!.breaking).toBe(false);
  });
});

describe('comparing two runs of the same record', () => {
  it('finds them identical', async () => {
    const a = await primary();
    const b = await primary();
    const comparison = compareRuns(a.run, b.run);

    expect(comparison.counts.added).toBe(0);
    expect(comparison.counts.removed).toBe(0);
    expect(comparison.counts.changed).toBe(0);
    expect(comparison.counts.same).toBe(a.run.derivations.length);
    expect(comparisonHeadline(comparison)).toContain('Identical');
    expect(comparison.corpus.same).toBe(true);
    expect(comparison.engine.same).toBe(true);
  });

  it('says the record was the same, so any difference is the engine', async () => {
    const a = await primary();
    const comparison = compareRuns(a.run, (await primary()).run);
    expect(comparison.notes.join(' ')).toContain('read the same record');
  });
});

describe('comparing two different records', () => {
  it('says so, rather than blaming the engine', async () => {
    const a = await primary();
    const b = await sparse();
    const comparison = compareRuns(a.run, b.run);

    expect(comparison.corpus.same).toBe(false);
    expect(comparison.notes.join(' ')).toContain('read different records');
  });

  it('reports findings that exist in one and not the other', async () => {
    const a = await primary();
    const b = await sparse();
    const comparison = compareRuns(a.run, b.run);

    expect(comparison.counts.removed).toBeGreaterThan(0);
    const removed = comparison.findings.filter((finding) => finding.status === 'removed');
    expect(removed.length).toBe(comparison.counts.removed);
    // A removed finding has a proof before and none after.
    expect(removed[0].before).not.toBeNull();
    expect(removed[0].after).toBeNull();
    expect(removed[0].before!.steps.length).toBeGreaterThan(0);
  });
});

describe('a finding whose proof moved', () => {
  /** Nudge one derivation so the comparison has something to describe. */
  function nudged(artifact: BuildArtifact, mutate: (derivation: Derivation) => Derivation) {
    const target = artifact.derivations[0];
    const derivations = [mutate(target), ...artifact.derivations.slice(1)];
    const identity = artifactIdentity({
      graph: artifact.graph,
      derivations,
      documents: artifact.inputs,
    });
    return { label: 'Nudged', identity, derivations };
  }

  it('names the confidence move and keeps both proofs', async () => {
    const { artifact, run: base } = await primary();
    const moved = nudged(artifact, (derivation) => ({
      ...derivation,
      confidence: Math.max(0, derivation.confidence - 0.1),
    }));

    const comparison = compareRuns(base, moved);
    const changed = comparison.findings.find((finding) => finding.status === 'changed');
    expect(changed).toBeDefined();
    expect(changed!.changes.join(' ')).toContain('confidence');

    // Both sides of the proof are available, which is the point.
    expect(changed!.before).not.toBeNull();
    expect(changed!.after).not.toBeNull();
    expect(changed!.before!.confidence).not.toBe(changed!.after!.confidence);
    expect(changed!.before!.steps.length).toBe(changed!.after!.steps.length);
  });

  it('names a severity move', async () => {
    const { artifact, run: base } = await primary();
    const moved = nudged(artifact, (derivation) => ({
      ...derivation,
      severity: derivation.severity === 'high' ? 'low' : 'high',
    }));

    const changed = compareRuns(base, moved).findings.find((f) => f.status === 'changed')!;
    expect(changed.changes.join(' ')).toContain('severity');
    expect(changed.before!.severity).not.toBe(changed.after!.severity);
  });

  it('names a rule change', async () => {
    const { artifact, run: base } = await primary();
    const moved = nudged(artifact, (derivation) => ({
      ...derivation,
      ruleId: 'gap.documentation_silence' as Derivation['ruleId'],
    }));

    const changed = compareRuns(base, moved).findings.find((f) => f.status === 'changed')!;
    expect(changed.changes.join(' ')).toContain('rule');
  });

  it('names a premise change, because that is what the proof rests on', async () => {
    const { artifact, run: base } = await primary();
    const moved = nudged(artifact, (derivation) => ({
      ...derivation,
      factIds: derivation.factIds.slice(1),
    }));

    const changed = compareRuns(base, moved).findings.find((f) => f.status === 'changed')!;
    expect(changed.changes.join(' ')).toContain('premises');
    expect(changed.before!.factCount).toBeGreaterThan(changed.after!.factCount);
  });

  it('names a proof that gained a step', async () => {
    const { artifact, run: base } = await primary();
    const moved = nudged(artifact, (derivation) => ({
      ...derivation,
      steps: derivation.steps.slice(0, derivation.steps.length - 1),
    }));

    const changed = compareRuns(base, moved).findings.find((f) => f.status === 'changed')!;
    expect(changed.changes.join(' ')).toContain('proof');
  });

  it('counts it once, not as an add and a remove', async () => {
    const { artifact, run: base } = await primary();
    const moved = nudged(artifact, (derivation) => ({
      ...derivation,
      confidence: Math.max(0, derivation.confidence - 0.1),
    }));

    const comparison = compareRuns(base, moved);
    expect(comparison.counts.changed).toBe(1);
    expect(comparison.counts.added).toBe(0);
    expect(comparison.counts.removed).toBe(0);
    expect(comparisonHeadline(comparison)).toContain('1 changed');
  });
});

describe('ordering and shape', () => {
  it('puts differences before findings that did not move', async () => {
    const a = await primary();
    const b = await sparse();
    const comparison = compareRuns(a.run, b.run);

    const statuses = comparison.findings.map((finding) => finding.status);
    const firstSame = statuses.indexOf('same');
    if (firstSame !== -1) {
      expect(statuses.slice(firstSame).every((status) => status === 'same')).toBe(true);
    }
  });

  it('gives every finding a rule and a title', async () => {
    const a = await primary();
    const comparison = compareRuns(a.run, (await sparse()).run);
    for (const finding of comparison.findings) {
      expect(finding.ruleId.length).toBeGreaterThan(0);
      expect(finding.title.length).toBeGreaterThan(0);
      // A difference is always explained in words.
      if (finding.status !== 'same') expect(finding.changes.length).toBeGreaterThan(0);
      else expect(finding.changes).toEqual([]);
    }
  });

  it('carries the identity of both runs', async () => {
    const a = await primary();
    const b = await sparse();
    const comparison = compareRuns(a.run, b.run);
    expect(comparison.a.identity.id).toBe(a.artifact.identity.id);
    expect(comparison.b.identity.id).toBe(b.artifact.identity.id);
    expect(comparison.a.label).toBe('Full record');
  });
});
