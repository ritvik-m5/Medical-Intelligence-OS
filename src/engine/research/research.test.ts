import { afterEach, describe, expect, it } from 'vitest';
import { buildSampleGraph } from '../../data/sampleCorpus';
import { contextForFinding } from '../../ai/context';
import { findContradictions } from '../contradiction';
import { derive } from '../derive/engine';
import { assessQuality } from '../platform/quality';
import { generateQuestions } from '../questions';
import { snapshotAt } from '../timeline';
import { diffSnapshots } from '../timeline';
import { addDays } from '../text/normalize';
import {
  bundledSources,
  categoryCounts,
  categorySumMatches,
  clearResearchCache,
  researchFingerprint,
  researchReceipt,
  runResearch,
  sourcesForEntities,
  trialQueryFrom,
  verifyResearchResult,
  type ResearchInput,
} from './index';
import { lookupTrials } from './trials';
import type { TrialRecord } from './types';

const graph = buildSampleGraph();
const asOf = graph.stats.spanEnd;
const snapshot = snapshotAt(graph, asOf);
const derivations = derive(graph, asOf);
const contradictions = findContradictions(graph);
const changes = diffSnapshots(snapshotAt(graph, addDays(asOf, -366)), snapshot);
const questions = generateQuestions({ contradictions, derivations, changes });
const quality = assessQuality({ graph, derivations, asOf });

function input(partial: Partial<ResearchInput> = {}): ResearchInput {
  return {
    question: 'What is documented about potassium?',
    context: null,
    graph,
    snapshot,
    asOf,
    artifactId: 'test-artifact',
    derivations,
    questions,
    contradictions,
    quality,
    fetchImpl: async () => new Response(JSON.stringify({ studies: [] }), { status: 200 }),
    now: Date.parse('2026-10-05T12:00:00Z'),
    ...partial,
  };
}

function trialResponse(studies: unknown[]): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ studies }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

afterEach(() => {
  clearResearchCache();
});

describe('registry', () => {
  it('keeps category totals equal to the source list', () => {
    const catalog = bundledSources();
    expect(categorySumMatches(catalog)).toBe(true);
    const counts = categoryCounts(catalog);
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(catalog.length);
  });

  it('does not return an unrelated source for potassium', () => {
    const sources = sourcesForEntities(['measurement:potassium']);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((source) => source.entityIds.includes('measurement:potassium'))).toBe(true);
    expect(sources.some((source) => source.entityIds.includes('medication:semaglutide'))).toBe(false);
  });
});

