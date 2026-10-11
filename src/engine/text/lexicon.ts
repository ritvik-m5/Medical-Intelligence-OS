import type { ConceptSpec } from './lexiconTypes';
import { entityKeyFor } from './lexiconTypes';
import type { FactType } from '../types';
import { LAB_SPECS } from './labs';
import { LAB_SPECS_2 } from './labs2';
import { LAB_SPECS_3 } from './labs3';
import { DRUG_SPECS_A } from './drugsA';
import { DRUG_SPECS_B } from './drugsB';
import { DRUG_SPECS_C } from './drugsC';
import { DRUG_SPECS_D } from './drugsD';
import { CONDITION_SPECS } from './conditions';
import { CONDITION_SPECS_2 } from './conditions2';
import { ALLERGY_SPECS, PROCEDURE_SPECS } from './miscA';
import { IMMUNIZATION_SPECS, SYMPTOM_SPECS } from './miscB';
import { DEMOGRAPHIC_SPECS, SOCIAL_SPECS, VITAL_SPECS } from './miscC';

export const ALL_SPECS: ConceptSpec[] = [
  ...LAB_SPECS,
  ...LAB_SPECS_2,
  ...LAB_SPECS_3,
  ...DRUG_SPECS_A,
  ...DRUG_SPECS_B,
  ...DRUG_SPECS_C,
  ...DRUG_SPECS_D,
  ...CONDITION_SPECS,
  ...CONDITION_SPECS_2,
  ...PROCEDURE_SPECS,
  ...ALLERGY_SPECS,
  ...IMMUNIZATION_SPECS,
  ...SYMPTOM_SPECS,
  ...VITAL_SPECS,
  ...SOCIAL_SPECS,
  ...DEMOGRAPHIC_SPECS,
];

/** entityKey → spec. First definition wins (duplicates are a bug, not a feature). */
export const SPEC_BY_ENTITY_KEY: Map<string, ConceptSpec> = (() => {
  const map = new Map<string, ConceptSpec>();
  for (const spec of ALL_SPECS) {
    const key = entityKeyFor(spec.kind, spec.key);
    if (!map.has(key)) map.set(key, spec);
  }
  return map;
})();

export const SPEC_BY_SHORT_KEY: Map<string, ConceptSpec> = (() => {
  const map = new Map<string, ConceptSpec>();
  for (const spec of ALL_SPECS) if (!map.has(spec.key)) map.set(spec.key, spec);
  return map;
})();

/**
 * One alias can legitimately point at several concepts: "aspirin" is both a
 * medication and an allergy. Resolution is left to the extractor, which knows
 * which section it is reading.
 */
export const ALIAS_INDEX: Map<string, ConceptSpec[]> = (() => {
  const map = new Map<string, ConceptSpec[]>();
  for (const spec of ALL_SPECS) {
    for (const alias of spec.aliases) {
      const list = map.get(alias);
      if (list) {
        if (!list.includes(spec)) list.push(spec);
      } else {
        map.set(alias, [spec]);
      }
    }
  }
  return map;
})();

const ALL_ALIASES: string[] = Array.from(ALIAS_INDEX.keys()).sort((a, b) => b.length - a.length);

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One alternation, longest alias first, bounded by non-alphanumerics on both
 * sides. Longest-first is what makes "non-HDL cholesterol" resolve to the right
 * concept instead of matching "cholesterol".
 */
export const CONCEPT_REGEX: RegExp = new RegExp(
  `(?<![a-z0-9])(?:${ALL_ALIASES.map(escapeRegex).join('|')})(?![a-z0-9])`,
  'gi',
);

export interface LexiconMatch {
  alias: string;
  start: number;
  end: number;
  specs: ConceptSpec[];
}

/** Priority used when a bare alias is ambiguous and the section gives no hint. */
const KIND_PRIORITY: FactType[] = [
  'measurement',
  'medication',
  'condition',
  'procedure',
  'allergy',
  'immunization',
  'vital',
  'symptom',
  'social',
  'demographic',
];

export function pickSpec(specs: ConceptSpec[], preferred: FactType[]): ConceptSpec {
  for (const kind of preferred) {
    const hit = specs.find((s) => s.kind === kind);
    if (hit) return hit;
  }
  for (const kind of KIND_PRIORITY) {
    const hit = specs.find((s) => s.kind === kind);
    if (hit) return hit;
  }
  return specs[0];
}

export function matchConcepts(text: string): LexiconMatch[] {
  const matches: LexiconMatch[] = [];
  CONCEPT_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = CONCEPT_REGEX.exec(text)) !== null) {
    if (guard++ > 5000) break;
    const alias = m[0].toLowerCase();
    const specs = ALIAS_INDEX.get(alias);
    if (specs) {
      matches.push({ alias, start: m.index, end: m.index + m[0].length, specs });
    }
    if (m.index === CONCEPT_REGEX.lastIndex) CONCEPT_REGEX.lastIndex++;
  }
  return matches;
}

export function findSpec(shortKey: string): ConceptSpec | undefined {
  return SPEC_BY_SHORT_KEY.get(shortKey);
}
