import type { AIContext } from '../../ai/context';
import type { ISODate } from '../types';

export type SourceType =
  | 'official_labeling'
  | 'government_public_health'
  | 'medical_reference'
  | 'guideline'
  | 'clinical_trial_registry'
  | 'secondary_reference';

export type AuthorityType =
  | 'official_label'
  | 'public_health_agency'
  | 'reference_encyclopedia'
  | 'trial_registry'
  | 'professional_society'
  | 'unverified';

export type SourceStatus =
  | 'available'
  | 'unavailable'
  | 'unverified'
  | 'superseded'
  | 'malformed'
  | 'not_applicable'
  | 'not_found';

export type Freshness = 'current' | 'superseded' | 'unknown';
export type CacheState = 'live' | 'cached' | 'stale';
export type ClaimKind = 'source_metadata' | 'source_derived_summary' | 'model_explanation';

export type MatchState =
  | 'supports'
  | 'contextualizes'
  | 'differs'
  | 'not_directly_comparable'
  | 'no_documented_relationship';

export interface ExternalSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  sourceType: SourceType;
  authorityType: AuthorityType;
  publishedAt?: ISODate;
  retrievedAt: ISODate;
  version?: string;
  query: string;
  entityIds: string[];
  checksum: string;
  status: SourceStatus;
  /** Stored with the source. Never generated at display time. */
  verifiedContent?: string;
  freshness: Freshness;
}

export interface PersonalEvidenceItem {
  kind: 'fact' | 'derivation' | 'interval' | 'question' | 'contradiction';
  id: string;
  statement: string;
  asOf: ISODate;
  factIds: string[];
  docIds: string[];
  entityKeys: string[];
}

export interface ExternalEvidenceItem {
  sourceId: string;
  claim: string;
  claimKind: ClaimKind;
  url: string;
  retrievedAt: ISODate;
  publishedAt?: ISODate;
  version?: string;
  freshness: Freshness;
  cacheState: CacheState;
}

export interface EvidenceLink {
  personalId: string;
  externalSourceId: string;
  state: MatchState;
  because: string;
}

export interface TrialRecord {
  nctId: string;
  title: string;
  status?: string;
  phase?: string;
  studyType?: string;
  location?: string;
  lastUpdate?: string;
  url: string;
  source: 'ClinicalTrials.gov';
  retrievedAt: string;
  query: string;
}

export type TrialLookupState =
  | { kind: 'not_queried' }
  | { kind: 'loading'; query: string }
  | { kind: 'live'; query: string; retrievedAt: string; trials: TrialRecord[]; cacheState: 'live' }
  | { kind: 'cached'; query: string; retrievedAt: string; trials: TrialRecord[]; cacheState: 'cached' | 'stale' }
  | { kind: 'unavailable'; query: string; reason: string }
  | { kind: 'empty'; query: string; retrievedAt: string; cacheState: 'live' | 'cached' | 'stale' };

export interface PersonalCounts {
  documents: number;
  facts: number;
  concepts: number;
  intervals: number;
  findings: number;
  questions: number;
  edges: number;
  quality: number;
}

export interface ResearchResult {
  question: string;
  context: AIContext | null;
  asOf: ISODate;
  artifactId: string;
  entityKeys: string[];
  personalCounts: PersonalCounts;
  personalEvidence: PersonalEvidenceItem[];
  externalEvidence: ExternalEvidenceItem[];
  trials: TrialLookupState;
  links: EvidenceLink[];
  retrievedAt: string;
  limitations: string[];
  conflicts: string[];
  sources: ExternalSource[];
}

export interface ResearchReceipt {
  question: string;
  context: string | null;
  artifactId: string;
  asOf: ISODate;
  sourcesQueried: string[];
  sourcesUsed: string[];
  retrievedAt: string;
  limitations: string[];
  modelUsed: 'none' | string;
}

export const RESEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const RESEARCH_RETRIEVAL_VERSION = 1;
