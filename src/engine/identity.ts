import type { Derivation } from './derive/types';
import type { HealthGraph } from './types';
import type { DocumentInput } from './ingest';
import { RULE_REGISTRY } from './derive/engine';

/* ------------------------------------------------------------------ */
/* Artifact identity                                                   */
/*                                                                    */
/* A build produces a result. This module gives that result a name,    */
/* computed from the three things that determine it: the corpus it     */
/* read, the engine that read it, and the rule set that reasoned over  */
/* it.                                                                */
/*                                                                    */
/* Two claims follow, and they are different claims:                    */
/*                                                                    */
/*   verifiable    every fact re-reads from its own span (verify.ts)    */
/*   reproducible  the same inputs and the same engine give the same    */
/*                 result, bit for bit (this module)                    */
/*                                                                    */
/* The second is what makes a finding quotable a year later.            */
/* ------------------------------------------------------------------ */

import { ENGINE_VERSION } from './versions';
import { sha256, shortHash } from './hash';

/**
 * Bumped whenever engine behaviour changes in a way that could alter a result.
 *
 * Declared in `versions.ts` rather than here: the number is the head of a dated
 * history, so a stored artifact can be told not just which engine produced it but
 * what that engine was and what changed since.
 */
export { ENGINE_VERSION };

/** The shape of the identity record itself. */
export const IDENTITY_SCHEMA = 1;

/**
 * FNV-1a, 32-bit, rendered as eight hex characters.
 *
 * Retained as `hashString` for callers that want a short stable label. Identity
 * uses SHA-256 instead: at 32 bits a collision between two different corpora is
 * a real possibility, and an identity that can collide is not an identity.
 */
export function hashString(text: string): string {
  return shortHash(text);
}

/** Field separator unlikely to appear in document text. */
const UNIT = '\u0001';
const RECORD = '\u0000';

/**
 * A hash of the corpus.
 *
 * Order-independent, because importing the same documents in a different order
 * is the same record. Every field that changes what the engine reads is
 * included; nothing derived is.
 */
export function corpusHash(documents: Array<DocumentInput | CorpusRow>): string {
  const rows = documents
    .map((doc) =>
      [doc.date ?? '', doc.kind, doc.title, doc.text].join(UNIT),
    )
    .sort();
  return sha256(rows.join(RECORD));
}

interface CorpusRow {
  date?: string;
  kind: string;
  title: string;
  text: string;
}

/**
 * A hash of the rule set: the rule ids, in registry order.
 *
 * Order is included deliberately. Rules run in registry order and outputs are
 * ranked deterministically, so a reordering is a change to the result even if
 * the same rules are present.
 *
 * The ids may be a subset. A run that withholds a rule is reasoning with a
 * different rule set, and if that were not reflected here two runs with
 * different rule sets would claim the same version — which is exactly the
 * confusion the version exists to prevent.
 */
export function rulesetHash(ruleIds?: string[]): string {
  const entries = ruleIds
    ? RULE_REGISTRY.filter((entry) => ruleIds.includes(entry.id))
    : RULE_REGISTRY;
  return sha256(entries.map((entry) => `${entry.id}:${entry.category}`).join(UNIT));
}

/**
 * A hash of what the engine produced.
 *
 * Over the derivation ids, their rule, severity and confidence, plus the graph's
 * shape. Two runs that agree here agree on every finding the platform is
 * capable of showing.
 */
export function resultFingerprint(graph: HealthGraph, derivations: Derivation[]): string {
  const parts = [
    `docs:${graph.documents.length}`,
    `facts:${graph.facts.length}`,
    `entities:${graph.entities.length}`,
    `edges:${graph.edges.length}`,
    ...graph.facts.map((fact) => fact.id).sort(),
    ...derivations.map(
      (derivation) =>
        `${derivation.id}${UNIT}${derivation.ruleId}${UNIT}${derivation.severity}${UNIT}${derivation.confidence.toFixed(4)}`,
    ),
  ];
  return sha256(parts.join(RECORD));
}

export interface DerivationDelta {
  id: string;
  ruleId: string;
  title: string;
  detail: string;
}

