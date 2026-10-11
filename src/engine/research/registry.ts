import { ALL_EVIDENCE } from '../evidence';
import { sha256 } from '../hash';
import type { EvidenceSource, ExternalEvidence } from '../types';
import type { AuthorityType, ExternalSource, SourceType } from './types';

function classify(source: EvidenceSource, kind: ExternalEvidence['kind']): {
  sourceType: SourceType;
  authorityType: AuthorityType;
} {
  if (source === 'FDA label search') {
    return { sourceType: 'official_labeling', authorityType: 'official_label' };
  }
  if (source === 'CDC') {
    return { sourceType: 'government_public_health', authorityType: 'public_health_agency' };
  }
  if (source === 'ClinicalTrials.gov') {
    return { sourceType: 'clinical_trial_registry', authorityType: 'trial_registry' };
  }
  if (source === 'USPSTF' || source === 'Professional guideline' || kind === 'guideline') {
    return { sourceType: 'guideline', authorityType: 'professional_society' };
  }
  if (source === 'MedlinePlus (NIH)' || source === 'NIH / NCBI') {
    return { sourceType: 'medical_reference', authorityType: 'reference_encyclopedia' };
  }
  return { sourceType: 'secondary_reference', authorityType: 'unverified' };
}

function queryOf(item: ExternalEvidence): string {
  try {
    const url = new URL(item.url);
    return url.searchParams.get('query') ?? url.searchParams.get('cond') ?? item.title;
  } catch {
    return item.title;
  }
}

/** The bundled catalog, as a registry. Nothing is added. Nothing is retrieved here. */
export function bundledSources(): ExternalSource[] {
  return ALL_EVIDENCE.map((item) => {
    const { sourceType, authorityType } = classify(item.source, item.kind);
    const checksum = sha256(
      [item.id, item.url, item.summary, item.retrieved, item.topics.join(',')].join('\u0001'),
    );
    return {
      id: item.id,
      publisher: item.source,
      title: item.title,
      url: item.url,
      sourceType,
      authorityType,
      retrievedAt: item.retrieved,
      query: queryOf(item),
      entityIds: [...item.topics].sort(),
      checksum,
      status: 'available' as const,
      verifiedContent: item.summary,
      freshness: 'unknown' as const,
    };
  });
}

export function sourcesForEntities(entityKeys: string[], catalog = bundledSources()): ExternalSource[] {
  if (entityKeys.length === 0) return [];
  const wanted = new Set(entityKeys);
  return catalog.filter((source) => source.entityIds.some((id) => wanted.has(id)));
}

export function categoryCounts(sources: ExternalSource[]): Record<SourceType, number> {
  const counts: Record<SourceType, number> = {
    official_labeling: 0,
    government_public_health: 0,
    medical_reference: 0,
    guideline: 0,
    clinical_trial_registry: 0,
    secondary_reference: 0,
  };
  for (const source of sources) counts[source.sourceType] += 1;
  return counts;
}

/** Mutually exclusive categories must add up to the source list. */
export function categorySumMatches(sources: ExternalSource[]): boolean {
  const counts = categoryCounts(sources);
  return Object.values(counts).reduce((sum, n) => sum + n, 0) === sources.length;
}
