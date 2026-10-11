import { describe, expect, it } from 'vitest';
import { MemoryBackend, type StorageBackend } from '../engine/platform/persistence';
import {
  MAX_RUNS,
  REGISTRY_KEY,
  REGISTRY_SCHEMA,
  RunRegistry,
  type StoredRun,
} from '../engine/platform/registry';
import { LocalBuildBackend, reproduceArtifact } from './backend';
import { branchOptions, firedRules, requestFromRun, summarizeFindings, toStoredRun } from './runs';
import type { BuildArtifact } from './types';

const backend = new LocalBuildBackend({ pace: 0 });

/** A real artifact, built by the real pipeline. Nothing here is a fixture. */
async function build(prompt: string, extra: Record<string, unknown> = {}) {
  return backend.run({ prompt, pace: 0, ...extra }, () => {});
}

function registry(store: StorageBackend = new MemoryBackend()) {
  return new RunRegistry(store);
}

function stored(artifact: BuildArtifact, options: Record<string, unknown> = {}) {
  return toStoredRun(artifact, { createdAt: '2026-01-01T00:00:00.000Z', ...options });
}

/* ------------------------------------------------------------------ */
/* The registry                                                        */
/* ------------------------------------------------------------------ */

describe('the run registry', () => {
  it('keeps a run and reads it back', async () => {
    const runs = registry();
    const run = stored(await build('diabetes monitoring'));

    const saved = runs.save(run);
    expect(saved.ok).toBe(true);

    const loaded = runs.get(run.artifactId);
    expect(loaded?.artifactId).toBe(run.artifactId);
    expect(loaded?.identity.corpusHash).toBe(run.identity.corpusHash);
    expect(loaded?.documents.length).toBe(run.documents.length);
  });

  it('replaces a run with the same identity rather than duplicating it', async () => {
    const runs = registry();
    const run = stored(await build('diabetes monitoring'));

    runs.save(run);
    runs.save({ ...run, label: 'Renamed' });

    const { runs: kept } = runs.load();
    expect(kept).toHaveLength(1);
    expect(kept[0].label).toBe('Renamed');
  });

  it('keeps distinct identities as distinct runs', async () => {
    const runs = registry();
    const a = stored(await build('diabetes monitoring'));
    const b = stored(await build('immunization record'));

    runs.save(a);
    runs.save(b);

    expect(runs.load().runs).toHaveLength(2);
    expect(a.artifactId).not.toBe(b.artifactId);
  });

  it('reports a schema it does not understand rather than loading it anyway', () => {
    const store = new MemoryBackend();
    store.write(
      REGISTRY_KEY,
      JSON.stringify({ schema: REGISTRY_SCHEMA + 1, savedAt: '', runs: [{ id: 'MM-XXXX-YYYY' }] }),
    );

    const result = registry(store).load();
    expect(result.status).toBe('version-mismatch');
    expect(result.runs).toHaveLength(0);
    expect(result.message).toContain(`v${REGISTRY_SCHEMA}`);
  });

  it('reports unparseable storage rather than pretending it is empty', () => {
    const store = new MemoryBackend();
    store.write(REGISTRY_KEY, '{not json');

    const result = registry(store).load();
    expect(result.status).toBe('corrupt');
    expect(result.runs).toHaveLength(0);
  });

  it('says storage is unavailable rather than silently losing the run', async () => {
    const dead: StorageBackend = {
      read: () => null,
      write: () => undefined,
      remove: () => undefined,
      available: () => false,
    };
    const runs = new RunRegistry(dead);

    const result = runs.save(stored(await build('diabetes monitoring')));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('unavailable');
    expect(runs.load().message).toContain('unavailable');
  });

  it('bounds how many runs it keeps', async () => {
    const runs = registry();
    const artifacts = await Promise.all([
      build('diabetes monitoring'),
      build('immunization record'),
      build('renal function'),
    ]);
    const many: StoredRun[] = [];
    for (let index = 0; index < MAX_RUNS + 5; index += 1) {
      const base = stored(artifacts[index % artifacts.length]);
      many.push({ ...base, artifactId: `${base.artifactId}-${index}` });
    }
    for (const run of many) runs.save(run);

    expect(runs.load().runs.length).toBe(MAX_RUNS);
  });

  it('removes a run without touching the others', async () => {
    const runs = registry();
    const a = stored(await build('diabetes monitoring'));
    const b = stored(await build('immunization record'));
    runs.save(a);
    runs.save(b);

    runs.remove(a.artifactId);
    expect(runs.get(a.artifactId)).toBeNull();
    expect(runs.get(b.artifactId)?.artifactId).toBe(b.artifactId);
  });
});

