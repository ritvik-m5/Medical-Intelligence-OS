import { cacheKey, readCache, writeCache } from './cache';
import type { TrialLookupState, TrialRecord } from './types';

interface StudyJson {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: { overallStatus?: string; lastUpdatePostDateStruct?: { date?: string } };
    designModule?: { phases?: string[]; studyType?: string };
    contactsLocationsModule?: {
      locations?: Array<{ city?: string; country?: string }>;
    };
  };
}

function reported(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase();
  if (upper === 'UNKNOWN' || upper === 'NA' || upper === 'N/A' || upper === 'NOT APPLICABLE') {
    return trimmed;
  }
  return trimmed;
}

function normalizeStudy(study: StudyJson, query: string, retrievedAt: string): TrialRecord | null {
  const ident = study.protocolSection?.identificationModule;
  const nctId = reported(ident?.nctId);
  const title = reported(ident?.briefTitle) ?? reported(ident?.officialTitle);
  if (!nctId || !title) return null;

  const status = reported(study.protocolSection?.statusModule?.overallStatus);
  const phases = (study.protocolSection?.designModule?.phases ?? [])
    .map((phase) => reported(phase))
    .filter((phase): phase is string => Boolean(phase));
  const studyType = reported(study.protocolSection?.designModule?.studyType);
  const lastUpdate = reported(study.protocolSection?.statusModule?.lastUpdatePostDateStruct?.date);
  const location = study.protocolSection?.contactsLocationsModule?.locations?.[0];
  const place = [reported(location?.city), reported(location?.country)].filter(Boolean).join(', ');

  return {
    nctId,
    title,
    status,
    phase: phases.length > 0 ? phases.join(', ') : undefined,
    studyType,
    location: place || undefined,
    lastUpdate,
    url: `https://clinicaltrials.gov/study/${nctId}`,
    source: 'ClinicalTrials.gov',
    retrievedAt,
    query,
  };
}

export function trialQueryFrom(entityKeys: string[], question: string): string | null {
  const fromKeys = entityKeys
    .map((key) => key.split(':').slice(1).join(' ').replace(/-/g, ' '))
    .filter((part) => part.length >= 3);
  if (fromKeys.length > 0) return fromKeys.slice(0, 3).join(' ');
  const trimmed = question.trim();
  return trimmed.length >= 3 ? trimmed : null;
}

export async function lookupTrials(
  query: string,
  options: { pageSize?: number; signal?: AbortSignal; now?: number; fetchImpl?: typeof fetch } = {},
): Promise<TrialLookupState> {
  const pageSize = options.pageSize ?? 8;
  const now = options.now ?? Date.now();
  const retrievedAt = new Date(now).toISOString();
  const key = cacheKey({
    source: 'clinicaltrials.gov',
    query,
    parameters: `pageSize=${pageSize}`,
  });

  const cached = readCache<TrialRecord[]>(key, now);
  if (cached && cached.cacheState === 'cached') {
    return cached.value.length === 0
      ? { kind: 'empty', query, retrievedAt, cacheState: 'cached' }
      : { kind: 'cached', query, retrievedAt, trials: cached.value, cacheState: 'cached' };
  }

  const url =
    `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}` +
    `&pageSize=${pageSize}` +
    `&fields=NCTId,BriefTitle,OfficialTitle,OverallStatus,Phase,StudyType,LastUpdatePostDate,LocationCity,LocationCountry`;

  const fetchFn = options.fetchImpl ?? fetch;
  try {
    const response = await fetchFn(url, { signal: options.signal });
    if (!response.ok) {
      if (cached) {
        return cached.value.length === 0
          ? { kind: 'empty', query, retrievedAt, cacheState: 'stale' }
          : { kind: 'cached', query, retrievedAt, trials: cached.value, cacheState: 'stale' };
      }
      return {
        kind: 'unavailable',
        query,
        reason: `ClinicalTrials.gov returned HTTP ${response.status}.`,
      };
    }
    const json = (await response.json()) as { studies?: StudyJson[] };
    const trials = (json.studies ?? [])
      .map((study) => normalizeStudy(study, query, retrievedAt))
      .filter((trial): trial is TrialRecord => trial !== null);
    writeCache(key, trials, now);
    if (trials.length === 0) return { kind: 'empty', query, retrievedAt, cacheState: 'live' };
    return { kind: 'live', query, retrievedAt, trials, cacheState: 'live' };
  } catch (error) {
    if (cached) {
      return cached.value.length === 0
        ? { kind: 'empty', query, retrievedAt, cacheState: cached.cacheState }
        : { kind: 'cached', query, retrievedAt, trials: cached.value, cacheState: cached.cacheState };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'unavailable', query, reason: `ClinicalTrials.gov could not be reached. ${message}` };
  }
}
