import type { Scenario } from './types';
import type { DocumentInput } from '../engine/ingest';

import type { RuleRegistryEntry } from '../engine/derive/engine';
import { RULE_REGISTRY } from '../engine/derive/engine';

/* ------------------------------------------------------------------ */
/* Rule counts                                                         */
/*                                                                    */
/* Read from the registry rather than written into the copy. A hard-   */
/* coded number in prose is a number that will eventually be wrong.     */
/* ------------------------------------------------------------------ */

export const RULE_COUNT = RULE_REGISTRY.length;

export const RULE_CATEGORY_COUNT = new Set(
  (RULE_REGISTRY as RuleRegistryEntry[]).map((entry) => entry.category),
).size;

/** "14 rules across 5 categories" */
export const RULE_SUMMARY = `${RULE_COUNT} rules across ${RULE_CATEGORY_COUNT} categories`;

/* ------------------------------------------------------------------ */
/* The scenario library                                                */
/*                                                                    */
/* Every scenario is a real subset of the synthetic corpus that ships   */
/* with the product. Nothing is mocked: choosing a scenario changes the */
/* documents that are genuinely ingested, and therefore changes every   */
/* number the preview reports.                                          */
/* ------------------------------------------------------------------ */

const isMedicationDocument = (doc: DocumentInput) =>
  doc.kind === 'medication_list' || doc.kind === 'discharge_summary' || doc.kind === 'visit_note';

const isLabOrNote = (doc: DocumentInput) =>
  doc.kind === 'lab_report' || doc.kind === 'visit_note' || doc.kind === 'discharge_summary';

const isMeasureHeavy = (doc: DocumentInput) =>
  doc.kind === 'lab_report' || doc.kind === 'wearable_summary' || doc.kind === 'visit_note';

export const SCENARIOS: Scenario[] = [
  {
    id: 'longitudinal',
    label: 'Full longitudinal record',
    prompt: 'Reconstruct a four-year medical history with every source document linked',
    keywords: [
      'history', 'longitudinal', 'record', 'timeline', 'everything', 'reconstruct',
      'four', 'years', 'patient',
    ],
    source: 'primary',
    focus: 'timeline',
    blurb: '18 documents from 2022 to 2026, every extracted fact traceable to a character span.',
    headline: 'A four-year record, reconstructed from source',
  },
  {
    id: 'medication-audit',
    label: 'Medication reconciliation audit',
    prompt: 'Audit my medication list for anything that contradicts an earlier document',
    keywords: [
      'medication', 'medications', 'meds', 'drug', 'prescription', 'reconcil', 'audit',
      'contradict', 'duplicate', 'list', 'statin',
    ],
    source: 'primary',
    include: isMedicationDocument,
    focus: 'findings',
    blurb:
      'Reconstructs every medication course and asks whether any list contradicts a documented stop.',
    headline: 'Medication courses, checked against every list',
  },
  {
    id: 'monitoring-gaps',
    label: 'Chronic disease monitoring review',
    prompt: 'Show me which monitoring tests are missing for my active conditions',
    keywords: [
      'monitor', 'monitoring', 'gap', 'missing', 'chronic', 'diabetes', 'a1c', 'follow',
      'overdue', 'check',
    ],
    source: 'primary',
    include: isLabOrNote,
    focus: 'measurements',
    blurb:
      'Reads the declared monitoring map for each open condition and names the measurements that are absent.',
    headline: 'Monitoring, mapped against what the record contains',
  },
  {
    id: 'data-quality',
    label: 'Data quality review',
    prompt: 'Find anything in my records that looks like a transcription or unit error',
    keywords: [
      'quality', 'error', 'typo', 'unit', 'transcription', 'wrong', 'inconsisten',
      'implausible', 'clean', 'accuracy',
    ],
    source: 'primary',
    focus: 'quality',
    blurb:
      'Flags values outside the plausible range, measurements reported in two units, and conflicting administrative fields.',
    headline: 'Where the record disagrees with itself',
  },
  {
    id: 'clinical-share',
    label: 'Clinic-ready share package',
    prompt: 'Prepare a redacted summary I can send to a specialist',
    keywords: [
      'share', 'export', 'send', 'specialist', 'fhir', 'interop', 'redact', 'privacy',
      'clinic', 'package', 'handover',
    ],
    source: 'primary',
    focus: 'interop',
    blurb:
      'Builds a FHIR bundle where every resource carries its source span, plus a redacted variant with a removal manifest.',
    headline: 'A shareable package that keeps its provenance',
  },
  {
    id: 'thyroid-titration',
    label: 'Thyroid dose titration record',
    prompt: 'Track a levothyroxine dose change and the thyroid results that followed it',
    keywords: [
      'thyroid', 'levothyroxine', 'tsh', 'titration', 'dose', 'hormone', 'thyroxine',
      'titrate', 'follow-up',
    ],
    source: 'monitoring',
    include: isMeasureHeavy,
    focus: 'measurements',
    blurb:
      'A tightly monitored record: dose raised, TSH rechecked, and the trajectory fitted rather than eyeballed.',
    headline: 'A dose change and the results that followed',
  },
  {
    id: 'sparse-triage',
    label: 'Sparse record triage',
    prompt: 'I only have a few documents from the last two years — what can you tell me',
    keywords: [
      'sparse', 'few', 'little', 'minimal', 'old', 'triage',
      'emergency', 'incomplete', 'hardly',
    ],
    source: 'sparse',
    focus: 'findings',
    blurb:
      'Three documents with a two-year gap. The engine reports what it can and states clearly what it cannot.',
    headline: 'What three documents can and cannot support',
  },
  {
    id: 'cohort-scan',
    label: 'Multi-patient cohort scan',
    prompt: 'Run the same checks across several patients and show me which rules fire most',
    keywords: [
      'cohort', 'patients', 'population', 'many', 'several', 'across', 'compare',
      'prevalence', 'batch', 'scan', 'all',
    ],
    source: 'primary',
    focus: 'findings',
    blurb:
      `The same ${RULE_SUMMARY} over three structurally different records, with prevalence rather than anecdotes.`,
    headline: 'One rule set, three different records',
  },
];