export interface ReproductionReport {
  /**
   * `identical`     same corpus, engine, rule set and result
   * `changed`       reproducible, but something differs — and it says what
   * `incompatible`  a different engine or identity schema; a migration is
   *                 required rather than a silent re-derivation
   */
  status: 'identical' | 'changed' | 'incompatible';
  corpus: 'match' | 'different';
  engine: 'match' | 'different';
  ruleset: 'match' | 'different';
  result: 'match' | 'different';
  expected: ArtifactIdentity;
  actual: ArtifactIdentity;
  /** Findings the reproduction produced that the original did not. */
  added: DerivationDelta[];
  /** Findings the original had that the reproduction did not. */
  removed: DerivationDelta[];
  /** Findings present in both whose rule, severity or confidence moved. */
  altered: DerivationDelta[];
  notes: string[];
}

function delta(derivation: Derivation, detail: string): DerivationDelta {
  return {
    id: derivation.id,
    ruleId: derivation.ruleId,
    title: derivation.title,
    detail,
  };
}

/**
 * Compare a reproduction against the artifact it was asked to reproduce.
 *
 * The report is deliberately specific. "The result differs" is not useful; "rule
 * gap.monitoring_absent produced one fewer finding, and these three findings have
 * different confidences" is.
 */
export function compareIdentities(
  expected: ArtifactIdentity,
  actual: ArtifactIdentity,
  expectedDerivations: Derivation[],
  actualDerivations: Derivation[],
): ReproductionReport {
  const notes: string[] = [];

  const corpus = expected.corpusHash === actual.corpusHash ? 'match' : 'different';
  const engine = expected.engineVersion === actual.engineVersion ? 'match' : 'different';
  const ruleset = expected.rulesetVersion === actual.rulesetVersion ? 'match' : 'different';
  const result = expected.resultHash === actual.resultHash ? 'match' : 'different';

  if (corpus === 'different') {
    notes.push(
      'The corpus is not the one this artifact was built from, so the comparison is between two different records rather than a reproduction.',
    );
  }
  if (engine === 'different') {
    notes.push(
      `The artifact was produced by engine ${expected.engineVersion}; this build is ${actual.engineVersion}. Engine behaviour may have changed, so a difference here is expected rather than a fault.`,
    );
  }
  if (ruleset === 'different') {
    notes.push(
      'The rule registry has changed. A rule added, removed or reordered can change which findings exist without any change to the record.',
    );
  }
  if (expected.identitySchema !== actual.identitySchema) {
    notes.push(
      `The identity record is schema ${expected.identitySchema}; this build writes ${actual.identitySchema}.`,
    );
  }

  const byId = new Map(actualDerivations.map((derivation) => [derivation.id, derivation]));
  const expectedById = new Map(expectedDerivations.map((derivation) => [derivation.id, derivation]));

  const added: DerivationDelta[] = [];
  const removed: DerivationDelta[] = [];
  const altered: DerivationDelta[] = [];

  for (const derivation of actualDerivations) {
    const before = expectedById.get(derivation.id);
    if (!before) {
      added.push(delta(derivation, `Produced now by ${derivation.ruleId}, and not before.`));
      continue;
    }
    const moves: string[] = [];
    if (before.severity !== derivation.severity) {
      moves.push(`severity ${before.severity} → ${derivation.severity}`);
    }
    if (Math.abs(before.confidence - derivation.confidence) > 1e-6) {
      moves.push(`confidence ${before.confidence.toFixed(4)} → ${derivation.confidence.toFixed(4)}`);
    }
    if (before.ruleId !== derivation.ruleId) {
      moves.push(`rule ${before.ruleId} → ${derivation.ruleId}`);
    }
    if (moves.length > 0) altered.push(delta(derivation, moves.join(', ')));
  }

  for (const derivation of expectedDerivations) {
    if (!byId.has(derivation.id)) {
      removed.push(delta(derivation, `Was produced by ${derivation.ruleId}, and is not now.`));
    }
  }

  const incompatible = engine === 'different' || expected.identitySchema !== actual.identitySchema;
  const status = incompatible
    ? 'incompatible'
    : corpus === 'match' && ruleset === 'match' && result === 'match' && added.length === 0 && removed.length === 0 && altered.length === 0
      ? 'identical'
      : 'changed';

  if (status === 'identical') {
    notes.push('Every finding, its rule, its severity and its confidence are unchanged.');
  }

  return {
    status,
    corpus,
    engine,
    ruleset,
    result,
    expected,
    actual,
    added,
    removed,
    altered,
    notes,
  };
}

