import type { FactFlag, ReferenceRange } from '../types';
import type { ConceptSpec } from '../text/lexiconTypes';
import { parseNumber, parseRange, canonicalUnit, UNIT_CONVERSIONS, isKnownUnit } from '../text/normalize';

/** A numeric value found near a concept mention, with everything around it. */
export interface FoundValue {
  value: number;
  comparator?: '<' | '>' | '<=' | '>=';
  unit?: string;
  flag?: 'H' | 'L' | 'N' | '*';
  referenceRange?: ReferenceRange;
  /** Offset of the value inside the searched text. */
  offset: number;
  length: number;
  /** True when the unit was not written and had to be inferred from the concept. */
  unitInferred: boolean;
  raw: string;
}

const VALUE_AFTER =
  /^[\s:=\-–—|]*([HLNhl]\b|\*)?[\s|]*([<>]?\s*\d{1,4}(?:\.\d+)?)(?:\s*([HLNhl]\b|\*))?(?:\s*([A-Za-z%µ][A-Za-z0-9%µ/^.]{0,11}))?/;

const RANGE_AFTER = /^[\s,;|]*(?:\(|\[)?\s*([<>]?\s*\d*\.?\d+(?:\s*(?:-|–|—|to)\s*\d*\.?\d+)?)\s*(?:\)|\])?/;

/** Read "142 H mg/dL (<100)" style payloads that follow a concept mention. */
export function findValueAfter(text: string, from: number): FoundValue | null {
  const window = text.slice(from, Math.min(text.length, from + 80));
  const m = VALUE_AFTER.exec(window);
  if (!m) return null;
  const parsed = parseNumber(m[2]);
  if (!parsed) return null;
  const preFlag = m[1] && m[1] !== '*' ? (m[1].toUpperCase() as 'H' | 'L' | 'N') : undefined;
  const postFlag = m[3] && m[3] !== '*' ? (m[3].toUpperCase() as 'H' | 'L' | 'N') : undefined;
  const star = m[1] === '*' || m[3] === '*';
  const capturedUnit = m[4] ? canonicalUnit(m[4]) : undefined;
  const unit = isKnownUnit(capturedUnit) ? capturedUnit : undefined;

  const consumed = m[0].length;
  const rangeWindow = text.slice(from + consumed, Math.min(text.length, from + consumed + 40));
  const rm = RANGE_AFTER.exec(rangeWindow);
  let referenceRange: ReferenceRange | undefined;
  let extra = 0;
  if (rm && /[<>]|\d\s*(?:-|–|—|to)\s*\d/.test(rm[1])) {
    const parsedRange = parseRange(rm[1].replace(/\s+/g, ' ').trim());
    if (parsedRange) {
      referenceRange = { low: parsedRange.low, high: parsedRange.high, text: parsedRange.text };
      extra = rm[0].length;
    }
  }

  return {
    value: parsed.value,
    comparator: parsed.comparator,
    unit,
    flag: star ? '*' : (postFlag ?? preFlag),
    referenceRange,
    offset: from,
    length: consumed + extra,
    unitInferred: !unit,
    raw: (m[0] + rangeWindow.slice(0, extra)).trim(),
  };
}

/** Read "142 LDL Cholesterol" style rows where the value precedes the label. */
export function findValueBefore(text: string, to: number): FoundValue | null {
  const windowStart = Math.max(0, to - 40);
  const window = text.slice(windowStart, to);
  const m = /([<>]?\s*\d{1,4}(?:\.\d+)?)\s*([HLNhl]\b|\*)?[\s|:=-–—]*$/.exec(window);
  if (!m) return null;
  const parsed = parseNumber(m[1]);
  if (!parsed) return null;
  return {
    value: parsed.value,
    comparator: parsed.comparator,
    flag: m[2] && m[2] !== '*' ? (m[2].toUpperCase() as 'H' | 'L' | 'N') : m[2] === '*' ? '*' : undefined,
    offset: windowStart + (m.index ?? 0),
    length: m[0].length,
    unitInferred: true,
    raw: m[0].trim(),
  };
}

