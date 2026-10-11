import { describe, expect, it } from 'vitest';
import { LocalBuildBackend, planBuild, resolveSlice } from './backend';
import { DEFAULT_SCENARIO, PROMPT_SUGGESTIONS, SCENARIOS, matchScenario, scorePrompt } from './scenarios';
import { EMPTY_BUILD_STATE, isBuilding, stageIndex } from './types';
import type { BuildArtifact, BuildBackend, BuildStep } from './types';
import type { DocumentInput } from '../engine/ingest';

/**
 * Builder tests.
 *
 * The claim these tests defend is that the build is real work. So they check the
 * artifact against the graph, and they check the plan against the artifact: if
 * the plan says nine documents were read, nine documents were read.
 */

async function runBuild(prompt: string, pace = 0) {
  const backend = new LocalBuildBackend({ pace });
  const steps: BuildStep[] = [];
  const artifact = await backend.run({ prompt, pace }, (step) => steps.push(step));
  return { artifact, steps, backend };
}

describe('scenario matching', () => {
  it('matches a medication question to the reconciliation scenario', () => {
    const match = matchScenario('audit my medication list for contradictions');
    expect(match.scenario.id).toBe('medication-audit');
    expect(match.matchedBy).toBe('keywords');
    expect(match.matchedOn.length).toBeGreaterThan(0);
  });

  it('matches a sharing request to the export scenario', () => {
    expect(matchScenario('prepare a redacted summary for a specialist').scenario.id).toBe(
      'clinical-share',
    );
  });

  it('matches a monitoring question to the gaps scenario', () => {
    expect(matchScenario('which monitoring tests are missing?').scenario.id).toBe(
      'monitoring-gaps',
    );
  });

  it('matches a cohort question to the cohort scenario', () => {
    expect(matchScenario('run the same checks across several patients').scenario.id).toBe(
      'cohort-scan',
    );
  });

  it('says so when nothing matches, rather than pretending', () => {
    const match = matchScenario('zzzzz qqqqq');
    expect(match.matchedBy).toBe('fallback');
    expect(match.matchedOn).toEqual([]);
    expect(match.scenario.id).toBe(DEFAULT_SCENARIO.id);
  });

  it('treats an empty prompt as the default record', () => {
    expect(matchScenario('   ').matchedBy).toBe('fallback');
  });

  it('prefers the scenario that explains more of the prompt', () => {
    // "levothyroxine dose titration" is explained by the thyroid scenario's
    // vocabulary; nothing in the monitoring scenario matches it.
    const match = matchScenario('track a levothyroxine dose titration follow-up');
    expect(match.scenario.id).toBe('thyroid-titration');
  });

  it('does not double-count a keyword contained in a longer one', () => {
    // "monitor" and "monitoring" both match, but they cover the same ten
    // characters, so the score is 10 — not 17.
    const { score, matched } = scorePrompt('monitoring', ['monitor', 'monitoring']);
    expect(matched).toContain('monitor');
    expect(matched).toContain('monitoring');
    expect(score).toBe('monitoring'.length);
  });

  it('scores an unmatched prompt at zero', () => {
    expect(scorePrompt('nothing relevant here', ['thyroid', 'fhir']).score).toBe(0);
  });

  it('has a suggestion for every scenario family', () => {
    expect(PROMPT_SUGGESTIONS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(SCENARIOS.length);
  });
});

describe('planning', () => {
  it('counts the documents it will actually read', () => {
    const request = { prompt: 'reconstruct my four-year history' };
    const plan = planBuild(request);
    const slice = resolveSlice(request);
    expect(plan.documentCount).toBe(slice.documents.length);
    expect(plan.documentKinds.length).toBeGreaterThan(0);
  });

  it('states that a scenario narrows the record', () => {
    const plan = planBuild({ prompt: 'audit my medication list' });
    const full = resolveSlice({ prompt: 'reconstruct my four-year history' }).documents.length;
    expect(plan.documentCount).toBeLessThan(full);
    expect(plan.caveats.some((caveat) => caveat.includes('narrows'))).toBe(true);
  });

  it('plans an attachment build without consulting the prompt', () => {
    const attachment: DocumentInput = {
      title: 'Outside lab',
      kind: 'lab_report',
      origin: 'upload',
      date: '2026-01-05',
      text: 'Result: HbA1c 7.2 % (reference 4.0-5.6)',
    };
    const plan = planBuild({ prompt: 'anything at all', attachments: [attachment] });
    expect(plan.matchedBy).toBe('attachment');
    expect(plan.documentCount).toBe(1);
    expect(plan.documentKinds).toEqual(['lab_report']);
  });
});

describe('build execution', () => {
  it('produces an artifact whose facts come from the documents', async () => {
    const { artifact } = await runBuild('reconstruct my four-year history');

    expect(artifact.graph.documents.length).toBe(artifact.documents.length);
    expect(artifact.facts.length).toBeGreaterThan(50);
    expect(artifact.graph.stats.facts).toBe(artifact.facts.length);
  });

  it('anchors every derivation to evidence a reader can check', async () => {
    // This is the invariant that matters. A finding that cites neither a fact nor
    // a document cannot be verified by the person reading it. An absence finding
    // legitimately has no fact to cite, so it cites the scope it searched instead.
    for (const scenario of SCENARIOS) {
      const { artifact } = await runBuild(scenario.prompt);
      for (const derivation of artifact.derivations) {
        expect(
          derivation.factIds.length + derivation.docIds.length,
          `${derivation.ruleId} ("${derivation.title}") cites nothing`,
        ).toBeGreaterThan(0);
      }
    }
  }, 30000);

  it('cites the documents it searched when the finding is about absence', async () => {
    // The sparse record has no immunizations at all, so the annual-immunization
    // rule has no fact to cite and must fall back to the scope it searched.
    const { artifact } = await runBuild(
      'I only have a few sparse documents from an emergency visit — triage what you can',
    );
    const docIds = new Set(artifact.documents.map((doc) => doc.id));

    const absence = artifact.derivations.filter((d) => d.factIds.length === 0);
    expect(absence.length).toBeGreaterThan(0);
    for (const derivation of absence) {
      expect(derivation.docIds.length).toBeGreaterThan(0);
      for (const id of derivation.docIds) expect(docIds.has(id)).toBe(true);
      // And the finding must say so, rather than reading as though nothing was checked.
      expect(derivation.notConcluded.length).toBeGreaterThan(0);
    }
  });

  it('anchors every cited fact to a real character span', async () => {
    const { artifact } = await runBuild('reconstruct my four-year history');
    const docById = new Map(artifact.documents.map((doc) => [doc.id, doc]));

    for (const derivation of artifact.derivations) {
      for (const id of derivation.factIds) {
        const fact = artifact.facts.find((candidate) => candidate.id === id);
        expect(fact).toBeDefined();
        const doc = docById.get(fact!.docId);
        expect(doc).toBeDefined();
        expect(fact!.span[1]).toBeGreaterThan(fact!.span[0]);
        expect(fact!.span[1]).toBeLessThanOrEqual(doc!.text.length);
      }
    }
  });

  it('keeps the summary consistent with the derivation list', async () => {
    const { artifact } = await runBuild('reconstruct my four-year history');
    const high = artifact.derivations.filter((d) => d.severity === 'high').length;
    expect(artifact.summary.total).toBe(artifact.derivations.length);
    expect(artifact.summary.bySeverity.high).toBe(high);
  });

  it('never reports more coded concepts than concepts', async () => {
    const { artifact } = await runBuild('prepare a redacted summary for a specialist');
    expect(artifact.interop.totalConcepts).toBeGreaterThan(0);
    expect(artifact.interop.codedConcepts).toBeLessThanOrEqual(artifact.interop.totalConcepts);
    expect(artifact.interop.resourceCount).toBeGreaterThan(0);
  });

  it('reports progress that only ever moves forward', async () => {
    const { steps } = await runBuild('reconstruct my four-year history');
    expect(steps.length).toBeGreaterThan(10);

    let previous = 0;
    for (const step of steps) {
      expect(step.progress).toBeGreaterThanOrEqual(previous);
      expect(step.progress).toBeLessThanOrEqual(1);
      previous = step.progress;
    }
    expect(steps[steps.length - 1].progress).toBe(1);
    expect(steps[steps.length - 1].stage).toBe('ready');
  });

  it('touches every stage, in order', async () => {
    const { steps } = await runBuild('reconstruct my four-year history');
    const order = steps.map((step) => stageIndex(step.stage));
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index]).toBeGreaterThanOrEqual(order[index - 1]);
    }
    const stages = new Set<string>(steps.map((step) => step.stage));
    for (const stage of ['planning', 'ingesting', 'linking', 'inferring', 'packaging', 'ready']) {
      expect(stages.has(stage)).toBe(true);
    }
  });

  it('counts one ingest step per document', async () => {
    const prompt = 'reconstruct my four-year history';
    const { steps } = await runBuild(prompt);
    const expected = resolveSlice({ prompt }).documents.length;
    expect(steps.filter((step) => step.stage === 'ingesting').length).toBe(expected);
  });

  it('builds a different record for a different scenario', async () => {
    const full = await runBuild('reconstruct my four-year history');
    const sparse = await runBuild(
      'I only have a few sparse documents from an emergency visit — triage what you can',
    );

    expect(sparse.artifact.documents.length).toBeLessThan(full.artifact.documents.length);
    expect(sparse.artifact.patient.id).not.toBe(full.artifact.patient.id);
  });

  it('reads an attached document instead of the corpus', async () => {
    const backend = new LocalBuildBackend({ pace: 0 });
    const artifact = await backend.run(
      {
        prompt: 'ignore this',
        pace: 0,
        attachments: [
          {
            title: 'Outside lab',
            kind: 'lab_report',
            origin: 'upload',
            date: '2026-01-05',
            text: 'Haemoglobin A1c: 7.2 % (reference range 4.0-5.6)\nCholesterol: 5.1 mmol/L',
          },
        ],
      },
      () => {},
    );

    expect(artifact.documents.length).toBe(1);
    expect(artifact.scenarioId).toBe('attached');
    expect(artifact.facts.length).toBeGreaterThan(0);
  });

  it('is deterministic: two runs over the same input agree', async () => {
    const first = await runBuild('reconstruct my four-year history');
    const second = await runBuild('reconstruct my four-year history');
    expect(second.artifact.derivations.map((d) => d.id)).toEqual(
      first.artifact.derivations.map((d) => d.id),
    );
  });

  it('exposes the counts the preview reads, all derived from the artifact', async () => {
    const { artifact } = await runBuild('reconstruct my four-year history');
    expect(artifact.courses.length).toBeGreaterThan(0);
    expect(artifact.spans.length).toBeGreaterThan(0);
    expect(artifact.quality.dimensions.length).toBe(9);
    expect(artifact.quality.overall).toBeGreaterThan(0);
    expect(artifact.quality.overall).toBeLessThanOrEqual(100);
  });
});

