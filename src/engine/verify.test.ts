import { describe, expect, it } from 'vitest';
import { verifyFacts, verifyProofs, verifyProvenance, verificationHeadline } from './verify';
import { buildPrimaryGraph, buildCohortGraphs } from '../data/cohortIndex';
import { derive } from './derive/engine';
import type { Derivation } from './derive/types';
import type { HealthGraph } from './types';

/**
 * Verification tests.
 *
 * The first half asserts the real corpus passes. The second half deliberately
 * breaks things, because a check that cannot fail is not a check. Each mutation
 * corresponds to a way the invariant could actually be violated.
 */

function graphWithDerivations(): { graph: HealthGraph; derivations: Derivation[] } {
  const graph = buildPrimaryGraph();
  return { graph, derivations: derive(graph, graph.stats.spanEnd) };
}

describe('the real corpus verifies', () => {
  it('re-reads every fact from its source span', () => {
    const { graph } = graphWithDerivations();
    const facts = verifyFacts(graph);

    expect(facts.problems).toEqual([]);
    expect(facts.resolvable).toBe(graph.facts.length);
    expect(facts.anchored).toBe(graph.facts.length);
    expect(facts.quoted).toBe(graph.facts.length);
  });

  it('finds every proof ordered, resolved and evidenced', () => {
    const { derivations } = graphWithDerivations();
    const proofs = verifyProofs(derivations);

    expect(proofs.problems).toEqual([]);
    expect(proofs.withProof).toBe(derivations.length);
    expect(proofs.ordered).toBe(derivations.length);
    expect(proofs.resolved).toBe(derivations.length);
    expect(proofs.withEvidence).toBe(derivations.length);
  });

  it('reports a clean result with a full score', () => {
    const { graph, derivations } = graphWithDerivations();
    const report = verifyProvenance(graph, derivations);

    expect(report.clean).toBe(true);
    expect(report.score).toBe(100);
    expect(report.citations.danglingFactRefs).toBe(0);
    expect(report.citations.danglingDocRefs).toBe(0);
    expect(verificationHeadline(report)).toContain('re-read from their source spans');
  });

  it('holds for every subject in the cohort, not just the primary record', () => {
    for (const entry of buildCohortGraphs()) {
      const derivations = derive(entry.graph, entry.graph.stats.spanEnd);
      const report = verifyProvenance(entry.graph, derivations);
      expect(report.problems.facts, `${entry.label} facts`).toEqual([]);
      expect(report.problems.proofs, `${entry.label} proofs`).toEqual([]);
      expect(report.clean, entry.label).toBe(true);
    }
  });
});

describe('the check can actually fail', () => {
  it('catches a fact whose span was moved off its own text', () => {
    const { graph } = graphWithDerivations();
    // Point the first fact at a span that holds different characters.
    const broken: HealthGraph = {
      ...graph,
      facts: graph.facts.map((fact, index) =>
        index === 0 ? { ...fact, span: [0, 4] as [number, number] } : fact,
      ),
    };

    const facts = verifyFacts(broken);
    expect(facts.problems.length).toBe(1);
    expect(facts.problems[0].factId).toBe(graph.facts[0].id);
    expect(facts.problems[0].reason).toContain('not present in the fact');
    expect(facts.quoted).toBe(graph.facts.length - 1);
    expect(verifyProvenance(broken, []).clean).toBe(false);
  });

  it('catches a fact whose span runs past the end of its document', () => {
    const { graph } = graphWithDerivations();
    const broken: HealthGraph = {
      ...graph,
      facts: graph.facts.map((fact, index) =>
        index === 0 ? { ...fact, span: [0, 10_000_000] as [number, number] } : fact,
      ),
    };

    const facts = verifyFacts(broken);
    expect(facts.problems[0].reason).toContain('outside the document');
    expect(facts.anchored).toBe(graph.facts.length - 1);
  });

  it('catches a fact pointing at a document that does not exist', () => {
    const { graph } = graphWithDerivations();
    const broken: HealthGraph = {
      ...graph,
      facts: graph.facts.map((fact, index) =>
        index === 0 ? { ...fact, docId: 'doc_does_not_exist' } : fact,
      ),
    };

    const facts = verifyFacts(broken);
    expect(facts.problems[0].reason).toContain('not in the graph');
    expect(facts.resolvable).toBe(graph.facts.length - 1);
  });

  it('catches a proof whose dependency appears after the step that needs it', () => {
    const { derivations } = graphWithDerivations();
    const target = derivations.find((d) => d.steps.length >= 3)!;

    // Swap the first two steps. Dependencies now point forwards.
    const [first, second, ...rest] = target.steps;
    const broken: Derivation[] = [
      { ...target, steps: [second, first, ...rest] },
      ...derivations.filter((d) => d.id !== target.id),
    ];

    const proofs = verifyProofs(broken);
    expect(proofs.problems.length).toBe(1);
    expect(proofs.problems[0].derivationId).toBe(target.id);
    expect(proofs.problems[0].reason).toMatch(/at or after/);
    expect(proofs.ordered).toBe(derivations.length - 1);
  });

  it('catches a proof whose dependency points outside itself', () => {
    const { derivations } = graphWithDerivations();
    const target = derivations[0];
    const broken: Derivation[] = [
      {
        ...target,
        steps: target.steps.map((step, index) =>
          index === 0 ? { ...step, dependsOn: ['step_that_does_not_exist'] } : step,
        ),
      },
      ...derivations.slice(1),
    ];

    const proofs = verifyProofs(broken);
    expect(proofs.problems[0].reason).toContain('do not resolve');
    expect(proofs.resolved).toBe(derivations.length - 1);
  });

  it('catches a proof whose conclusion is not among its own steps', () => {
    const { derivations } = graphWithDerivations();
    const broken: Derivation[] = [
      { ...derivations[0], conclusionId: 'not_a_step' },
      ...derivations.slice(1),
    ];

    const proofs = verifyProofs(broken);
    expect(proofs.problems[0].reason).toContain('is not one of its own steps');
  });

  it('catches a finding that cites nothing at all', () => {
    const { derivations } = graphWithDerivations();
    const broken: Derivation[] = [
      { ...derivations[0], factIds: [], docIds: [] },
      ...derivations.slice(1),
    ];

    const proofs = verifyProofs(broken);
    expect(proofs.problems.some((p) => p.reason.includes('cannot check it'))).toBe(true);
    expect(proofs.withEvidence).toBe(derivations.length - 1);
  });

  it('catches a dangling citation', () => {
    const { graph, derivations } = graphWithDerivations();
    const broken: Derivation[] = [
      { ...derivations[0], factIds: ['fact_that_does_not_exist'] },
      ...derivations.slice(1),
    ];

    const report = verifyProvenance(graph, broken);
    expect(report.citations.danglingFactRefs).toBe(1);
    expect(report.clean).toBe(false);
    expect(verificationHeadline(report)).toContain('did not verify');
  });

  it('reports a score below 100 when something fails, and 100 when nothing does', () => {
    const { graph, derivations } = graphWithDerivations();
    const broken: Derivation[] = [
      { ...derivations[0], factIds: [], docIds: [] },
      ...derivations.slice(1),
    ];

    expect(verifyProvenance(graph, broken).score).toBeLessThan(100);
    expect(verifyProvenance(graph, derivations).score).toBe(100);
  });
});