/** A one-line summary, for a pill or a heading. */
export function reproductionHeadline(report: ReproductionReport): string {
  if (report.status === 'identical') {
    return `Reproduced ${report.actual.id} exactly: ${report.actual.derivations} findings, all unchanged.`;
  }
  if (report.status === 'incompatible') {
    return `Cannot reproduce ${report.expected.id}: it was produced by engine ${report.expected.engineVersion} and this build is ${report.actual.engineVersion}.`;
  }
  const parts: string[] = [];
  if (report.added.length > 0) parts.push(`${report.added.length} added`);
  if (report.removed.length > 0) parts.push(`${report.removed.length} removed`);
  if (report.altered.length > 0) parts.push(`${report.altered.length} altered`);
  return `${report.actual.id} differs from ${report.expected.id}: ${parts.join(', ') || 'inputs differ'}.`;
}

export interface ArtifactIdentity {
  /**
   * The content address. SHA-256 over the corpus hash, the effective rule set
   * hash, the engine version and the result hash — so the name *is* the claim.
   *
   * Two identical corpora, under an identical engine and an identical effective
   * rule set, produce the same address. Nothing else does.
   */
  artifactId: string;
  /** The short, quotable name for display. `MM-XXXXXXXX-XXXXXXXX`. */
  id: string;
  corpusHash: string;
  resultHash: string;
  engineVersion: string;
  rulesetVersion: string;
  identitySchema: number;
  ruleCount: number;
  documents: number;
  facts: number;
  entities: number;
  derivations: number;
}

export interface IdentityInput {
  graph: HealthGraph;
  derivations: Derivation[];
  documents: Array<DocumentInput | CorpusRow>;
  /**
   * The rule ids this run reasoned with.
   *
   * Omitted means the whole registry. A run that withheld rules passes the
   * effective set, so its rule set version differs from a full run over the same
   * record — which is what makes a rule-ablation branch legible.
   */
  ruleIds?: string[];
}

/**
 * The content address of a result.
 *
 * Over all four determinants, so it changes if and only if one of them changes.
 * The separator is included so that two adjacent fields cannot be confused for a
 * different pair of fields.
 */
export function contentAddress(parts: {
  corpusHash: string;
  rulesetVersion: string;
  engineVersion: string;
  resultHash: string;
}): string {
  return sha256(
    [
      `corpus${UNIT}${parts.corpusHash}`,
      `rules${UNIT}${parts.rulesetVersion}`,
      `engine${UNIT}${parts.engineVersion}`,
      `result${UNIT}${parts.resultHash}`,
    ].join(RECORD),
  );
}

/**
 * Name a result.
 *
 * The identity carries two names, and they answer different questions:
 *
 *   artifactId  the content address. Equal exactly when the corpus, the engine,
 *               the effective rule set and the result are all equal.
 *   id          `MM-XXXXXXXX-XXXXXXXX`, short enough to quote aloud. Derived from
 *               the same material at 32 bits, so it is a label rather than an
 *               identity — collisions are possible and nothing depends on it.
 *
 * Both are computed from the same inputs, so neither can drift from the other.
 */
export function artifactIdentity(input: IdentityInput): ArtifactIdentity {
  const corpus = corpusHash(input.documents);
  const result = resultFingerprint(input.graph, input.derivations);
  const rules = input.ruleIds
    ? RULE_REGISTRY.filter((entry) => input.ruleIds!.includes(entry.id))
    : RULE_REGISTRY;
  const rulesetVersion = rulesetHash(input.ruleIds);
  const artifactId = contentAddress({
    corpusHash: corpus,
    rulesetVersion,
    engineVersion: ENGINE_VERSION,
    resultHash: result,
  });

  return {
    artifactId,
    id: `MM-${shortHash(corpus).slice(0, 4).toUpperCase()}-${shortHash(result)
      .slice(0, 4)
      .toUpperCase()}`,
    corpusHash: corpus,
    resultHash: result,
    engineVersion: ENGINE_VERSION,
    rulesetVersion,
    identitySchema: IDENTITY_SCHEMA,
    ruleCount: rules.length,
    documents: input.graph.documents.length,
    facts: input.graph.facts.length,
    entities: input.graph.entities.length,
    derivations: input.derivations.length,
  };
}
