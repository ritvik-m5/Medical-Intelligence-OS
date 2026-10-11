import type { FactFlag } from '../types';

/** Base confidence per extractor. Structured rows are trusted more than prose. */
const EXTRACTOR_BASE: Record<string, number> = {
  'lab.table-row': 0.95,
  'lab.inline': 0.88,
  'lab.reference-only': 0.6,
  'vital.pattern': 0.92,
  'med.section-list': 0.9,
  'med.inline': 0.8,
  'condition.assessment': 0.85,
  'condition.mention': 0.78,
  'procedure.mention': 0.8,
  'allergy.explicit': 0.93,
  'immunization.explicit': 0.9,
  'symptom.mention': 0.7,
  'social.mention': 0.72,
  'demographic.pattern': 0.88,
  'document.header': 0.95,
};

export interface ConfidenceInput {
  extractor: string;
  hasUnit: boolean;
  hasDocumentedRange: boolean;
  statusAmbiguous: boolean;
  statusFromSection: boolean;
  implausible: boolean;
  unitInferred: boolean;
  negated: boolean;
  restated: boolean;
  docQuality: number;
  entityResolved: boolean;
}

/**
 * Confidence is deliberately conservative and explainable: every adjustment maps
 * to a flag the user can see in the evidence drawer. A number the engine cannot
 * justify should not look certain.
 */
export function scoreConfidence(input: ConfidenceInput): number {
  let score = EXTRACTOR_BASE[input.extractor] ?? 0.7;
  if (input.hasUnit) score += 0.03;
  if (input.hasDocumentedRange) score += 0.02;
  if (input.statusFromSection) score -= 0.12;
  if (input.statusAmbiguous) score -= 0.08;
  if (input.implausible) score -= 0.1;
  if (input.unitInferred) score -= 0.05;
  if (input.negated) score -= 0.07;
  if (input.restated) score -= 0.06;
  if (!input.entityResolved) score -= 0.1;
  score += (input.docQuality - 0.9) * 0.3;
  return Math.max(0.05, Math.min(0.99, Math.round(score * 100) / 100));
}

export function pushFlag(flags: FactFlag[], flag: FactFlag): void {
  if (!flags.includes(flag)) flags.push(flag);
}
