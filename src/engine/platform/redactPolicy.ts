import type { HealthGraph } from '../types';

/* ------------------------------------------------------------------ */
/* De-identification                                                    */
/*                                                                     */
/* A policy-based redaction that produces a *new* graph rather than     */
/* mutating the original, plus a manifest of exactly what was removed   */
/* or altered. The manifest matters as much as the redaction: an export */
/* that cannot say what was taken out cannot be audited.                */
/* ------------------------------------------------------------------ */

export interface RedactionPolicy {
  id: string;
  label: string;
  description: string;
  /** Entity kinds removed entirely. */
  excludeKinds: string[];
  /** Document kinds removed entirely. */
  excludeDocKinds: string[];
  /** Shift every date by a fixed number of days, preserving all intervals. */
  dateShiftDays: number;
  /** Replace the patient name with a stable pseudonym. */
  pseudonymise: boolean;
  /** Drop free-text document bodies, keeping the quoted lines attached to facts. */
  stripDocumentText: boolean;
}

export const REDACTION_POLICIES: RedactionPolicy[] = [
  {
    id: 'full',
    label: 'Full record',
    description: 'No redaction. The export contains the record as imported.',
    excludeKinds: [],
    excludeDocKinds: [],
    dateShiftDays: 0,
    pseudonymise: false,
    stripDocumentText: false,
  },
  {
    id: 'clinical-share',
    label: 'Clinical share',
    description:
      'Keeps clinical content, removes administrative identifiers and social history. Dates are left unshifted so the clinical timeline stays exact.',
    excludeKinds: ['demographic', 'social'],
    excludeDocKinds: ['questionnaire'],
    dateShiftDays: 0,
    pseudonymise: true,
    stripDocumentText: false,
  },
  {
    id: 'research',
    label: 'Research export',
    description:
      'Removes administrative and lifestyle data and shifts every date by a fixed offset, which preserves intervals and durations while breaking the link to a real calendar date.',
    excludeKinds: ['demographic', 'social'],
    excludeDocKinds: ['questionnaire'],
    dateShiftDays: -137,
    pseudonymise: true,
    stripDocumentText: true,
  },
];

export interface RedactionRemoval {
  kind: 'document' | 'fact' | 'entity-kind' | 'date-shift' | 'text' | 'pseudonym';
  target: string;
  detail: string;
}

export interface RedactionManifest {
  policyId: string;
  generatedAt: string;
  removed: RedactionRemoval[];
  counts: {
    documentsRemoved: number;
    factsRemoved: number;
    factsKept: number;
    kindsRemoved: number;
    documentsDateShifted: number;
    textStripped: boolean;
  };
  residualRisk: string[];
}

export interface RedactionResult {
  graph: HealthGraph;
  policy: RedactionPolicy;
  manifest: RedactionManifest;
}
