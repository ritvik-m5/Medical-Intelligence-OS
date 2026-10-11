import { describe, expect, it } from 'vitest';
import { LocalBuildBackend } from '../../builder/backend';
import { impactOf, removedFactsFor } from './impact';
import { proofDiff } from './proofDiff';
import { stabilityOf, stabilityReport } from './stability';
import { counterfactual, NOT_CLAIMED } from './counterfactual';
import {
  dependentsOfDocument,
  evidenceForFinding,
  knowableAsOf,
  mostSensitive,
  whatChanged,
  whatWouldRemoveFinding,
  whyFindingExists,
} from './questions';
import type { QuestionContext } from './questions';

/* ------------------------------------------------------------------ */
/* The research layer, over real artifacts                             */
/*                                                                    */
/* Every fixture here is produced by the real pipeline. The properties  */
/* asserted are the ones the layer exists to guarantee: that a removal  */
/* names the exact findings it takes, that a diff is step-level, that a */
/* counterfactual says what it is, and that a question which needs a    */
/* branch refuses to answer without one.                                */
/* ------------------------------------------------------------------ */

const backend = new LocalBuildBackend({ pace: 0 });

async function build(prompt: string, extra: Record<string, unknown> = {}) {
  return backend.run({ prompt, pace: 0, ...extra }, () => {});
}

async function baseline() {
  return build('diabetes monitoring');
}

function contextOf(
  artifact: Awaited<ReturnType<typeof build>>,
  extra: Partial<QuestionContext> = {},
): QuestionContext {
  return {
    graph: artifact.graph,
    derivations: artifact.derivations,
    identity: artifact.identity,
    ...extra,
  };
}

