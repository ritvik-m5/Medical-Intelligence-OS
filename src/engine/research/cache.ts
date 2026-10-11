import { RESEARCH_CACHE_TTL_MS, RESEARCH_RETRIEVAL_VERSION } from './types';

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
  key: string;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheKey(parts: {
  source: string;
  query: string;
  parameters: string;
  retrievalVersion?: number;
}): string {
  const version = parts.retrievalVersion ?? RESEARCH_RETRIEVAL_VERSION;
  return [parts.source, parts.query.trim().toLowerCase(), parts.parameters, String(version)].join(
    '\u0001',
  );
}

export function cacheStateOf(storedAt: number, now = Date.now()): 'cached' | 'stale' {
  if (now - storedAt >= RESEARCH_CACHE_TTL_MS) return 'stale';
  return 'cached';
}

export function readCache<T>(
  key: string,
  now = Date.now(),
): { value: T; cacheState: 'cached' | 'stale' } | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  return { value: entry.value, cacheState: cacheStateOf(entry.storedAt, now) };
}

export function writeCache<T>(key: string, value: T, now = Date.now()): void {
  store.set(key, { value, storedAt: now, key });
}

export function clearResearchCache(): void {
  store.clear();
}
