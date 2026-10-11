import type { Derivation } from './derive/types';
import { validateFactEvidenceSpans } from './evidence/spans';
import type { Fact, HealthGraph, SourceDocument } from './types';

/* ------------------------------------------------------------------ */
/* Provenance verification                                             */
/*                                                                    */
/* The tests already assert that every fact is anchored to a real span */
/* and every proof graph is a well-formed DAG. This module ships the    */
/* same assertions as a runtime capability, so the product can state    */
/* the invariant on screen rather than only in CI.                      */
/*                                                                    */
/* Nothing here trusts the graph. Every claim is re-derived from the    */
/* source text, which is the only way a reader can check it.            */
/* ------------------------------------------------------------------ */

export interface FactProblem {
  factId: string;
  docId: string;
  entityKey: string;
  reason: string;
}

export interface ProofProblem {
  derivationId: string;
  ruleId: string;
  reason: string;
}

export interface ProvenanceReport {
  facts: {
    total: number;
    /** Span is inside the document and covers at least one character. */
    anchored: number;
    /** The slice at that span is contained in the fact's own quote. */
    quoted: number;
    /** The document the fact names exists. */
    resolvable: number;
  };
  derivations: {
    total: number;
    /** Has at least one step and a conclusion that exists. */
    withProof: number;
    /** Every dependency resolves to a step in the same proof. */
    resolved: number;
    /** Every dependency appears earlier than the step that needs it. */
    ordered: number;
    /** Cites at least one fact or one document. */
    withEvidence: number;
  };
  citations: {
    factRefs: number;
    danglingFactRefs: number;
    docRefs: number;
    danglingDocRefs: number;
  };
  problems: {
    facts: FactProblem[];
    proofs: ProofProblem[];
  };
  /** True when nothing at all failed. */
  clean: boolean;
  /** 0-100. The headline figure. */
  score: number;
}

/**
 * Check that every fact still resolves to the characters it claims to come from.
 *
 * This is a genuine re-read of the source text, not a lookup of a stored flag.
 * If a document were edited or a span recomputed wrongly, this would catch it.
 */
export function verifyFacts(graph: HealthGraph): {
  anchored: number;
  quoted: number;
  resolvable: number;
  problems: FactProblem[];
} {
  const docById = new Map<string, SourceDocument>(graph.documents.map((doc) => [doc.id, doc]));
  const problems: FactProblem[] = [];
  let anchored = 0;
  let quoted = 0;
  let resolvable = 0;

  for (const fact of graph.facts) {
    const doc = docById.get(fact.docId);
    if (!doc) {
      problems.push({
        factId: fact.id,
        docId: fact.docId,
        entityKey: fact.entityKey,
        reason: 'Names a document that is not in the graph.',
      });
      continue;
    }
    resolvable += 1;

    const [start, end] = fact.span;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      end > doc.text.length
    ) {
      problems.push({
        factId: fact.id,
        docId: fact.docId,
        entityKey: fact.entityKey,
        reason: `Span ${start}..${end} is outside the document (length ${doc.text.length}).`,
      });
      continue;
    }
    anchored += 1;

    const slice = doc.text.slice(start, end);
    if (slice.length > 0 && fact.quote.includes(slice)) {
      quoted += 1;
    } else {
      problems.push({
        factId: fact.id,
        docId: fact.docId,
        entityKey: fact.entityKey,
        reason: `The text at span ${start}..${end} is not present in the fact's own quote.`,
      });
    }

    for (const spanProblem of validateFactEvidenceSpans(doc, fact)) {
      problems.push({
        factId: fact.id,
        docId: fact.docId,
        entityKey: fact.entityKey,
        reason: `[${spanProblem.role}] ${spanProblem.reason}`,
      });
    }

    if (fact.valueNum !== undefined && (fact.type === 'measurement' || fact.type === 'vital')) {
      const numeric = String(fact.valueNum);
      if (!slice.includes(numeric)) {
        problems.push({
          factId: fact.id,
          docId: fact.docId,
          entityKey: fact.entityKey,
          reason: `Primary span does not contain the reported numeric value ${numeric}.`,
        });
      }
    }
  }

  return { anchored, quoted, resolvable, problems };
}

/**
 * Check every proof graph.
 *
 * A proof is well formed when every dependency resolves to a step inside the same
 * derivation and appears before the step that consumes it. That second condition
 * is what makes the list readable top to bottom, and it also rules out cycles.
 */