describe('dependency impact', () => {
  it('removes exactly the facts a document carries', async () => {
    const artifact = await baseline();
    const document = artifact.graph.documents.find((doc) =>
      artifact.graph.facts.some((fact) => fact.docId === doc.id),
    )!;

    const report = impactOf({ kind: 'document', id: document.id }, artifact.graph, artifact.derivations);
    const expected = artifact.graph.facts.filter((fact) => fact.docId === document.id).map((f) => f.id);

    expect(report.removedFacts.slice().sort()).toEqual(expected.slice().sort());
    expect(report.removedFacts.length).toBeGreaterThan(0);
  });

  it('names the findings that lose a premise, and no others', async () => {
    const artifact = await baseline();
    const document = artifact.graph.documents.find((doc) =>
      artifact.graph.facts.some((fact) => fact.docId === doc.id),
    )!;

    const report = impactOf({ kind: 'document', id: document.id }, artifact.graph, artifact.derivations);
    const removed = new Set(report.removedFacts);
    const expected = artifact.derivations
      .filter((derivation) => derivation.factIds.some((id) => removed.has(id)))
      .map((derivation) => derivation.id)
      .sort();

    expect(report.lostFindings.map((finding) => finding.id).sort()).toEqual(expected);
  });

  it('separates a lost finding from one that merely thins', async () => {
    const artifact = await baseline();
    const document = artifact.graph.documents.find((doc) =>
      artifact.graph.facts.some((fact) => fact.docId === doc.id),
    )!;

    const report = impactOf({ kind: 'document', id: document.id }, artifact.graph, artifact.derivations);
    const lost = new Set(report.lostFindings.map((finding) => finding.id));

    // A finding cannot be both gone and merely thinner.
    for (const thinned of report.thinnedFindings) {
      expect(lost.has(thinned.id)).toBe(false);
      expect(thinned.surviving).toBeLessThanOrEqual(thinned.total);
    }
  });

  it('withholding a rule removes its findings and no facts', async () => {
    const artifact = await baseline();
    const rule = artifact.derivations[0].ruleId;
    const fromThatRule = artifact.derivations.filter((entry) => entry.ruleId === rule).length;

    const report = impactOf({ kind: 'rule', id: rule }, artifact.graph, artifact.derivations);

    expect(report.removedFacts).toHaveLength(0);
    expect(report.lostFindings).toHaveLength(fromThatRule);
    expect(report.lostFindings.every((finding) => finding.ruleId === rule)).toBe(true);
    // No fact is removed, so no export changes.
    expect(report.exports.resources).toBe(0);
  });

  it('carries a reason on every edge, so the chain can be traced', async () => {
    const artifact = await baseline();
    const document = artifact.graph.documents.find((doc) =>
      artifact.graph.facts.some((fact) => fact.docId === doc.id),
    )!;

    const report = impactOf({ kind: 'document', id: document.id }, artifact.graph, artifact.derivations);

    expect(report.edges.length).toBeGreaterThan(0);
    for (const edge of report.edges) {
      expect(edge.detail.length).toBeGreaterThan(10);
      expect(edge.from.length).toBeGreaterThan(0);
      expect(edge.to.length).toBeGreaterThan(0);
    }
  });

  it('says so when a document carries no facts', async () => {
    const artifact = await baseline();
    const report = impactOf({ kind: 'document', id: 'no-such-document' }, artifact.graph, artifact.derivations);

    expect(report.removedFacts).toHaveLength(0);
    expect(report.lostFindings).toHaveLength(0);
    expect(report.notes.join(' ')).toContain('not in this artifact');
  });

  it('an unknown target removes nothing rather than everything', async () => {
    const artifact = await baseline();
    expect(removedFactsFor({ kind: 'fact', id: 'nope' }, artifact.graph)).toHaveLength(0);
    expect(removedFactsFor({ kind: 'entity', key: 'nope' }, artifact.graph)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Proof diff                                                          */
/* ------------------------------------------------------------------ */

/** A minimal proof, so alignment can be tested against known shapes. */
function synthetic(
  id: string,
  steps: Array<{ kind: 'premise' | 'rule' | 'conclusion'; label: string; facts?: string[] }>,
): Parameters<typeof proofDiff>[0] {
  return {
    id,
    ruleId: 'trend.threshold_crossed' as never,
    category: 'trend' as never,
    severity: 'medium' as never,
    title: id,
    statement: id,
    steps: steps.map((step, index) => ({
      id: `${id}-s${index}`,
      kind: step.kind as never,
      label: step.label,
      factIds: step.facts ?? [],
      docIds: [],
      dependsOn: [],
      justification: step.label,
      confidence: 0.8,
    })),
    conclusionId: `${id}-s${steps.length - 1}`,
    depth: steps.length - 1,
    factIds: steps.flatMap((step) => step.facts ?? []),
    docIds: [],
    entityKeys: [],
    window: { start: '2024-01-01', end: '2024-06-01' },
    confidence: 0.8,
    grade: 'A' as never,
    question: '',
    notConcluded: '',
  };
}

describe('proof diff', () => {
  it('reports an identical proof as entirely unchanged', async () => {
    const artifact = await baseline();
    const derivation = artifact.derivations[0];
    const diff = proofDiff(derivation, derivation);

    expect(diff.presence).toBe('both');
    expect(diff.counts.unchanged).toBe(diff.lines.length);
    expect(diff.counts.added + diff.counts.removed + diff.counts.replaced + diff.counts.changed).toBe(0);
    expect(diff.headline).toContain('identical');
  });

  it('reports a proof that exists on one side only, in full', async () => {
    const artifact = await baseline();
    const derivation = artifact.derivations[0];

    const gone = proofDiff(derivation, null);
    expect(gone.presence).toBe('only-before');
    expect(gone.counts.removed).toBe(derivation.steps.length);
    expect(gone.lines.length).toBe(derivation.steps.length);
    expect(gone.notes.join(' ')).toContain('only in the baseline');

    const appeared = proofDiff(null, derivation);
    expect(appeared.presence).toBe('only-after');
    expect(appeared.counts.added).toBe(derivation.steps.length);
  });

  it('does not treat an inserted step as a rewrite of everything after it', () => {
    const before = synthetic('A', [
      { kind: 'premise', label: 'Premise A', facts: ['f1'] },
      { kind: 'premise', label: 'Premise B', facts: ['f2'] },
      { kind: 'rule', label: 'Rule X' },
      { kind: 'conclusion', label: 'Conclusion Y' },
    ]);
    const after = synthetic('A', [
      { kind: 'premise', label: 'Premise A', facts: ['f1'] },
      { kind: 'premise', label: 'Premise B', facts: ['f2'] },
      { kind: 'premise', label: 'Premise D', facts: ['f4'] },
      { kind: 'rule', label: 'Rule X' },
      { kind: 'conclusion', label: 'Conclusion Y' },
    ]);

    const diff = proofDiff(before, after);

    expect(diff.counts.added).toBe(1);
    expect(diff.counts.unchanged).toBe(4);
    expect(diff.counts.removed).toBe(0);
    expect(diff.counts.replaced).toBe(0);
    expect(diff.premises.added).toEqual(['f4']);
  });

  it('calls a swap at the same position a replacement, not an add plus a remove', () => {
    const before = synthetic('A', [
      { kind: 'premise', label: 'Premise A', facts: ['f1'] },
      { kind: 'premise', label: 'Premise B', facts: ['f2'] },
      { kind: 'conclusion', label: 'Conclusion Y' },
    ]);
    const after = synthetic('A', [
      { kind: 'premise', label: 'Premise A', facts: ['f1'] },
      { kind: 'premise', label: 'Premise C', facts: ['f3'] },
      { kind: 'conclusion', label: 'Conclusion Y' },
    ]);

    const diff = proofDiff(before, after);
    expect(diff.counts.replaced).toBe(1);
    expect(diff.premises.removed).toEqual(['f2']);
    expect(diff.premises.added).toEqual(['f3']);
    expect(diff.counts.unchanged).toBe(2);
  });

  it('marks a step that keeps its label but changes its premises as changed', () => {
    const before = synthetic('A', [
      { kind: 'premise', label: 'Premise A', facts: ['f1'] },
      { kind: 'rule', label: 'Rule X' },
    ]);
    const after = synthetic('A', [
      { kind: 'premise', label: 'Premise A', facts: ['f1', 'f9'] },
      { kind: 'rule', label: 'Rule X' },
    ]);

    const diff = proofDiff(before, after);
    expect(diff.counts.changed).toBe(1);
    expect(diff.counts.unchanged).toBe(1);
    expect(diff.lines.find((line) => line.change === 'changed')?.reason).toContain(
      'resting on 1 premises before and 2 now',
    );
  });

  it('names the premises that moved, rather than counting them', async () => {
    const artifact = await baseline();
    const a = artifact.derivations[0];
    const b = { ...a, factIds: [...a.factIds, 'extra-fact'] };
    const diff = proofDiff(a, b, (id) => `label:${id}`);

    expect(diff.notes.join(' ')).toContain('label:extra-fact');
  });
});

/* ------------------------------------------------------------------ */
/* Evidence stability                                                  */
/* ------------------------------------------------------------------ */

describe('evidence stability', () => {
  it('profiles every finding with numbers read off the proof', async () => {
    const artifact = await baseline();
    const report = stabilityReport(artifact.derivations, artifact.graph);

    expect(report.profiles).toHaveLength(artifact.derivations.length);
    for (const profile of report.profiles) {
      // A finding may legitimately cite no fact, which is why it is classified
      // unsupported rather than assumed to have evidence.
      expect(profile.evidenceCount).toBeGreaterThanOrEqual(0);
      expect(profile.independentDocuments).toBeLessThanOrEqual(profile.evidenceCount);
      expect(profile.supportingSpans).toBeLessThanOrEqual(profile.evidenceCount);
      expect(['stable', 'sensitive', 'fragile', 'unsupported']).toContain(profile.classification);
      expect(profile.reasons.length).toBeGreaterThan(0);
    }
    expect(
      report.byClass.stable +
        report.byClass.sensitive +
        report.byClass.fragile +
        report.byClass.unsupported,
    ).toBe(report.profiles.length);
  });

  it('never classifies a proof that cites no fact as anything but unsupported', async () => {
    const artifact = await baseline();
    for (const derivation of artifact.derivations.filter((entry) => entry.factIds.length === 0)) {
      expect(stabilityOf(derivation, artifact.graph).classification).toBe('unsupported');
    }
  });

  it('says branch sensitivity is unmeasured rather than assuming it is zero', async () => {
    const artifact = await baseline();
    const report = stabilityReport(artifact.derivations, artifact.graph);

    for (const profile of report.profiles) {
      expect(profile.branchSensitivity).toBeNull();
      expect(profile.dateSensitivity).toBeNull();
    }
    expect(report.notes.join(' ')).toContain('unmeasured');
  });

  it('calls a single-fact conclusion fragile', async () => {
    const artifact = await baseline();
    const single = artifact.derivations.find(
      (entry) => entry.factIds.length === 1 && entry.grade !== 'D',
    );
    if (!single) return; // The record may have none; nothing to assert.

    const profile = stabilityOf(single, artifact.graph);
    expect(profile.classification).toBe('fragile');
    // Fragile for one of the two reasons that a single premise implies: it is
    // the only evidence, or the evidence it rests on is flagged.
    expect(profile.reasons.join(' ')).toMatch(/single fact|carry a flag/);
  });

  it('calls a proof with no cited fact unsupported', async () => {
    const artifact = await baseline();
    const empty = { ...artifact.derivations[0], factIds: [], grade: 'A' as const };
    const profile = stabilityOf(empty, artifact.graph);

    expect(profile.classification).toBe('unsupported');
    expect(profile.reasons.join(' ')).toContain('cites no fact');
  });

  it('calls grade D unsupported', async () => {
    const artifact = await baseline();
    const weak = { ...artifact.derivations[0], grade: 'D' as const };
    expect(stabilityOf(weak, artifact.graph).classification).toBe('unsupported');
  });

  it('measures branch sensitivity once a branch has been run', async () => {
    const parent = await baseline();
    const rule = parent.derivations[0].ruleId;
    const child = await build('diabetes monitoring', { suppressRules: [rule] });

    const profile = stabilityOf(parent.derivations[0], parent.graph, [
      { label: 'branch', operation: 'withhold-rule', derivations: child.derivations },
    ]);

    expect(profile.branchSensitivity).not.toBeNull();
    // The rule that produced this finding was withheld, so it must be absent.
    expect(profile.branchSensitivity).toBe(1);
    // Whether the label is `fragile` or `sensitive` depends on the proof's own
    // structure, which takes precedence — but the measurement is reported either
    // way, so it is never lost behind the classification.
    expect(['fragile', 'sensitive']).toContain(profile.classification);
    expect(profile.reasons.join(' ')).toContain('absent in 100%');
  });
});

/* ------------------------------------------------------------------ */
/* Counterfactual                                                      */
/* ------------------------------------------------------------------ */

describe('the counterfactual layer', () => {
  it('labels every result as a counterfactual and says what it will not claim', async () => {
    const artifact = await baseline();
    const result = counterfactual(
      { kind: 'withhold-rule', ruleId: artifact.derivations[0].ruleId },
      { identity: artifact.identity.id, graph: artifact.graph, derivations: artifact.derivations },
      null,
    );

    expect(result.label).toBe('COUNTERFACTUAL');
    // The discipline is part of the result, not of the interface that shows it.
    expect(result.notClaimed).toEqual([...NOT_CLAIMED]);
    expect(result.notClaimed.join(' ')).toContain('not a statement about the record');
    expect(result.notClaimed.join(' ')).toContain('No clinical recommendation');
  });

  it('says plainly when the branch has not been run, and infers nothing', async () => {
    const artifact = await baseline();
    const result = counterfactual(
      { kind: 'withhold-document', docId: artifact.graph.documents[0].id },
      { identity: artifact.identity.id, graph: artifact.graph, derivations: artifact.derivations },
      null,
    );

    expect(result.executed).toBe(false);
    expect(result.interventionResult).toBeNull();
    expect(result.changed).toHaveLength(0);
    expect(result.notes.join(' ')).toContain('has not been run');
    expect(result.notes.join(' ')).toContain('nothing below has been re-derived');
  });

  it('reports the findings a withheld rule would take, with their proofs', async () => {
    const parent = await baseline();
    const rule = parent.derivations[0].ruleId;
    const child = await build('diabetes monitoring', { suppressRules: [rule] });

    const result = counterfactual(
      { kind: 'withhold-rule', ruleId: rule },
      { identity: parent.identity.id, graph: parent.graph, derivations: parent.derivations },
      { identity: child.identity.id, graph: child.graph, derivations: child.derivations },
    );

    expect(result.executed).toBe(true);
    const lost = result.changed.filter((change) => change.change === 'lost');
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.every((change) => change.ruleId === rule)).toBe(true);
    // Each change carries the proof that vanished, in full.
    for (const change of lost) {
      expect(change.proof?.presence).toBe('only-before');
      expect(change.proof?.lines.length).toBeGreaterThan(0);
    }
    expect(result.baseline.findings).toBeGreaterThan(result.interventionResult!.findings);
  });

  it('reports findings the record would gain from an added document', async () => {
    const full = await baseline();

    // Find a document whose removal genuinely costs findings. Taking the reverse
    // of a real withholding makes the gain a guarantee rather than a hope about
    // what a synthetic document would happen to trigger.
    let document = null as (typeof full.graph.documents)[number] | null;
    let reduced = full;
    for (const candidate of full.graph.documents) {
      const attempt = await build('diabetes monitoring', {
        withholdDocuments: [candidate.title],
      });
      if (attempt.derivations.length < full.derivations.length) {
        document = candidate;
        reduced = attempt;
        break;
      }
    }
    expect(document).not.toBeNull();

    const result = counterfactual(
      { kind: 'add-document', title: document!.title },
      { identity: reduced.identity.id, graph: reduced.graph, derivations: reduced.derivations },
      { identity: full.identity.id, graph: full.graph, derivations: full.derivations },
    );

    expect(result.question).toContain(document!.title);
    expect(result.executed).toBe(true);

    const gained = result.changed.filter((change) => change.change === 'gained');
    expect(gained.length).toBeGreaterThan(0);
    for (const change of gained) {
      expect(change.proof?.presence).toBe('only-after');
      expect(change.proof?.lines.length).toBeGreaterThan(0);
    }
  });

  it('can gain findings by removing a document, because the engine re-derives', async () => {
    const full = await baseline();

    /*
     * Removing evidence is not subtraction.
     *
     * A visit that documents a problem is also the thing that stops the record
     * being silent about it. Take the visit away and a silence rule can fire
     * where none did before, so the branch supports *more* findings than the
     * baseline. This is the strongest available evidence that a branch is a real
     * re-derivation rather than a filter over the parent's conclusions.
     */
    let gainedByRemoval: Awaited<ReturnType<typeof build>> | null = null;
    let removedTitle = '';
    for (const candidate of full.graph.documents) {
      const attempt = await build('diabetes monitoring', {
        withholdDocuments: [candidate.title],
      });
      if (attempt.derivations.length > full.derivations.length) {
        gainedByRemoval = attempt;
        removedTitle = candidate.title;
        break;
      }
    }

    // If this record happens not to exhibit it, the property is not asserted —
    // but when it does, the counterfactual must report it as a gain.
    if (!gainedByRemoval) return;

    const result = counterfactual(
      { kind: 'withhold-document', docId: full.graph.documents.find((d) => d.title === removedTitle)!.id },
      { identity: full.identity.id, graph: full.graph, derivations: full.derivations },
      {
        identity: gainedByRemoval.identity.id,
        graph: gainedByRemoval.graph,
        derivations: gainedByRemoval.derivations,
      },
    );

    const gained = result.changed.filter((change) => change.change === 'gained');
    expect(gained.length).toBeGreaterThan(0);
    expect(result.interventionResult!.findings).toBeGreaterThan(result.baseline.findings);
    // And it is still labelled a counterfactual, because it is one.
    expect(result.label).toBe('COUNTERFACTUAL');
  });

  it('reports every change with its proof, and never without one', async () => {
    const parent = await baseline();
    const rule = parent.derivations[0].ruleId;
    const child = await build('diabetes monitoring', { suppressRules: [rule] });

    const result = counterfactual(
      { kind: 'withhold-rule', ruleId: rule },
      { identity: parent.identity.id, graph: parent.graph, derivations: parent.derivations },
      { identity: child.identity.id, graph: child.graph, derivations: child.derivations },
    );

    expect(result.changed.length).toBeGreaterThan(0);
    for (const change of result.changed) {
      expect(['lost', 'gained', 'moved']).toContain(change.change);
      expect(change.proof).not.toBeNull();
      expect(change.proof!.lines.length).toBeGreaterThan(0);
      expect(change.ruleId.length).toBeGreaterThan(0);
      expect(change.title.length).toBeGreaterThan(0);
    }
  });

  it('carries an impact chain for an intervention that removes evidence', async () => {
    const artifact = await baseline();
    const document = artifact.graph.documents.find((doc) =>
      artifact.graph.facts.some((fact) => fact.docId === doc.id),
    )!;

    const result = counterfactual(
      { kind: 'withhold-document', docId: document.id },
      { identity: artifact.identity.id, graph: artifact.graph, derivations: artifact.derivations },
      null,
    );

    expect(result.impact).not.toBeNull();
    expect(result.impact!.removedFacts.length).toBeGreaterThan(0);
    expect(result.impact!.edges.length).toBeGreaterThan(0);
  });

  it('describes the question in terms of the record, not in the abstract', async () => {
    const artifact = await baseline();
    const document = artifact.graph.documents[0];

    const result = counterfactual(
      { kind: 'withhold-document', docId: document.id },
      { identity: artifact.identity.id, graph: artifact.graph, derivations: artifact.derivations },
      null,
    );

    expect(result.question).toContain(document.title);
    expect(result.question).toContain('had never been written');
  });
});

/* ------------------------------------------------------------------ */
/* Research questions                                                  */
/*                                                                    */
/* Two properties matter more than the wording of any answer: every     */
/* answer carries limitations, and an answer that needs a branch is      */
/* refused rather than estimated when no branch has been run.            */
/* ------------------------------------------------------------------ */

describe('research questions', () => {
  it('refuses to say what was knowable without a branch to say it from', async () => {
    const artifact = await baseline();
    const answer = knowableAsOf('2024-06-01', contextOf(artifact));

    expect(answer.requiresBranch).toBe(true);
    expect(answer.citations).toHaveLength(0);
    expect(answer.answer).toContain('needs a branch');
    expect(answer.limitations.join(' ')).toContain('Nothing is claimed');
  });

  it('answers what was knowable from a branch that was actually run', async () => {
    const artifact = await baseline();
    const earliest = artifact.graph.stats.spanStart;
    const branch = await build('diabetes monitoring', { asOf: earliest });

    const answer = knowableAsOf(
      earliest,
      contextOf(artifact, {
        branches: [{ label: 'as-of', operation: 'as-of', derivations: branch.derivations }],
      }),
    );

    expect(answer.requiresBranch).toBe(false);
    expect(answer.answer).toContain(earliest);
    expect(answer.answer).toContain(`${branch.derivations.length} of the current`);
    expect(answer.citations.length).toBeGreaterThan(0);
    // Absence at an earlier date is not a claim that nothing was happening.
    expect(answer.limitations.join(' ')).toContain('did not yet support it');
  });

  it('explains a finding from its own proof, and states what it does not conclude', async () => {
    const artifact = await baseline();
    const derivation = artifact.derivations[0];
    const answer = whyFindingExists(derivation.id, contextOf(artifact));

    expect(answer.citations.some((citation) => citation.kind === 'rule')).toBe(true);
    expect(answer.citations.some((citation) => citation.kind === 'fact')).toBe(true);
    expect(answer.answer).toContain('confidence');
    expect(answer.answer).toContain('evidence grade');
    expect(answer.limitations).toContain(derivation.notConcluded);
  });

  it('says so when asked about a finding that is not in the artifact', async () => {
    const artifact = await baseline();
    for (const answer of [
      whyFindingExists('no-such-id', contextOf(artifact)),
      evidenceForFinding('no-such-id', contextOf(artifact)),
      whatWouldRemoveFinding('no-such-id', contextOf(artifact)),
    ]) {
      expect(answer.citations).toHaveLength(0);
      // Every one of them says the id is not in this artifact, in its own words.
      expect(answer.answer).toMatch(/in this artifact/);
      expect(answer.answer).toContain('no-such-id');
      expect(answer.limitations.length).toBeGreaterThan(0);
    }
  });

  it('marks an evidence answer as needing a branch when sensitivity is unmeasured', async () => {
    const artifact = await baseline();
    const answer = evidenceForFinding(artifact.derivations[0].id, contextOf(artifact));

    expect(answer.profiles).toHaveLength(1);
    expect(answer.profiles![0].branchSensitivity).toBeNull();
    expect(answer.requiresBranch).toBe(true);
    expect(answer.limitations.join(' ')).toContain('not been measured');
  });

  it('names which conclusions depend on a document', async () => {
    const artifact = await baseline();
    const document = artifact.graph.documents.find((doc) =>
      artifact.graph.facts.some((fact) => fact.docId === doc.id),
    )!;

    const answer = dependentsOfDocument(document.id, contextOf(artifact));

    expect(answer.question).toContain(document.title);
    expect(answer.impact).toBeDefined();
    expect(answer.impact!.removedFacts.length).toBeGreaterThan(0);
    // It reports a dependency calculation rather than claiming a re-derivation.
    expect(answer.limitations.join(' ')).toContain('not a re-derivation');
  });

  it('refuses to compare one run with nothing', async () => {
    const artifact = await baseline();
    const answer = whatChanged(contextOf(artifact));

    expect(answer.citations).toHaveLength(0);
    expect(answer.answer).toContain('Two runs are needed');
    expect(answer.limitations.join(' ')).toContain('nothing is claimed');
  });

  it('compares two runs and explains whether the corpus or the engine differs', async () => {
    const a = await baseline();
    const b = await build('immunization record');

    const answer = whatChanged(
      contextOf(a, {
        other: { identity: b.identity, derivations: b.derivations, label: 'other' },
      }),
    );

    expect(answer.answer).toContain(a.identity.id);
    expect(answer.answer).toContain(b.identity.id);
    expect(answer.limitations.join(' ')).toContain('different corpora');
    expect(answer.limitations.join(' ')).toContain('same engine version');
  });

  it('ranks the least-supported findings first', async () => {
    const artifact = await baseline();
    const answer = mostSensitive(contextOf(artifact));

    if (answer.profiles && answer.profiles.length > 1) {
      const rank = { unsupported: 0, fragile: 1, sensitive: 2, stable: 3 };
      for (let index = 1; index < answer.profiles.length; index += 1) {
        expect(rank[answer.profiles[index - 1].classification]).toBeLessThanOrEqual(
          rank[answer.profiles[index].classification],
        );
      }
      // Stable findings are excluded: they are not sensitive to missing evidence.
      expect(answer.profiles.every((profile) => profile.classification !== 'stable')).toBe(true);
    }
    expect(answer.requiresBranch).toBe(true);
    expect(answer.limitations.join(' ')).toContain('unmeasured');
  });

  it('separates premises that remove only this finding from shared ones', async () => {
    const artifact = await baseline();
    const derivation = artifact.derivations.find((entry) => entry.factIds.length > 1);
    if (!derivation) return;

    const answer = whatWouldRemoveFinding(derivation.id, contextOf(artifact));

    expect(answer.answer).toContain('Withholding');
    expect(answer.citations.length).toBeGreaterThan(0);
    // It reports what the record would no longer support, not that anything is wrong.
    expect(answer.limitations.join(' ')).toContain('does not say the finding is wrong');
  });

  it('gives every answer a limitation', async () => {
    const artifact = await baseline();
    const context = contextOf(artifact);
    const derivation = artifact.derivations[0];

    const answers = [
      whyFindingExists(derivation.id, context),
      evidenceForFinding(derivation.id, context),
      whatWouldRemoveFinding(derivation.id, context),
      whatChanged(context),
      dependentsOfDocument(artifact.graph.documents[0].id, context),
      mostSensitive(context),
      knowableAsOf('2024-06-01', context),
    ];

    for (const answer of answers) {
      expect(answer.limitations.length).toBeGreaterThan(0);
      for (const limitation of answer.limitations) {
        expect(limitation.length).toBeGreaterThan(10);
      }
      expect(answer.question.length).toBeGreaterThan(0);
      expect(answer.answer.length).toBeGreaterThan(0);
    }
  });
});