describe('backend contract', () => {
  it('is replaceable: a stub satisfies the same interface', async () => {
    // The point of the interface is that a server-side generator can implement it
    // without the interface, or the presentation layer, changing.
    const stub: BuildBackend = {
      id: 'stub',
      label: 'Test backend',
      note: 'Never used in the product.',
      plan: (request) => planBuild(request),
      run: async (_request, onStep) => {
        onStep({
          id: 'only',
          stage: 'ready',
          label: 'Done',
          detail: 'Stub build.',
          progress: 1,
        });
        return { scenarioId: 'stub' } as unknown as BuildArtifact;
      },
    };

    const steps: BuildStep[] = [];
    const artifact = await stub.run({ prompt: 'anything' }, (step) => steps.push(step));
    expect(stub.id).toBe('stub');
    expect(steps).toHaveLength(1);
    expect(artifact.scenarioId).toBe('stub');
  });

  it('reports its own identity so the interface can be honest about it', () => {
    const backend = new LocalBuildBackend();
    expect(backend.label).toContain('browser');
    expect(backend.note).toContain('leaves this tab');
  });
});

describe('stage helpers', () => {
  it('knows which stages mean work is happening', () => {
    expect(isBuilding('ingesting')).toBe(true);
    expect(isBuilding('planning')).toBe(true);
    expect(isBuilding('idle')).toBe(false);
    expect(isBuilding('ready')).toBe(false);
    expect(isBuilding('error')).toBe(false);
  });

  it('orders stages', () => {
    expect(stageIndex('planning')).toBeLessThan(stageIndex('inferring'));
    expect(stageIndex('inferring')).toBeLessThan(stageIndex('ready'));
  });

  it('starts from an empty state that renders as idle', () => {
    expect(EMPTY_BUILD_STATE.stage).toBe('idle');
    expect(EMPTY_BUILD_STATE.steps).toEqual([]);
    expect(EMPTY_BUILD_STATE.artifact).toBeNull();
  });
});