export const DEFAULT_SCENARIO = SCENARIOS[0];

/**
 * The suggestions shown as chips under the composer.
 *
 * Chosen so the row reaches all three synthetic subjects rather than only the
 * primary one — otherwise the cohort and the sparse record are unreachable
 * without knowing to type for them.
 */
export const PROMPT_SUGGESTIONS: string[] = [
  'Audit my medication list for contradictions',
  'Which monitoring tests are missing?',
  'Find transcription and unit errors',
  'Prepare a redacted share package',
  'Track a levothyroxine dose titration',
  'I only have a few documents — triage them',
];

/** Phrases cycled through the composer placeholder while it is idle. */
export const PLACEHOLDER_PHRASES: string[] = [
  'Audit my medication list for anything that contradicts an earlier document…',
  'Reconstruct a four-year history with every fact linked to its source…',
  'Find the measurements my active conditions should have generated but did not…',
  'Flag transcription and unit errors without correcting them silently…',
  'Build a shareable package that keeps its provenance intact…',
];

/* ------------------------------------------------------------------ */
/* Prompt matching                                                     */
/* ------------------------------------------------------------------ */

export interface MatchResult {
  scenario: Scenario;
  matchedBy: 'keywords' | 'fallback';
  matchedOn: string[];
}

/**
 * How much of a prompt a scenario's vocabulary explains.
 *
 * Scoring by matched *characters* rather than by keyword count, and merging
 * overlapping matches, means a short keyword that is a substring of a longer one
 * cannot inflate a score by matching the same text twice. "monitoring" scores 10,
 * not 17 for also containing "monitor".
 */
export function scorePrompt(
  text: string,
  keywords: string[],
): { score: number; matched: string[] } {
  const spans: Array<[number, number]> = [];
  const matched: string[] = [];

  for (const keyword of keywords) {
    let from = 0;
    let found = false;
    for (;;) {
      const at = text.indexOf(keyword, from);
      if (at === -1) break;
      spans.push([at, at + keyword.length]);
      found = true;
      from = at + keyword.length;
    }
    if (found) matched.push(keyword);
  }

  if (spans.length === 0) return { score: 0, matched: [] };

  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let score = 0;
  let [start, end] = spans[0];
  for (const [spanStart, spanEnd] of spans.slice(1)) {
    if (spanStart > end) {
      score += end - start;
      start = spanStart;
      end = spanEnd;
    } else if (spanEnd > end) {
      end = spanEnd;
    }
  }
  score += end - start;

  return { score, matched };
}

/**
 * Match a free-text prompt to a scenario.
 *
 * Deliberately transparent: it returns the keywords it matched on, so the
 * interface can show the user exactly why it chose what it chose. When nothing
 * matches it says so rather than pretending the prompt was understood.
 */
export function matchScenario(prompt: string, scenarios: Scenario[] = SCENARIOS): MatchResult {
  const text = prompt.toLowerCase();
  if (!text.trim()) return { scenario: DEFAULT_SCENARIO, matchedBy: 'fallback', matchedOn: [] };

  let best: { scenario: Scenario; matched: string[]; score: number } | null = null;

  for (const scenario of scenarios) {
    const { score, matched } = scorePrompt(text, scenario.keywords);
    if (score === 0) continue;
    if (!best || score > best.score) best = { scenario, matched, score };
  }

  if (!best) return { scenario: DEFAULT_SCENARIO, matchedBy: 'fallback', matchedOn: [] };
  return { scenario: best.scenario, matchedBy: 'keywords', matchedOn: best.matched };
}