describe('runResearch', () => {
  it('takes personal counts from the as-of snapshot, not from page constants', async () => {
    const result = await runResearch(input());
    expect(verifyResearchResult(result, input())).toEqual([]);
    expect(result.personalCounts.documents).toBe(snapshot.totals.documents);
    expect(result.personalCounts.facts).toBe(snapshot.totals.facts);
    expect(result.personalCounts.concepts).toBe(snapshot.totals.entities);
    expect(result.personalCounts.findings).toBe(derivations.length);
    expect(result.personalCounts.questions).toBe(questions.length);
    expect(result.personalCounts.quality).toBe(quality.overall);
    expect(result.asOf).toBe(asOf);
  });

  it('detects a corrupted document count', async () => {
    const result = await runResearch(input());
    const broken = {
      ...result,
      personalCounts: { ...result.personalCounts, documents: result.personalCounts.documents + 3 },
    };
    expect(verifyResearchResult(broken, input()).join(' ')).toContain('documents');
  });

  it('detects a corrupted fact count', async () => {
    const result = await runResearch(input());
    const broken = {
      ...result,
      personalCounts: { ...result.personalCounts, facts: 0 },
    };
    expect(verifyResearchResult(broken, input()).join(' ')).toContain('facts');
  });

  it('detects a corrupted concept count', async () => {
    const result = await runResearch(input());
    const broken = {
      ...result,
      personalCounts: { ...result.personalCounts, concepts: 999 },
    };
    expect(verifyResearchResult(broken, input()).join(' ')).toContain('concepts');
  });

  it('detects a corrupted asOf', async () => {
    const result = await runResearch(input());
    expect(verifyResearchResult({ ...result, asOf: '2000-01-01' }, input()).join(' ')).toContain('asOf');
  });

  it('detects a corrupted artifact id', async () => {
    const result = await runResearch(input());
    expect(verifyResearchResult({ ...result, artifactId: 'other' }, input()).join(' ')).toContain(
      'artifactId',
    );
  });

  it('never includes an unrelated source', async () => {
    const result = await runResearch(input({ question: 'What is documented about potassium?' }));
    expect(result.entityKeys).toContain('measurement:potassium');
    for (const source of result.sources) {
      expect(source.entityIds).toContain('measurement:potassium');
    }
    expect(result.sources.some((source) => source.id === 'ev_glp1')).toBe(false);
  });

  it('never turns an external claim into a personal fact', async () => {
    const result = await runResearch(input());
    for (const item of result.personalEvidence) {
      expect(item.kind === 'fact' || item.kind === 'derivation' || item.kind === 'question' || item.kind === 'contradiction').toBe(
        true,
      );
      expect(result.sources.some((source) => source.id === item.id)).toBe(false);
    }
    for (const external of result.externalEvidence) {
      expect(external.claimKind).not.toBe('model_explanation');
      expect(result.personalEvidence.some((item) => item.statement === external.claim && item.kind === 'fact')).toBe(
        false,
      );
    }
  });

  it('says the record cannot establish a subject it does not document', async () => {
    const result = await runResearch(input({ question: 'What is documented about levothyroxine?' }));
    const hasLevothyroxine = graph.entities.some((entity) => entity.key === 'medication:levothyroxine');
    if (!hasLevothyroxine) {
      expect(result.personalEvidence.filter((item) => item.kind === 'fact')).toHaveLength(0);
    }
  });

  it('returns the same fingerprint for the same artifact, question and snapshot', async () => {
    const first = await runResearch(input());
    const second = await runResearch(input());
    expect(researchFingerprint(first)).toBe(researchFingerprint(second));
  });

  it('changes the fingerprint when asOf changes', async () => {
    const late = await runResearch(input());
    const earlyAsOf = graph.stats.spanStart;
    const early = await runResearch(
      input({
        asOf: earlyAsOf,
        snapshot: snapshotAt(graph, earlyAsOf),
        derivations: derive(graph, earlyAsOf),
      }),
    );
    expect(researchFingerprint(late)).not.toBe(researchFingerprint(early));
    expect(early.personalCounts.documents).toBeLessThan(late.personalCounts.documents);
  });

  it('changes the fingerprint when the question changes', async () => {
    const potassium = await runResearch(input({ question: 'What is documented about potassium?' }));
    const a1c = await runResearch(input({ question: 'What does this A1c result mean?' }));
    expect(researchFingerprint(potassium)).not.toBe(researchFingerprint(a1c));
    expect(a1c.entityKeys.some((key) => key.includes('hemoglobin-a1c') || key.includes('diabetes'))).toBe(
      true,
    );
  });

  it('uses the selected finding context rather than a bare keyword', async () => {
    const potassiumFinding = derivations.find((item) =>
      item.entityKeys.includes('measurement:potassium'),
    );
    expect(potassiumFinding).toBeDefined();
    const context = contextForFinding('test-artifact', asOf, potassiumFinding!);
    const result = await runResearch(input({ question: '', context }));
    expect(result.entityKeys).toContain('measurement:potassium');
    expect(result.personalEvidence.some((item) => item.id === potassiumFinding!.id)).toBe(true);
  });

  it('refuses a stale context instead of substituting another object', async () => {
    const result = await runResearch(
      input({
        question: '',
        context: {
          artifactId: 'test-artifact',
          asOf,
          kind: 'finding',
          id: 'no-such-derivation',
          title: 'Gone',
          summary: 'Gone',
          sourceIds: [],
          factIds: [],
          derivationIds: ['no-such-derivation'],
        },
      }),
    );
    expect(result.context).toBeNull();
    expect(result.limitations.join(' ')).toContain('no longer in this artifact');
  });

  it('does not research an empty question', async () => {
    const result = await runResearch(input({ question: '   ', context: null }));
    expect(result.sources).toEqual([]);
    expect(result.personalEvidence).toEqual([]);
    expect(result.limitations.join(' ')).toContain('No research question');
    expect(result.trials.kind).toBe('not_queried');
  });

  it('builds a receipt from the actual result', async () => {
    const result = await runResearch(input());
    const receipt = researchReceipt(result);
    expect(receipt.question).toBe(result.question);
    expect(receipt.asOf).toBe(result.asOf);
    expect(receipt.artifactId).toBe(result.artifactId);
    expect(receipt.sourcesUsed).toEqual(result.sources.map((source) => source.id).sort());
    expect(receipt.modelUsed).toBe('none');
    expect(receipt.retrievedAt).toBe(result.retrievedAt);
  });
});