/* ------------------------------------------------------------------ */
/* Saving is lossless for the thing that matters                       */
/* ------------------------------------------------------------------ */

describe('a saved run', () => {
  it('re-derives to the same identity after a round trip through storage', async () => {
    const artifact = await build('diabetes monitoring');
    const store = new MemoryBackend();
    new RunRegistry(store).save(stored(artifact));

    // A different registry over the same bytes: this is what a new session sees.
    const reloaded = new RunRegistry(store).get(artifact.identity.artifactId);
    expect(reloaded).not.toBeNull();

    const rebuilt = await backend.run({ ...requestFromRun(reloaded!), pace: 0 }, () => {});

    expect(rebuilt.identity.artifactId).toBe(artifact.identity.artifactId);
    expect(rebuilt.identity.corpusHash).toBe(artifact.identity.corpusHash);
    expect(rebuilt.identity.resultHash).toBe(artifact.identity.resultHash);
  });

  it('does not depend on the keyword matcher agreeing a second time', async () => {
    const artifact = await build('diabetes monitoring');
    const run = stored(artifact, { prompt: 'a prompt that matches nothing at all' });

    const rebuilt = await backend.run({ ...requestFromRun(run), pace: 0 }, () => {});

    // The documents are stored, so the rebuilt result is the same result even
    // though the prompt would now resolve to a different scenario.
    expect(rebuilt.identity.corpusHash).toBe(artifact.identity.corpusHash);
    expect(rebuilt.identity.resultHash).toBe(artifact.identity.resultHash);
  });

  it('keeps a cached finding list that matches a fresh derivation', async () => {
    const artifact = await build('diabetes monitoring');
    const run = stored(artifact);

    expect(run.findings).toEqual(summarizeFindings(artifact.derivations));
    expect(run.findings.length).toBeGreaterThan(0);
    expect(run.findings[0].title.length).toBeGreaterThan(0);
  });

  it('records the provenance verdict it was saved with', async () => {
    const artifact = await build('diabetes monitoring');
    const run = stored(artifact);

    expect(run.verification.clean).toBe(true);
    expect(run.verification.score).toBe(100);
    expect(run.verification.factsQuoted).toBe(run.verification.factsTotal);
  });

  it('records the evaluation date, so re-derivation asks the same question', async () => {
    const artifact = await build('diabetes monitoring');
    const run = stored(artifact);

    expect(run.asOf).toBe(artifact.asOf);
    // 'identical' is the strongest verdict: the hashes match, not merely the findings.
    expect(reproduceArtifact(artifact).report.status).toBe('identical');
  });
});

/* ------------------------------------------------------------------ */
/* Branches                                                            */
/* ------------------------------------------------------------------ */

