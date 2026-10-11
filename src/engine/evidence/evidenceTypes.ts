import type { EvidenceSource, ExternalEvidence } from '../types';

/**
 * External evidence.
 *
 * This layer is deliberately quarantined from the personal graph and is the only
 * place in the product that contains general medical knowledge.
 *
 * Two rules were followed when writing it:
 *   1. Every link points at a source's own lookup page (each verified to
 *      resolve), so the reader always reaches primary material rather than our
 *      paraphrase of it.
 *   2. Summaries describe what a *class* or *test* is generally used for. They
 *      never say anything about this patient, and they never recommend action.
 */

const RETRIEVED = '2026-10-02';

function dailymed(drug: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(drug)}`;
}

function trials(condition: string): string {
  return `https://clinicaltrials.gov/search?cond=${encodeURIComponent(condition)}`;
}

const MEDLINEPLUS_LAB_TESTS = 'https://medlineplus.gov/lab-tests/';
const CDC_SCHEDULES = 'https://www.cdc.gov/vaccines/hcp/imz-schedules/index.html';

function drug(
  id: string,
  title: string,
  drugName: string,
  topics: string[],
  summary: string,
): ExternalEvidence {
  return {
    id,
    title: `${title} — FDA-approved labeling (DailyMed search)`,
    source: 'FDA label search' as EvidenceSource,
    url: dailymed(drugName),
    summary,
    topics,
    kind: 'drug',
    retrieved: RETRIEVED,
  };
}

function lab(id: string, title: string, topics: string[], summary: string): ExternalEvidence {
  return {
    id,
    title: `${title} — MedlinePlus medical test index`,
    source: 'MedlinePlus (NIH)',
    url: MEDLINEPLUS_LAB_TESTS,
    summary,
    topics,
    kind: 'lab',
    retrieved: RETRIEVED,
  };
}

function condition(
  id: string,
  title: string,
  conditionName: string,
  topics: string[],
  summary: string,
  topicUrl?: string,
): ExternalEvidence {
  return {
    id,
    title: topicUrl ? `${title} — MedlinePlus health topic` : `${title} — ClinicalTrials.gov`,
    source: topicUrl ? 'MedlinePlus (NIH)' : 'ClinicalTrials.gov',
    url: topicUrl ?? trials(conditionName),
    summary,
    topics,
    kind: topicUrl ? 'condition' : 'trial',
    retrieved: RETRIEVED,
  };
}

export const CDC_SCHEDULE_URL = CDC_SCHEDULES;
export { drug, lab, condition };
