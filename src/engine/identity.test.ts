import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  artifactIdentity,
  compareIdentities,
  contentAddress,
  corpusHash,
  hashString,
  reproductionHeadline,
  resultFingerprint,
  rulesetHash,
  type ArtifactIdentity,
} from './identity';
import { LocalBuildBackend, reproduceArtifact } from '../builder/backend';
import { buildPrimaryGraph } from '../data/cohortIndex';
import { derive } from './derive/engine';
import { SAMPLE_DOCUMENTS } from '../data/sampleCorpus';
import type { DocumentInput } from './ingest';

const CORPUS: DocumentInput[] = [
  {
    title: 'Outside lipid panel',
    kind: 'lab_report',
    date: '2026-01-05',
    origin: 'upload',
    text: 'Cholesterol: 5.4 mmol/L (reference range 0-5.0)\nHDL: 1.1 mmol/L',
  },
];

function built() {
  const graph = buildPrimaryGraph();
  return { graph, derivations: derive(graph, graph.stats.spanEnd), documents: SAMPLE_DOCUMENTS };
}

describe('hashing', () => {
  it('is deterministic', () => {
    expect(hashString('medical memory')).toBe(hashString('medical memory'));
    expect(hashString('medical memory')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('separates inputs that differ', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('ab')).not.toBe(hashString('ba'));
  });

  it('does not care what order documents were imported in', () => {
    // The same record is the same record.
    expect(corpusHash(CORPUS)).toBe(corpusHash([...CORPUS]));
    expect(corpusHash([...CORPUS, ...SAMPLE_DOCUMENTS])).toBe(
      corpusHash([...SAMPLE_DOCUMENTS, ...CORPUS]),
    );
  });

  it('changes when a single character of the corpus changes', () => {
    const edited = [{ ...CORPUS[0], text: `${CORPUS[0].text} ` }];
    expect(corpusHash(edited)).not.toBe(corpusHash(CORPUS));
  });

  it('changes when a document kind changes, because extraction is section-aware', () => {
    const retyped = [{ ...CORPUS[0], kind: 'visit_note' as const }];
    expect(corpusHash(retyped)).not.toBe(corpusHash(CORPUS));
  });

  it('hashes the rule set in registry order', () => {
    expect(rulesetHash()).toBe(rulesetHash());
    expect(rulesetHash()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('naming a result', () => {
  it('gives the same name to the same inputs and the same output', () => {
    const first = built();
    const second = built();
    const a = artifactIdentity(first);
    const b = artifactIdentity(second);
    expect(a.id).toBe(b.id);
    expect(a.resultHash).toBe(b.resultHash);
  });

  it('names both the corpus and the result', () => {
    const identity = artifactIdentity(built());
    // The display name is short and quotable.
    expect(identity.id).toMatch(/^MM-[0-9A-F]{4}-[0-9A-F]{4}$/);
    // The content address is a real SHA-256, not a truncated label.
    expect(identity.artifactId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives a content address that changes with any of its four determinants', () => {
    const identity = artifactIdentity(built());

    // Same everything: same address.
    expect(contentAddress({ ...identity })).toBe(identity.artifactId);

    // Change any one determinant and the address must move.
    const other = 'f'.repeat(64);
    expect(contentAddress({ ...identity, corpusHash: other })).not.toBe(identity.artifactId);
    expect(contentAddress({ ...identity, resultHash: other })).not.toBe(identity.artifactId);
    expect(contentAddress({ ...identity, rulesetVersion: other })).not.toBe(identity.artifactId);
    expect(contentAddress({ ...identity, engineVersion: '9.9.9' })).not.toBe(identity.artifactId);
  });

  it('records the engine and rule set it was produced by', () => {
    const identity = artifactIdentity(built());
    expect(identity.engineVersion).toBe(ENGINE_VERSION);
    expect(identity.rulesetVersion).toBe(rulesetHash());
    expect(identity.ruleCount).toBeGreaterThan(0);
    expect(identity.identitySchema).toBe(1);
  });

  it('reports the shape of the record it describes', () => {
    const { graph, derivations } = built();
    const identity = artifactIdentity(built());
    expect(identity.documents).toBe(graph.documents.length);
    expect(identity.facts).toBe(graph.facts.length);
    expect(identity.entities).toBe(graph.entities.length);
    expect(identity.derivations).toBe(derivations.length);
  });

  it('changes when the output changes even if the corpus does not', () => {
    const { graph, derivations, documents } = built();
    const full = artifactIdentity({ graph, derivations, documents });
    // One finding dropped, corpus untouched.
    const trimmed = artifactIdentity({ graph, derivations: derivations.slice(1), documents });
    expect(trimmed.corpusHash).toBe(full.corpusHash);
    expect(trimmed.resultHash).not.toBe(full.resultHash);
    expect(trimmed.id).not.toBe(full.id);
  });

  it('changes when the corpus changes even if the output looks similar', () => {
    const { graph, derivations } = built();
    const other = artifactIdentity({ graph, derivations, documents: CORPUS });
    const primary = artifactIdentity(built());
    expect(other.corpusHash).not.toBe(primary.corpusHash);
    expect(other.id).not.toBe(primary.id);
  });

  it('hashes the graph shape as well as the findings', () => {
    const { graph, derivations } = built();
    const before = resultFingerprint(graph, derivations);
    const after = resultFingerprint({ ...graph, entities: graph.entities.slice(1) }, derivations);
    expect(after).not.toBe(before);
  });
});

describe('reproducing a real build', () => {
  it('reproduces a built artifact exactly', async () => {
    const backend = new LocalBuildBackend({ pace: 0 });
    const artifact = await backend.run(
      { prompt: 'reconstruct my four-year history', pace: 0 },
      () => {},
    );

    const { report } = reproduceArtifact(artifact);

    expect(report.status).toBe('identical');
    expect(report.result).toBe('match');
    expect(report.corpus).toBe('match');
    expect(report.engine).toBe('match');
    expect(report.ruleset).toBe('match');
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(report.altered).toEqual([]);
    expect(report.actual.id).toBe(report.expected.id);
    expect(reproductionHeadline(report)).toContain('exactly');
  });

  it('reproduces every scenario, not just the default one', async () => {
    const backend = new LocalBuildBackend({ pace: 0 });
    for (const prompt of [
      'audit my medication list for contradictions',
      'show me which monitoring tests are missing',
      'prepare a redacted summary for a specialist',
      'run the same checks across several patients',
    ]) {
      const artifact = await backend.run({ prompt, pace: 0 }, () => {});
      const { report } = reproduceArtifact(artifact);
      expect(report.status, prompt).toBe('identical');
    }
  }, 30000);

  it('reproduces a build made from attachments', async () => {
    const backend = new LocalBuildBackend({ pace: 0 });
    const artifact = await backend.run(
      { prompt: '', pace: 0, attachments: CORPUS },
      () => {},
    );
    const { report } = reproduceArtifact(artifact);
    expect(report.status).toBe('identical');
    expect(report.expected.documents).toBe(1);
  });

  it('reports a changed corpus rather than claiming a reproduction', async () => {
    const backend = new LocalBuildBackend({ pace: 0 });
    const artifact = await backend.run({ prompt: '', pace: 0, attachments: CORPUS }, () => {});

    // Hand it a different record and ask it to reproduce the old name.
    const tampered = {
      ...artifact,
      inputs: [{ ...CORPUS[0], text: `${CORPUS[0].text}\nTriglycerides: 2.2 mmol/L` }],
    };
    const { report } = reproduceArtifact(tampered);

    expect(report.status).toBe('changed');
    expect(report.corpus).toBe('different');
    expect(report.notes.join(' ')).toContain('not the one this artifact was built from');
  });
});

describe('comparing identities', () => {
  const base: ArtifactIdentity = {
    artifactId: 'a'.repeat(64),
    id: 'MM-AAAA-BBBB',
    corpusHash: 'aaaa0000',
    resultHash: 'bbbb0000',
    engineVersion: '2.0.0',
    rulesetVersion: 'cccc0000',
    identitySchema: 1,
    ruleCount: 14,
    documents: 18,
    facts: 512,
    entities: 96,
    derivations: 37,
  };

  const derivations = built().derivations;
  const changed = (overrides: Partial<ArtifactIdentity>): ArtifactIdentity => ({
    ...base,
    ...overrides,
  });

  it('calls a match identical', () => {
    const report = compareIdentities(base, base, derivations, derivations);
    expect(report.status).toBe('identical');
    expect(report.notes.join(' ')).toContain('unchanged');
  });

  it('refuses to call a different engine a reproduction', () => {
    const report = compareIdentities(base, changed({ engineVersion: '1.0.0' }), derivations, derivations);
    expect(report.status).toBe('incompatible');
    expect(report.engine).toBe('different');
    expect(report.notes.join(' ')).toContain('engine 2.0.0');
    expect(reproductionHeadline(report)).toContain('Cannot reproduce');
  });

  it('refuses to call a different identity schema a reproduction', () => {
    const report = compareIdentities(base, changed({ identitySchema: 2 }), derivations, derivations);
    expect(report.status).toBe('incompatible');
  });

  it('reports a changed rule set as a change, not a failure', () => {
    const report = compareIdentities(base, changed({ rulesetVersion: 'dddd0000' }), derivations, derivations);
    expect(report.status).toBe('changed');
    expect(report.ruleset).toBe('different');
    expect(report.notes.join(' ')).toContain('rule registry has changed');
  });

  it('names the findings that appeared', () => {
    const report = compareIdentities(base, changed({ resultHash: 'eeee0000' }), [], derivations);
    expect(report.added.length).toBe(derivations.length);
    expect(report.added[0].detail).toContain('not before');
    expect(reproductionHeadline(report)).toContain('added');
  });

  it('names the findings that disappeared', () => {
    const report = compareIdentities(base, changed({ resultHash: 'eeee0000' }), derivations, []);
    expect(report.removed.length).toBe(derivations.length);
    expect(report.removed[0].detail).toContain('is not now');
    expect(reproductionHeadline(report)).toContain('removed');
  });

  it('names the findings whose confidence moved', () => {
    const target = derivations[0];
    const nudged = [{ ...target, confidence: Math.max(0, target.confidence - 0.05) }, ...derivations.slice(1)];
    const report = compareIdentities(base, changed({ resultHash: 'eeee0000' }), derivations, nudged);
    expect(report.altered.length).toBe(1);
    expect(report.altered[0].detail).toContain('confidence');
  });

  it('names the findings whose severity moved', () => {
    const target = derivations[0];
    const raised = [
      { ...target, severity: target.severity === 'high' ? ('low' as const) : ('high' as const) },
      ...derivations.slice(1),
    ];
    const report = compareIdentities(base, changed({ resultHash: 'eeee0000' }), derivations, raised);
    expect(report.altered[0].detail).toContain('severity');
  });
});
