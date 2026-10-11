import type { ExternalEvidence } from '../types';
import { DRUG_EVIDENCE } from './drugEvidence';
import { DRUG_EVIDENCE_2 } from './drugEvidence2';
import { LAB_EVIDENCE } from './labEvidence';
import { CONDITION_EVIDENCE } from './conditionEvidence';
import { GUIDELINE_EVIDENCE } from './guidelineEvidence';

export { CDC_SCHEDULE_URL } from './evidenceTypes';

/** Every external evidence item the product ships with. */
export const ALL_EVIDENCE: ExternalEvidence[] = [
  ...DRUG_EVIDENCE,
  ...DRUG_EVIDENCE_2,
  ...LAB_EVIDENCE,
  ...CONDITION_EVIDENCE,
  ...GUIDELINE_EVIDENCE,
];

const BY_TOPIC: Map<string, ExternalEvidence[]> = (() => {
  const map = new Map<string, ExternalEvidence[]>();
  for (const item of ALL_EVIDENCE) {
    for (const topic of item.topics) {
      const list = map.get(topic);
      if (list) list.push(item);
      else map.set(topic, [item]);
    }
  }
  return map;
})();

/** Evidence relevant to one entity key. */
export function evidenceForEntity(entityKey: string): ExternalEvidence[] {
  return BY_TOPIC.get(entityKey) ?? [];
}

/** Evidence relevant to any of several entity keys, de-duplicated. */
export function evidenceForEntities(entityKeys: string[]): ExternalEvidence[] {
  const seen = new Set<string>();
  const out: ExternalEvidence[] = [];
  for (const key of entityKeys) {
    for (const item of evidenceForEntity(key)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

export interface TrialHit {
  nctId: string;
  title: string;
  status: string;
  phase: string;
  url: string;
}

/**
 * Live ClinicalTrials.gov lookup (API v2).
 *
 * Research Mode only. It is intentionally fail-soft: if the network is
 * unavailable the UI says so rather than pretending the registry returned
 * nothing, because "no trials found" and "could not ask" are different answers.
 */
export async function searchClinicalTrials(
  condition: string,
  pageSize = 5,
  signal?: AbortSignal,
): Promise<{ hits: TrialHit[]; error?: string }> {
  const url =
    `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(condition)}` +
    `&pageSize=${pageSize}&fields=NCTId,BriefTitle,OverallStatus,Phase`;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return { hits: [], error: `ClinicalTrials.gov returned HTTP ${response.status}.` };
    const json = (await response.json()) as {
      studies?: Array<{
        protocolSection?: {
          identificationModule?: { nctId?: string; briefTitle?: string };
          statusModule?: { overallStatus?: string };
          designModule?: { phases?: string[] };
        };
      }>;
    };
    const hits = (json.studies ?? []).map((study) => {
      const p = study.protocolSection;
      const nctId = p?.identificationModule?.nctId ?? 'unknown';
      return {
        nctId,
        title: p?.identificationModule?.briefTitle ?? 'Untitled study',
        status: p?.statusModule?.overallStatus ?? 'unknown',
        phase: (p?.designModule?.phases ?? []).join(', ') || 'not specified',
        url: `https://clinicaltrials.gov/study/${nctId}`,
      };
    });
    return { hits };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { hits: [], error: `Could not reach ClinicalTrials.gov: ${message}` };
  }
}

/** The standing disclaimer attached to every external-evidence surface. */
export const EXTERNAL_EVIDENCE_NOTE =
  'External evidence describes general medical knowledge from public sources. It is not about you, it is not a diagnosis, and it is not a treatment recommendation. It is shown separately from your records on purpose.';
