import type { Derivation } from '../engine/derive/types';
import { RULE_LABEL } from '../engine/derive/types';
import { verifyProvenance } from '../engine/verify';
import {
  toDocumentInput,
  toStoredDocument,
  type FindingSummary,
  type StoredRun,
} from '../engine/platform/registry';
import type { BranchOperation } from '../engine/platform/artifactStore';
import type { BuildArtifact, BuildRequest } from './types';

/* ------------------------------------------------------------------ */
/* Artifacts and stored runs                                           */
/*                                                                    */
/* The registry speaks engine types only, so it has no idea what a      */
/* BuildArtifact is. This module is the adapter, and it is deliberately */
/* thin: it converts, it does not decide.                               */
/* ------------------------------------------------------------------ */

/**
 * A cache of the findings, for listing runs without re-deriving them.
 *
 * Marked as a cache everywhere it appears. It is written from a real artifact
 * and checked against a fresh derivation when the run is opened, so a stale
 * cache is detected rather than believed.
 */
export function summarizeFindings(derivations: Derivation[]): FindingSummary[] {
  return derivations.map((entry) => ({
    id: entry.id,
    ruleId: entry.ruleId,
    title: entry.title,
    severity: entry.severity,
    confidence: entry.confidence,
  }));
}

export interface StoreRunOptions {
  /** What to call it. Defaults to the scenario label. */
  label?: string;
  /** The prompt that produced it. */
  prompt?: string;
  /** When it was created. Defaults to now, so tests can pin it. */
  createdAt?: string;
}

/**
 * Turn a live artifact into something that can be written down.
 *
 * The corpus is stored and the graph is not. That is the whole design: a saved
 * run is a claim about a corpus, and the graph is what gets recomputed to check
 * the claim.
 */
export function toStoredRun(artifact: BuildArtifact, options: StoreRunOptions = {}): StoredRun {
  const verification = verifyProvenance(artifact.graph, artifact.derivations);
  return {
    schema: 1,
    artifactId: artifact.identity.artifactId,
    identity: artifact.identity,
    createdAt: options.createdAt ?? new Date().toISOString(),
    label: options.label?.trim() || artifact.scenarioLabel,
    origin: { scenarioId: artifact.scenarioId, prompt: options.prompt ?? '' },
    patientId: artifact.patient.id,
    patientName: artifact.patient.name,
    documents: artifact.inputs.map(toStoredDocument),
    offset: artifact.offset,
    suppressedRules: artifact.suppressedRules,
    withheldDocuments: artifact.withheldDocuments,
    asOf: artifact.asOf,
    findings: summarizeFindings(artifact.derivations),
    verification: {
      score: verification.score,
      clean: verification.clean,
      factsQuoted: verification.facts.quoted,
      factsTotal: verification.facts.total,
      derivationsOrdered: verification.derivations.ordered,
      derivationsTotal: verification.derivations.total,
    },
    branch: artifact.branch ?? { parentId: null, operation: 'baseline', reason: null },
  };
}

/**
 * The request that would rebuild a stored run.
 *
 * Note what is *not* reconstructed: the scenario. A saved run is re-derived from
 * its documents, which are stored, rather than from a description that might now
 * match a different scenario. Re-running a saved run must not depend on the
 * keyword matcher agreeing a second time.
 */
export function requestFromRun(run: StoredRun): BuildRequest {
  return {
    prompt: run.origin.prompt,
    attachments: run.documents.map(toDocumentInput),
    suppressRules: run.suppressedRules,
    asOf: run.asOf,
  };
}


/* ------------------------------------------------------------------ */
/* Branches                                                            */
/* ------------------------------------------------------------------ */

export type BranchKind = 'withhold-rule' | 'evaluate-earlier' | 'add-document';

export interface BranchOption {
  kind: BranchKind;
  label: string;
  detail: string;
  /** False when the experiment cannot be run as stated. */
  available: boolean;
  reason?: string;
}

/**
 * What can honestly be branched from an artifact.
 *
 * Only experiments this build can actually execute appear here. "Run this under
 * engine 2.1" is not on the list: there is one engine in the binary, and offering
 * it would be a promise the code cannot keep. The version manifest records which
 * engine produced a run; it does not pretend to run a different one.
 */
export function branchOptions(artifact: BuildArtifact): BranchOption[] {
  const rules = firedRules(artifact);
  const earliest = artifact.graph.stats.spanStart;
  const current = artifact.asOf;
  const canMoveEarlier = earliest < current;

  return [
    {
      kind: 'withhold-rule',
      label: 'Withhold a rule',
      detail:
        rules.length > 0
          ? `${rules.length} rule${rules.length === 1 ? '' : 's'} fired on this record. Withholding one shows what it contributed.`
          : 'No rule fired on this record, so there is nothing to withhold.',
      available: rules.length > 0,
      reason:
        rules.length === 0
          ? 'A rule that produced no finding has no finding to remove.'
          : undefined,
    },
    {
      kind: 'evaluate-earlier',
      label: 'Evaluate at an earlier date',
      detail: `This run was evaluated as of ${current}. Moving that earlier removes anything the record did not yet support.`,
      available: canMoveEarlier,
      reason: canMoveEarlier
        ? undefined
        : 'The record spans a single date, so there is no earlier moment to evaluate at.',
    },
    {
      kind: 'add-document',
      label: 'Add a document',
      detail: 'Attach one more document to this corpus and see which findings change.',
      available: true,
    },
  ];
}

/** The rules that actually produced something, for the withholding picker. */
export function firedRules(
  artifact: BuildArtifact,
): Array<{ id: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of artifact.derivations) {
    counts.set(entry.ruleId, (counts.get(entry.ruleId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({
      id,
      count,
      label: RULE_LABEL[id as keyof typeof RULE_LABEL] ?? id,
    }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * The request for a branch: the parent's inputs, with one thing changed.
 *
 * Every branch records its parent, so lineage survives being saved and reloaded
 * rather than being a fact about the current session.
 */
export function branchRequest(
  parent: BuildArtifact,
  change: {
    operation: BranchOperation;
    suppressRules?: string[];
    withholdDocuments?: string[];
    asOf?: string;
    attachments?: BuildArtifact['inputs'];
    reason: string;
  },
): BuildRequest {
  return {
    prompt: parent.scenarioLabel,
    attachments: change.attachments ?? parent.inputs,
    suppressRules: change.suppressRules ?? parent.suppressedRules,
    withholdDocuments: change.withholdDocuments ?? parent.withheldDocuments,
    asOf: change.asOf ?? parent.asOf,
    branch: { parentId: parent.identity.artifactId, operation: change.operation, reason: change.reason },
  };
}

/** A one-line description of what a branch changed, for the lineage strip. */
export function branchReason(parent: StoredRun | BuildArtifact, child: StoredRun | BuildArtifact): string {
  if (child.branch?.reason) return child.branch.reason;
  return `branch of ${parent.identity.id}`;
}
