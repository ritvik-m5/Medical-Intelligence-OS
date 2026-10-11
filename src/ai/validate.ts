/* ------------------------------------------------------------------ */
/* Model claim verification                                            */
/*                                                                    */
/* The model speaks naturally; it does not get to rewrite reality.      */
/* After generation and before rendering, `validateAIResponse` checks   */
/* that every checkable factual claim resolves to the evidence supplied  */
/* for that response.                                                    */
/*                                                                    */
/* This is deterministic. There is no second model judging the first.    */
/* A claim is rejected only when it cannot be traced to the context —     */
/* never merely because the model phrased it differently.               */
/* ------------------------------------------------------------------ */

import type { ISODate } from '../engine/types';

export type ValidationRoute = 'general' | 'record' | 'research';

export interface NumberFact {
  value: number;
  unit?: string;
}

export interface ValidationContext {
  route: ValidationRoute;
  asOf?: ISODate;
  numbers: NumberFact[];
  dates: ISODate[];
  entities: string[];
  findings: string[];
  sources: string[];
  personalStatements: string[];
  limitations?: string[];
}

export type ClaimStatus = 'supported' | 'unsupported' | 'unverifiable';

export interface Claim {
  type: 'number' | 'date' | 'personal' | 'conclusion';
  text: string;
  status: ClaimStatus;
  reason: string;
}

export type ResponseStatus = 'verified' | 'partially-verified' | 'unverified' | 'unavailable';

export interface ValidatedAIResponse {
  text: string;
  claims: Claim[];
  supportedClaims: number;
  rejectedClaims: number;
  status: ResponseStatus;
}

const UNIT = String.raw`(?:mmol/L|mg/dL|mmol\/L|mg\/dL|mIU/L|U/L|kg/m2|kg\/m2|mL/min/1.73m2|mmHg|bpm|lb|in|ng/mL|mg/L|ug/L|mEq/L|%)`;

/**
 * A checkable value: either a decimal ("6.6", "6.60") with an optional unit, or
 * an integer with a unit ("45 mmol/L"). A bare integer ("2020", "3 times") is
 * a year or a count, not a measurement, and is deliberately not extracted.
 */
const NUMBER_RE = new RegExp(String.raw`(?:\d+\.\d+\s*(?:${UNIT})?|\d+\s+(?:${UNIT}))`, 'g');

/** A personal assertion about the user's record, which must resolve to evidence. */
const PERSONAL_RE =
  /\b(your record|your lab|your labs|your result|your results|your medication|your medications|your potassium|your a1c|you were|you are|you have|you had)\b/i;

/** A conclusion the model is never allowed to draw from numbers alone. */
const CONCLUSION_RE =
  /\b(definitely|diagnos(?:is|ed|e)|means you (?:have|are)|confirms you (?:have|are)|you (?:have|are) (?:diabetes|hyperkalemia|hypokalemia|hypertension|cancer|anemia|kidney disease|heart disease))\b/i;

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
];

/** Extract a raw date substring to ISO, or null. */
function normalizeDate(raw: string): ISODate | null {
  const text = raw.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const named = text.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (named) {
    const month = MONTHS.indexOf(named[1].toLowerCase());
    if (month === -1) return null;
    return `${named[3]}-${String(month + 1).padStart(2, '0')}-${named[2].padStart(2, '0')}`;
  }
  return null;
}

function extractDates(text: string): string[] {
  const out: string[] = [];
  out.push(...(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []));
  out.push(...(text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) ?? []));
  for (const month of MONTHS) {
    out.push(...(text.match(new RegExp(`\\b${month}\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`, 'gi')) ?? []));
  }
  return out;
}