export interface UnitResolution {
  unit?: string;
  /** Canonical value in the concept's canonical unit, when a conversion is known. */
  canonicalValue?: number;
  converted: boolean;
  note?: string;
  flags: FactFlag[];
}

const MASS_CONVERSIONS: Record<string, { to: string; factor: number; from: string[]; celsius: boolean }> = {
  weight: { to: 'lb', factor: 2.2046226, from: ['kg', 'kilogram', 'kilograms'], celsius: false },
  height: { to: 'in', factor: 0.3937008, from: ['cm', 'centimeter', 'centimeters'], celsius: false },
  'body-temperature': { to: '°F', factor: 1.8, from: ['°c', 'c', 'celsius'], celsius: true },
  'waist-circumference': { to: 'in', factor: 0.3937008, from: ['cm'], celsius: false },
};

/**
 * Normalise a stated unit against the concept's canonical unit, converting when a
 * well-known factor exists and flagging when it does not. Never silently coerces.
 */
export function resolveUnit(spec: ConceptSpec, value: number, statedUnit?: string): UnitResolution {
  const flags: FactFlag[] = [];
  if (!statedUnit) {
    return { unit: spec.unit, canonicalValue: value, converted: false, flags: ['unit_inferred'] };
  }
  if (!spec.unit || statedUnit === spec.unit) {
    return { unit: statedUnit, canonicalValue: value, converted: false, flags };
  }

  const mass = MASS_CONVERSIONS[spec.key];
  if (mass && mass.from.includes(statedUnit.toLowerCase())) {
    const convertedValue = mass.celsius ? value * mass.factor + 32 : value * mass.factor;
    const rounded = Math.round(convertedValue * 100) / 100;
    return {
      unit: mass.to,
      canonicalValue: rounded,
      converted: true,
      note: `${value} ${statedUnit} → ${rounded} ${mass.to}`,
      flags,
    };
  }

  const conv = UNIT_CONVERSIONS.find((c) => c.key === spec.key && c.from === statedUnit);
  if (conv) {
    const convertedValue = conv.offset !== undefined ? value * conv.factor + conv.offset : value * conv.factor;
    const rounded = Math.round(convertedValue * 100) / 100;
    return { unit: conv.to, canonicalValue: rounded, converted: true, note: conv.note, flags };
  }

  flags.push('unit_unusual');
  return { unit: statedUnit, canonicalValue: value, converted: false, flags };
}

export interface PlausibilityResult {
  implausible: boolean;
  flag?: 'critical' | 'typo';
  note?: string;
  flags: FactFlag[];
}

/**
 * Decide whether a value is clinically plausible *as reported*. A value far
 * outside the plausible window is far more likely to be a transcription or unit
 * error than a real finding, and the engine says so instead of believing it.
 */
export function assessPlausibility(spec: ConceptSpec, value: number): PlausibilityResult {
  if (!spec.plausible) return { implausible: false, flags: [] };
  const [low, high] = spec.plausible;
  if (value >= low && value <= high) return { implausible: false, flags: [] };

  const flags: FactFlag[] = ['implausible_value'];
  for (const factor of [10, 100, 1000]) {
    const shrunk = value / factor;
    if (shrunk >= low && shrunk <= high) {
      return {
        implausible: true,
        flag: 'typo',
        note: `${value} is outside the plausible range ${low}-${high} ${spec.unit ?? ''}. ${Math.round(shrunk * 100) / 100} would be plausible — check for a decimal or unit error.`,
        flags,
      };
    }
  }
  return {
    implausible: true,
    flag: 'critical',
    note: `${value} ${spec.unit ?? ''} is outside the plausible range ${low}-${high} ${spec.unit ?? ''}.`,
    flags,
  };
}

