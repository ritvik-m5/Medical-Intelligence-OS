import type { ConceptCode, FactType, ReferenceRange } from '../types';

/**
 * A concept the extractor knows how to recognise.
 *
 * `plausible` is the single most useful field in this file: it is what lets the
 * engine say "45 mmol/L potassium is not a clinical finding, it is a typo"
 * instead of confidently reporting a fatal value.
 */
export interface ConceptSpec {
  /** Stable normalized key, e.g. `ldl-cholesterol`, `atorvastatin`. */
  key: string;
  label: string;
  kind: FactType;
  category: string;
  aliases: string[];
  codes?: ConceptCode[];
  /** Canonical unit used for comparison across documents. */
  unit?: string;
  /** Accepted surface units, canonicalised on ingest. */
  unitAliases?: string[];
  ref?: ReferenceRange;
  /** Physiologically/analytically plausible window in the canonical unit. */
  plausible?: [number, number];
  /** Free-text notes surfaced in the evidence drawer. */
  note?: string;
  /** For medications: drug class. */
  drugClass?: string;
  /** For medications: what the class is commonly used for (education only). */
  commonUses?: string[];
  /** Labs commonly used to monitor this drug or condition. */
  monitoringLabs?: string[];
}

export const KIND_PREFIX: Record<FactType, string> = {
  measurement: 'measurement',
  medication: 'medication',
  condition: 'condition',
  procedure: 'procedure',
  allergy: 'allergy',
  immunization: 'immunization',
  vital: 'vital',
  encounter: 'encounter',
  symptom: 'symptom',
  social: 'social',
  demographic: 'demographic',
};

export function entityKeyFor(kind: FactType, key: string): string {
  return `${KIND_PREFIX[kind]}:${key}`;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build a lab/measurement concept from a compact tuple. */
export function lab(
  key: string,
  label: string,
  category: string,
  aliases: string,
  unit: string,
  refLow: number | null,
  refHigh: number | null,
  plausibleLow: number,
  plausibleHigh: number,
  refText?: string,
): ConceptSpec {
  const ref: ReferenceRange | undefined =
    refLow === null && refHigh === null
      ? undefined
      : { low: refLow ?? undefined, high: refHigh ?? undefined, text: refText };
  return {
    key,
    label,
    kind: 'measurement',
    category,
    aliases: splitAliases(aliases),
    unit: unit || undefined,
    ref,
    plausible: [plausibleLow, plausibleHigh],
    note: refText,
  };
}

export function splitAliases(csv: string): string[] {
  return csv
    .split('|')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}