describe('ClinicalTrials.gov', () => {
  it('builds the query from the resolved subject, not a canned disease', () => {
    expect(trialQueryFrom(['measurement:potassium'], 'anything')).toBe('potassium');
    expect(trialQueryFrom([], '')).toBeNull();
  });

  it('drops studies that lack an NCT id or a title', async () => {
    const state = await lookupTrials('potassium', {
      now: Date.parse('2026-10-05T12:00:00Z'),
      fetchImpl: trialResponse([
        { protocolSection: { identificationModule: { nctId: 'NCT1', briefTitle: 'A real study' } } },
        { protocolSection: { identificationModule: { nctId: 'NCT2' } } },
        { protocolSection: { identificationModule: { briefTitle: 'No id' } } },
      ]),
    });
    expect(state.kind).toBe('live');
    if (state.kind === 'live') {
      expect(state.trials.map((trial) => trial.nctId)).toEqual(['NCT1']);
      expect(state.trials[0].phase).toBeUndefined();
      expect(state.trials[0].status).toBeUndefined();
    }
  });

  it('does not invent UNKNOWN for a missing phase', async () => {
    const state = await lookupTrials('potassium', {
      now: Date.parse('2026-10-05T12:00:00Z'),
      fetchImpl: trialResponse([
        {
          protocolSection: {
            identificationModule: { nctId: 'NCT9', briefTitle: 'Phase omitted' },
            designModule: { phases: [] },
          },
        },
      ]),
    });
    expect(state.kind).toBe('live');
    if (state.kind === 'live') expect(state.trials[0].phase).toBeUndefined();
  });

  it('treats an unreachable registry as unavailable, not empty', async () => {
    const state = await lookupTrials('potassium', {
      now: Date.parse('2026-10-05T12:00:00Z'),
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });
    expect(state.kind).toBe('unavailable');
    if (state.kind === 'unavailable') {
      expect(state.reason).toContain('could not be reached');
    }
  });

  it('treats a live zero as empty, not unavailable', async () => {
    const state = await lookupTrials('potassium', {
      now: Date.parse('2026-10-05T12:00:00Z'),
      fetchImpl: trialResponse([]),
    });
    expect(state.kind).toBe('empty');
    if (state.kind === 'empty') expect(state.cacheState).toBe('live');
  });

  it('does not present a cached result as live', async () => {
    const fetchImpl = trialResponse([
      { protocolSection: { identificationModule: { nctId: 'NCT1', briefTitle: 'Cached study' } } },
    ]);
    const first = await lookupTrials('potassium', {
      now: Date.parse('2026-10-05T12:00:00Z'),
      fetchImpl,
    });
    expect(first.kind).toBe('live');
    const second = await lookupTrials('potassium', {
      now: Date.parse('2026-10-05T12:05:00Z'),
      fetchImpl,
    });
    expect(second.kind).toBe('cached');
    if (second.kind === 'cached') expect(second.cacheState).toBe('cached');
  });

  it('refuses to attach an unrelated trial to a potassium query', async () => {
    const result = await runResearch(
      input({
        fetchImpl: trialResponse([
          {
            protocolSection: {
              identificationModule: { nctId: 'NCT999', briefTitle: 'A potassium study' },
            },
          },
        ]),
      }),
    );
    expect(result.trials.kind === 'live' || result.trials.kind === 'cached').toBe(true);
    const trials = result.trials;
    if (trials.kind === 'live' || trials.kind === 'cached') {
      expect(trials.query).toMatch(/potassium/i);
      expect(trials.trials.every((trial: TrialRecord) => trial.query === trials.query)).toBe(true);
    }
  });
});

describe('survival states', () => {
  it('stays truthful with no documents', async () => {
    const empty = {
      ...graph,
      documents: [],
      facts: [],
      entities: [],
      edges: [],
      stats: { ...graph.stats, documents: 0, facts: 0, entities: 0, edges: 0 },
      entityKeyIndex: {},
      factsByDocument: {},
      factsByEntity: {},
    };
    const emptySnapshot = snapshotAt(empty, asOf);
    const result = await runResearch(
      input({
        graph: empty,
        snapshot: emptySnapshot,
        derivations: [],
        questions: [],
        contradictions: [],
        quality: { ...quality, overall: 0, dimensions: [] },
      }),
    );
    expect(result.personalCounts.documents).toBe(0);
    expect(result.personalCounts.facts).toBe(0);
    expect(result.personalEvidence).toEqual([]);
  });

  it('does not dump the catalog when there are no matching sources', async () => {
    const result = await runResearch(input({ question: 'What is documented about xyzzy-unknown-concept?' }));
    expect(result.sources).toEqual([]);
    expect(result.externalEvidence).toEqual([]);
  });
});
