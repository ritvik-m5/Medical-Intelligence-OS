import type { AIContext } from '../../ai/context';
import type { Derivation, QualityReport } from '../derive/types';
import { sha256 } from '../hash';
import type { Contradiction, HealthGraph, ISODate, Snapshot } from '../types';
import type { RecordQuestion } from '../questions';
import { linkEvidence } from './match';
import { categoryCounts, categorySumMatches, sourcesForEntities } from './registry';
import { collectPersonalEvidence, personalCounts, resolveEntityKeys } from './resolve';
import { lookupTrials, trialQueryFrom } from './trials';
import type {
  ExternalEvidenceItem,
  ExternalSource,
  ResearchReceipt,
  ResearchResult,
  TrialLookupState,
} from './types';

export interface ResearchInput {
  question: string;
  context: AIContext | null;
  graph: HealthGraph;
  snapshot: Snapshot;
  asOf: ISODate;
  artifactId: string;
  derivations: Derivation[];
  questions: RecordQuestion[];
  contradictions: Contradiction[];
  quality: QualityReport;
  now?: number;
  fetchImpl?: typeof fetch;
}

function sourcesToEvidence(sources: ExternalSource[], _retrievedAt: ISODate): ExternalEvidenceItem[] {
  return sources.map((source) => ({
    sourceId: source.id,
    claim: source.verifiedContent ?? source.title,
    claimKind: source.verifiedContent ? 'source_derived_summary' : 'source_metadata',
    url: source.url,
    retrievedAt: source.retrievedAt,
    publishedAt: source.publishedAt,
    version: source.version,
    freshness: source.freshness,
    cacheState: 'cached',
  }));
}

export async function runResearch(input: ResearchInput): Promise<ResearchResult> {
  const now = input.now ?? Date.now();
  const retrievedAt = new Date(now).toISOString();
  const question = input.question.trim();
  const counts = personalCounts({
    snapshot: input.snapshot,
    graph: input.graph,
    asOf: input.asOf,
    derivations: input.derivations,
    questions: input.questions.length,
    quality: input.quality.overall,
  });

  const resolved = resolveEntityKeys(input.graph, question, input.context, input.derivations);
  const limitations: string[] = [];
  const conflicts: string[] = [];

  if (!question && !input.context) {
    limitations.push('No research question was asked, and no object was selected.');
  }
  if (input.context && !resolved.contextValid) {
    limitations.push(`The selected context is no longer in this artifact: ${resolved.contextReason}.`);
  }
  if (question && resolved.keys.length === 0) {
    limitations.push('The question did not resolve to a documented concept in this record as of this date.');
  }

  const personalEvidence = collectPersonalEvidence({
    graph: input.graph,
    asOf: input.asOf,
    snapshot: input.snapshot,
    derivations: input.derivations,
    questions: input.questions,
    contradictions: input.contradictions,
    entityKeys: resolved.keys,
  });

  const sources = sourcesForEntities(resolved.keys);
  if (!categorySumMatches(sources)) {
    throw new Error('Research source categories do not sum to the source list.');
  }

  const externalEvidence = sourcesToEvidence(sources, retrievedAt.slice(0, 10));
  const links = linkEvidence(personalEvidence, sources);

  if (personalEvidence.length === 0 && resolved.keys.length > 0) {
    limitations.push('The record cannot establish a statement about this subject as of this date.');
  }
  if (sources.length === 0 && resolved.keys.length > 0) {
    limitations.push('No verified external source in the registry is about the resolved concepts.');
  }
  for (const item of personalEvidence.filter((entry) => entry.kind === 'contradiction')) {
    conflicts.push(item.statement);
  }

  let trials: TrialLookupState = { kind: 'not_queried' };
  const trialQuery = trialQueryFrom(resolved.keys, question);
  if (trialQuery) {
    trials = await lookupTrials(trialQuery, { now, fetchImpl: input.fetchImpl });
    if (trials.kind === 'unavailable') {
      limitations.push('ClinicalTrials.gov could not be reached.');
    }
  } else if (question) {
    limitations.push('No ClinicalTrials.gov query was generated: the question did not name a searchable concept.');
  }

  for (const source of sources) {
    if (source.freshness === 'unknown') {
      limitations.push(`Freshness not verified for ${source.id}.`);
    }
  }

  return {
    question,
    context: resolved.contextValid ? input.context : null,
    asOf: input.asOf,
    artifactId: input.artifactId,
    entityKeys: resolved.keys,
    personalCounts: counts,
    personalEvidence,
    externalEvidence,
    trials,
    links,
    retrievedAt,
    limitations: [...new Set(limitations)].sort(),
    conflicts: [...new Set(conflicts)].sort(),
    sources,
  };
}