function extractNumbers(text: string): Array<{ value: number; unit?: string; raw: string }> {
  const out: Array<{ value: number; unit?: string; raw: string }> = [];
  for (const match of text.matchAll(NUMBER_RE)) {
    const raw = match[0];
    const unitMatch = raw.match(new RegExp(String.raw`\s*(${UNIT})$`, 'i'));
    const unit = unitMatch ? unitMatch[1].replace(/\//g, '/') : undefined;
    const valueStr = unitMatch ? raw.slice(0, -unitMatch[0].length).trim() : raw.trim();
    out.push({ value: Number(valueStr), unit, raw: raw.trim() });
  }
  return out;
}

function numberSupported(value: number, unit: string | undefined, context: ValidationContext): boolean {
  return context.numbers.some((fact) => {
    if (Math.abs(fact.value - value) > 1e-9) return false;
    if (unit && fact.unit && unit.toLowerCase() !== fact.unit.toLowerCase()) return false;
    return true;
  });
}

/**
 * Build a validation context from the evidence the gateway already holds: the
 * graph's facts (numbers + entities + dates), the derivations (findings), and
 * the asOf. The validator is fed this — never the raw user question.
 */
export function buildValidationContext(
  graph: {
    facts: Array<{ valueNum?: number; unit?: string; entityKey: string; label: string; occurredAt: ISODate }>;
    documents: Array<{ date: ISODate }>;
  },
  derivations: Array<{ title: string; statement: string }>,
  asOf: ISODate,
  route: ValidationRoute,
): ValidationContext {
  const numbers: NumberFact[] = [];
  const entities = new Set<string>();
  const dates = new Set<ISODate>();
  const personalStatements: string[] = [];

  for (const fact of graph.facts) {
    if (fact.valueNum !== undefined) numbers.push({ value: fact.valueNum, unit: fact.unit });
    entities.add(fact.label.toLowerCase());
    entities.add(fact.entityKey.toLowerCase());
    dates.add(fact.occurredAt);
    personalStatements.push(fact.label.toLowerCase());
  }
  for (const doc of graph.documents) dates.add(doc.date);

  const findings = derivations.map((derivation) => derivation.title.toLowerCase());

  return {
    route,
    asOf,
    numbers,
    dates: Array.from(dates),
    entities: Array.from(entities),
    findings,
    sources: [],
    personalStatements,
  };
}

const DEFAULT_LIMITATION = 'Medical Memory cannot establish that from the available record.';

/**
 * Verify a model explanation against the evidence context.
 *
 * General conversation bypasses validation entirely. For record and research
 * responses, every number, date, personal assertion and conclusion must resolve
 * to the context; a sentence that fails is replaced with a deterministic
 * limitation rather than silently returned.
 */
export function validateAIResponse(text: string, context: ValidationContext): ValidatedAIResponse {
  if (context.route === 'general') {
    return { text, claims: [], supportedClaims: 0, rejectedClaims: 0, status: 'verified' };
  }

  if (!text.trim()) {
    return { text: '', claims: [], supportedClaims: 0, rejectedClaims: 0, status: 'unavailable' };
  }

  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const claims: Claim[] = [];
  const kept: string[] = [];
  let rejected = 0;

  for (const sentence of sentences) {
    const sentenceClaims: Claim[] = [];
    let reject = false;

    for (const number of extractNumbers(sentence)) {
      if (numberSupported(number.value, number.unit, context)) {
        sentenceClaims.push({ type: 'number', text: number.raw, status: 'supported', reason: 'present in the evidence' });
      } else {
        sentenceClaims.push({ type: 'number', text: number.raw, status: 'unsupported', reason: 'not present in the evidence' });
        reject = true;
      }
    }

    for (const raw of extractDates(sentence)) {
      const normalized = normalizeDate(raw);
      if (!normalized) {
        sentenceClaims.push({ type: 'date', text: raw, status: 'unverifiable', reason: 'not a recognised date' });
        continue;
      }
      const inEvidence = context.dates.includes(normalized);
      const withinAsOf = !context.asOf || normalized <= context.asOf;
      if (inEvidence && withinAsOf) {
        sentenceClaims.push({ type: 'date', text: raw, status: 'supported', reason: 'within the record and its asOf' });
      } else {
        sentenceClaims.push({
          type: 'date',
          text: raw,
          status: 'unsupported',
          reason: withinAsOf ? 'not present in the evidence' : 'after the record\u2019s asOf',
        });
        reject = true;
      }
    }

    if (PERSONAL_RE.test(sentence) && context.route === 'record') {
      const hasSupportedNumber = extractNumbers(sentence).some((n) =>
        numberSupported(n.value, n.unit, context),
      );
      const hasKnownEntity = context.entities.some((entity) => sentence.toLowerCase().includes(entity));
      if (!hasSupportedNumber && !hasKnownEntity) {
        sentenceClaims.push({ type: 'personal', text: sentence, status: 'unsupported', reason: 'does not resolve to the personal record' });
        reject = true;
      } else {
        sentenceClaims.push({ type: 'personal', text: sentence, status: 'supported', reason: 'resolves to the personal record' });
      }
    }

    if (CONCLUSION_RE.test(sentence)) {
      sentenceClaims.push({ type: 'conclusion', text: sentence, status: 'unsupported', reason: 'a diagnosis or certainty the engine does not establish' });
      reject = true;
    }

    claims.push(...sentenceClaims);
    if (reject) {
      rejected += 1;
      kept.push(context.limitations?.[0] ?? DEFAULT_LIMITATION);
    } else {
      kept.push(sentence);
    }
  }

  const status: ResponseStatus =
    rejected === 0 ? 'verified' : kept.length === 0 ? 'unavailable' : 'partially-verified';

  return {
    text: kept.join(' '),
    claims,
    supportedClaims: claims.filter((claim) => claim.status === 'supported').length,
    rejectedClaims: claims.filter((claim) => claim.status !== 'supported').length,
    status,
  };
}


