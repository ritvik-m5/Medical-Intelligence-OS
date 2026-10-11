export type {
  AuthorityType,
  CacheState,
  ClaimKind,
  EvidenceLink,
  ExternalEvidenceItem,
  ExternalSource,
  Freshness,
  MatchState,
  PersonalCounts,
  PersonalEvidenceItem,
  ResearchReceipt,
  ResearchResult,
  SourceStatus,
  SourceType,
  TrialLookupState,
  TrialRecord,
} from './types';
export { RESEARCH_CACHE_TTL_MS, RESEARCH_RETRIEVAL_VERSION } from './types';
export { bundledSources, categoryCounts, categorySumMatches, sourcesForEntities } from './registry';
export { collectPersonalEvidence, personalCounts, resolveEntityKeys } from './resolve';
export { linkEvidence, relateEvidence } from './match';
export { cacheKey, cacheStateOf, clearResearchCache, readCache, writeCache } from './cache';
export { lookupTrials, trialQueryFrom } from './trials';
export {
  researchFingerprint,
  researchReceipt,
  runResearch,
  verifyResearchResult,
  type ResearchInput,
} from './research';