export function researchReceipt(result: ResearchResult, modelUsed: 'none' | string = 'none'): ResearchReceipt {
  const sourcesQueried = ['bundled-registry'];
  if (result.trials.kind !== 'not_queried') sourcesQueried.push('ClinicalTrials.gov');
  return {
    question: result.question,
    context: result.context ? `${result.context.kind}:${result.context.id}` : null,
    artifactId: result.artifactId,
    asOf: result.asOf,
    sourcesQueried,
    sourcesUsed: result.sources.map((source) => source.id).sort(),
    retrievedAt: result.retrievedAt,
    limitations: result.limitations,
    modelUsed,
  };
}

export function researchFingerprint(result: ResearchResult): string {
  return sha256(
    JSON.stringify({
      question: result.question,
      context: result.context?.id ?? null,
      asOf: result.asOf,
      artifactId: result.artifactId,
      entityKeys: result.entityKeys,
      personalCounts: result.personalCounts,
      personalIds: result.personalEvidence.map((item) => item.id),
      sourceIds: result.sources.map((source) => source.id),
      checksums: result.sources.map((source) => source.checksum),
      links: result.links,
      limitations: result.limitations,
      conflicts: result.conflicts,
      trialKind: result.trials.kind,
      trialQuery: 'query' in result.trials ? result.trials.query : null,
      trialIds:
        result.trials.kind === 'live' || result.trials.kind === 'cached'
          ? result.trials.trials.map((trial) => trial.nctId)
          : [],
    }),
  );
}

export function verifyResearchResult(result: ResearchResult, input: ResearchInput): string[] {
  const errors: string[] = [];
  const expected = personalCounts({
    snapshot: input.snapshot,
    graph: input.graph,
    asOf: input.asOf,
    derivations: input.derivations,
    questions: input.questions.length,
    quality: input.quality.overall,
  });
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (result.personalCounts[key] !== expected[key]) {
      errors.push(`${key} is ${result.personalCounts[key]}, artifact has ${expected[key]}`);
    }
  }
  if (result.asOf !== input.asOf) errors.push('asOf does not match the research input');
  if (result.artifactId !== input.artifactId) errors.push('artifactId does not match the research input');

  const used = new Set(result.entityKeys);
  for (const source of result.sources) {
    if (!source.entityIds.some((id) => used.has(id))) {
      errors.push(`unrelated source ${source.id}`);
    }
  }
  if (!categorySumMatches(result.sources)) errors.push('category counts do not sum to sources');
  const counts = categoryCounts(result.sources);
  const sum = Object.values(counts).reduce((n, value) => n + value, 0);
  if (sum !== result.sources.length) errors.push('sum(categoryCounts) !== sources.length');

  for (const item of result.personalEvidence) {
    if (item.asOf !== result.asOf) errors.push(`personal item ${item.id} is not evaluated as of ${result.asOf}`);
  }

  if (
    (result.trials.kind === 'live' || result.trials.kind === 'cached' || result.trials.kind === 'empty') &&
    result.trials.cacheState === 'live' &&
    result.limitations.some((line) => line.includes('could not be reached'))
  ) {
    errors.push('a live trial result cannot also claim the registry was unreachable');
  }

  return errors;
}

export { categoryCounts, categorySumMatches };