export function verifyProofs(derivations: Derivation[]): {
  withProof: number;
  resolved: number;
  ordered: number;
  withEvidence: number;
  problems: ProofProblem[];
} {
  const problems: ProofProblem[] = [];
  let withProof = 0;
  let resolved = 0;
  let ordered = 0;
  let withEvidence = 0;

  for (const derivation of derivations) {
    const fail = (reason: string) =>
      problems.push({ derivationId: derivation.id, ruleId: derivation.ruleId, reason });

    if (derivation.steps.length === 0) {
      fail('Has no steps.');
      continue;
    }

    const positions = new Map<string, number>();
    derivation.steps.forEach((step, index) => positions.set(step.id, index));

    if (!positions.has(derivation.conclusionId)) {
      fail(`Conclusion ${derivation.conclusionId} is not one of its own steps.`);
      continue;
    }
    withProof += 1;

    let unresolved = 0;
    let misordered = 0;
    for (const step of derivation.steps) {
      const at = positions.get(step.id)!;
      for (const dependency of step.dependsOn) {
        const where = positions.get(dependency);
        if (where === undefined) unresolved += 1;
        else if (where >= at) misordered += 1;
      }
    }

    if (unresolved === 0) resolved += 1;
    else
      fail(
        `${unresolved} step dependenc${unresolved === 1 ? 'y' : 'ies'} do not resolve inside this proof.`,
      );

    if (misordered === 0) ordered += 1;
    else
      fail(
        `${misordered} step dependenc${misordered === 1 ? 'y appears' : 'ies appear'} at or after the step that needs it.`,
      );

    if (derivation.factIds.length + derivation.docIds.length > 0) withEvidence += 1;
    else fail('Cites neither a fact nor a document, so a reader cannot check it.');
  }

  return { withProof, resolved, ordered, withEvidence, problems };
}

/** Check that every id a derivation cites actually exists. */
export function verifyCitations(
  graph: HealthGraph,
  derivations: Derivation[],
): {
  factRefs: number;
  danglingFactRefs: number;
  docRefs: number;
  danglingDocRefs: number;
} {
  const factIds = new Set(graph.facts.map((fact) => fact.id));
  const docIds = new Set(graph.documents.map((doc) => doc.id));

  let factRefs = 0;
  let danglingFactRefs = 0;
  let docRefs = 0;
  let danglingDocRefs = 0;

  for (const derivation of derivations) {
    const seenFacts = new Set<string>();
    for (const id of derivation.factIds) {
      if (seenFacts.has(id)) continue;
      seenFacts.add(id);
      factRefs += 1;
      if (!factIds.has(id)) danglingFactRefs += 1;
    }
    const seenDocs = new Set<string>();
    for (const id of derivation.docIds) {
      if (seenDocs.has(id)) continue;
      seenDocs.add(id);
      docRefs += 1;
      if (!docIds.has(id)) danglingDocRefs += 1;
    }
  }

  return { factRefs, danglingFactRefs, docRefs, danglingDocRefs };
}

/**
 * The full check, as the interface reports it.
 *
 * The score is the share of individual assertions that held, across facts, proofs
 * and citations together. It is a ratio of things that passed, not a weighted
 * opinion, and it is computed from scratch every time it is asked for.
 */
export function verifyProvenance(graph: HealthGraph, derivations: Derivation[]): ProvenanceReport {
  const facts = verifyFacts(graph);
  const proofs = verifyProofs(derivations);
  const citations = verifyCitations(graph, derivations);

  const problems = { facts: facts.problems, proofs: proofs.problems };

  const factPassed = facts.resolvable + facts.anchored + facts.quoted;
  const factAttempted = graph.facts.length * 3;
  const proofPassed =
    proofs.withProof + proofs.resolved + proofs.ordered + proofs.withEvidence;
  const proofAttempted = derivations.length * 4;
  const citationPassed =
    citations.factRefs -
    citations.danglingFactRefs +
    (citations.docRefs - citations.danglingDocRefs);
  const citationAttempted = citations.factRefs + citations.docRefs;

  const passed = factPassed + proofPassed + citationPassed;
  const attempted = factAttempted + proofAttempted + citationAttempted;
  const ratio = attempted === 0 ? 100 : Math.round((passed / attempted) * 100);

  const clean =
    problems.facts.length === 0 &&
    problems.proofs.length === 0 &&
    citations.danglingFactRefs === 0 &&
    citations.danglingDocRefs === 0;

  /*
   * A score of 100 must mean nothing failed.
   *
   * With thousands of individual assertions, one failure rounds to 100 and the
   * headline would claim perfection while a proof was broken. So the ratio is
   * capped below 100 whenever anything at all did not verify. The number is a
   * claim about correctness, and a claim about correctness has no tolerance.
   */
  const score = clean ? 100 : Math.min(99, ratio);

  return {
    facts: {
      total: graph.facts.length,
      anchored: facts.anchored,
      quoted: facts.quoted,
      resolvable: facts.resolvable,
    },
    derivations: {
      total: derivations.length,
      withProof: proofs.withProof,
      resolved: proofs.resolved,
      ordered: proofs.ordered,
      withEvidence: proofs.withEvidence,
    },
    citations,
    problems,
    clean,
    score,
  };
}

/** The one-line verdict, phrased so it cannot be read as a marketing claim. */
export function verificationHeadline(report: ProvenanceReport): string {
  if (report.facts.total === 0) return 'No facts to verify.';
  if (report.clean) {
    return `${report.facts.quoted} of ${report.facts.total} facts re-read from their source spans; ${report.derivations.ordered} of ${report.derivations.total} proofs ordered and resolved.`;
  }
  const badFacts = report.problems.facts.length;
  const badProofs = report.problems.proofs.length;
  return `${badFacts} fact${badFacts === 1 ? '' : 's'} and ${badProofs} proof${badProofs === 1 ? '' : 's'} did not verify.`;
}

/** The facts a report flagged, so the interface can list them. */
export function flaggedFacts(graph: HealthGraph, report: ProvenanceReport): Fact[] {
  const ids = new Set(report.problems.facts.map((problem) => problem.factId));
  return graph.facts.filter((fact) => ids.has(fact.id));
}