describe('branching an artifact', () => {
  it('offers only experiments this build can actually run', async () => {
    const artifact = await build('diabetes monitoring');
    const kinds = branchOptions(artifact).map((option) => option.kind);

    expect(kinds).toEqual(['withhold-rule', 'evaluate-earlier', 'add-document']);
    // There is one engine in the binary, so an engine-version branch is not offered.
    expect(kinds).not.toContain('change-engine');
  });

  it('names the rules that actually fired, most prolific first', async () => {
    const artifact = await build('diabetes monitoring');
    const rules = firedRules(artifact);

    expect(rules.length).toBeGreaterThan(0);
    for (let index = 1; index < rules.length; index += 1) {
      expect(rules[index - 1].count).toBeGreaterThanOrEqual(rules[index].count);
    }
    const ids = rules.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('withholds a rule and changes the rule set version, not the corpus', async () => {
    const parent = await build('diabetes monitoring');
    const rule = firedRules(parent)[0].id;

    const child = await backend.run(
      {
        prompt: parent.scenarioLabel,
        attachments: parent.inputs,
        suppressRules: [rule],
        asOf: parent.asOf,
        pace: 0,
      },
      () => {},
    );

    expect(child.identity.corpusHash).toBe(parent.identity.corpusHash);
    expect(child.identity.rulesetVersion).not.toBe(parent.identity.rulesetVersion);
    expect(child.identity.ruleCount).toBe(parent.identity.ruleCount - 1);
    expect(child.suppressedRules).toEqual([rule]);
  });

  it('removes exactly the findings that rule produced, and nothing else', async () => {
    const parent = await build('diabetes monitoring');
    const rule = firedRules(parent)[0].id;
    const fromThatRule = parent.derivations.filter((entry) => entry.ruleId === rule).length;
    expect(fromThatRule).toBeGreaterThan(0);

    const child = await backend.run(
      {
        prompt: parent.scenarioLabel,
        attachments: parent.inputs,
        suppressRules: [rule],
        asOf: parent.asOf,
        pace: 0,
      },
      () => {},
    );

    expect(child.derivations.filter((entry) => entry.ruleId === rule)).toHaveLength(0);
    expect(child.derivations.length).toBe(parent.derivations.length - fromThatRule);
  });

  it('evaluating earlier drops what the record did not yet support', async () => {
    const parent = await build('diabetes monitoring');
    const earliest = parent.graph.stats.spanStart;
    expect(earliest < parent.asOf).toBe(true);

    const child = await backend.run(
      {
        prompt: parent.scenarioLabel,
        attachments: parent.inputs,
        asOf: earliest,
        pace: 0,
      },
      () => {},
    );

    expect(child.asOf).toBe(earliest);
    expect(child.identity.corpusHash).toBe(parent.identity.corpusHash);
    expect(child.derivations.length).toBeLessThan(parent.derivations.length);
  });

  it('records its parent, so lineage survives being saved', async () => {
    const parent = await build('diabetes monitoring');
    const rule = firedRules(parent)[0].id;
    const child = await backend.run(
      {
        prompt: parent.scenarioLabel,
        attachments: parent.inputs,
        suppressRules: [rule],
        asOf: parent.asOf,
        branch: { parentId: parent.identity.artifactId, operation: 'withhold-rule', reason: `withheld ${rule}` },
        pace: 0,
      },
      () => {},
    );

    expect(child.branch?.parentId).toBe(parent.identity.artifactId);

    const runs = registry();
    runs.save(stored(child));
    const reloaded = runs.get(child.identity.artifactId);
    expect(reloaded?.branch.parentId).toBe(parent.identity.artifactId);
    expect(reloaded?.branch.operation).toBe('withhold-rule');
    expect(reloaded?.branch.reason).toBe(`withheld ${rule}`);
  });

  it('reproduces a branch, not just a plain build', async () => {
    const parent = await build('diabetes monitoring');
    const rule = firedRules(parent)[0].id;
    const child = await backend.run(
      {
        prompt: parent.scenarioLabel,
        attachments: parent.inputs,
        suppressRules: [rule],
        asOf: parent.asOf,
        pace: 0,
      },
      () => {},
    );

    expect(reproduceArtifact(child).report.status).toBe('identical');
  });

  it('a branch and its parent are different runs, not one run twice', async () => {
    const parent = await build('diabetes monitoring');
    const rule = firedRules(parent)[0].id;
    const child = await backend.run(
      {
        prompt: parent.scenarioLabel,
        attachments: parent.inputs,
        suppressRules: [rule],
        asOf: parent.asOf,
        pace: 0,
      },
      () => {},
    );

    const runs = registry();
    runs.save(stored(parent));
    runs.save(stored(child));

    expect(runs.load().runs).toHaveLength(2);
    expect(parent.identity.artifactId).not.toBe(child.identity.artifactId);
  });
});
