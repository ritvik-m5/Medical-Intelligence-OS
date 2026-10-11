import type { ISODate } from '../types';

/* ------------------------------------------------------------------ */
/* Dates                                                              */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function toISO(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parse the date formats that actually appear in imported medical documents.
 * Returns null rather than guessing — an unparsed date must not silently
 * become "today", because that would corrupt the timeline.
 */
export function parseDate(raw: string, fallbackYear?: number): ISODate | null {
  const text = raw.trim();
  if (!text) return null;

  // 2025-03-14
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return valid(+m[1], +m[2], +m[3]);

  // 2025-03 (month precision)
  m = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (m) return valid(+m[1], +m[2], 1);

  // 03/14/2025 or 3/14/25
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text);
  if (m) {
    const year = normalizeYear(+m[3]);
    return valid(year, +m[1], +m[2]) ?? valid(year, +m[2], +m[1]);
  }

  // 14-Mar-2025
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2,4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) return valid(normalizeYear(+m[3]), month, +m[1]);
  }

  // Mar 14, 2025
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{2,4})?$/.exec(text);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const year = m[3] ? normalizeYear(+m[3]) : fallbackYear;
    if (month && year) return valid(year, month, +m[2]);
  }

  // March 2025
  m = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month) return valid(+m[2], month, 1);
  }

  return null;
}

function normalizeYear(y: number): number {
  if (y < 100) return y >= 70 ? 1900 + y : 2000 + y;
  return y;
}

function valid(year: number, month: number, day: number): ISODate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  return toISO(year, month, day);
}

/** Regex source for "a date", usable inside larger patterns. */
export const DATE_PATTERN =
  '(?:\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|\\d{1,2}[-\\s][A-Za-z]{3,9}[-\\s,]*\\d{2,4}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s*\\d{2,4}|[A-Za-z]{3,9}\\.?\\s+\\d{4})';

export function daysBetween(a: ISODate, b: ISODate): number {
  const t1 = Date.parse(`${a}T00:00:00Z`);
  const t2 = Date.parse(`${b}T00:00:00Z`);
  return Math.round((t2 - t1) / 86400000);
}

export function addDays(date: ISODate, days: number): ISODate {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

export function formatDateShort(date: ISODate): string {
  const [y, m] = date.split('-').map(Number);
  if (!y || !m) return date;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function ageAt(dob: ISODate | undefined, at: ISODate): number | null {
  if (!dob) return null;
  const y = Number(at.slice(0, 4)) - Number(dob.slice(0, 4));
  const beforeBirthday = at.slice(5) < dob.slice(5);
  return beforeBirthday ? y - 1 : y;
}

/* ------------------------------------------------------------------ */
/* Numbers and units                                                  */
/* ------------------------------------------------------------------ */

const UNIT_CANON: Record<string, string> = {
  'mg/dl': 'mg/dL',
  'mgdl': 'mg/dL',
  'mmol/l': 'mmol/L',
  'meq/l': 'mmol/L',
  'mg/l': 'mg/L',
  'g/dl': 'g/dL',
  'gm/dl': 'g/dL',
  'u/l': 'U/L',
  'iu/l': 'U/L',
  'units/l': 'U/L',
  'miu/l': 'mIU/L',
  'uiu/ml': 'µIU/mL',
  'ng/ml': 'ng/mL',
  'pg/ml': 'pg/mL',
  'ng/dl': 'ng/dL',
  'mcg/dl': 'mcg/dL',
  'ug/dl': 'mcg/dL',
  'x10^3/ul': '10^3/µL',
  'k/ul': '10^3/µL',
  'thou/ul': '10^3/µL',
  'x10^6/ul': '10^6/µL',
  'm/ul': '10^6/µL',
  'fl': 'fL',
  'mm/hr': 'mm/hr',
  'ml/min/1.73m2': 'mL/min/1.73m²',
  'mmhg': 'mmHg',
  'percent': '%',
  'lbs': 'lb',
  'pounds': 'lb',
  'degf': '°F',
  'degc': '°C',
  'ug': 'mcg',
  'cc': 'mL',
};

/**
 * Canonical units the extractor will accept from free text.
 *
 * Deliberately excludes the bare token "in": "A1c 6.4 in June" would otherwise
 * be read as 6.4 inches. Height written as "70 in" therefore falls back to the
 * concept's canonical unit, which is the same answer by a safer route.
 */
export const KNOWN_UNITS: Set<string> = new Set([
  'mg/dL',
  'mmol/L',
  'mg/L',
  'g/dL',
  'U/L',
  'mIU/L',
  'µIU/mL',
  'ng/mL',
  'pg/mL',
  'ng/dL',
  'mcg/dL',
  'µmol/L',
  'nmol/L',
  'pmol/L',
  'ng/L',
  'mg/g',
  '10^3/µL',
  '10^6/µL',
  'fL',
  'pg',
  'mm/hr',
  'mL/min/1.73m²',
  'mmHg',
  'bpm',
  'breaths/min',
  'steps/day',
  'hours',
  'mL/kg/min',
  'mmol/mol',
  'IU/mL',
  'ratio',
  'titer',
  'kg/m²',
  '%',
  '°F',
  '°C',
  'mg',
  'mcg',
  'g',
  'kg',
  'lb',
  'cm',
  'mL',
  'units',
  'IU',
]);

export function isKnownUnit(unit: string | undefined): boolean {
  if (!unit) return false;
  return KNOWN_UNITS.has(unit);
}

export function canonicalUnit(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/\.$/, '');
  if (!cleaned) return undefined;
  const key = cleaned.toLowerCase().replace(/\s+/g, '');
  return UNIT_CANON[key] ?? cleaned;
}

/**
 * Cross-unit conversions. Used both to normalise values from non-US labs and to
 * detect likely unit errors ("this looks like a mmol/L value reported in mg/dL").
 */
export const UNIT_CONVERSIONS: Array<{
  key: string;
  from: string;
  to: string;
  factor: number;
  offset?: number;
  note: string;
}> = [
  { key: 'glucose', from: 'mmol/L', to: 'mg/dL', factor: 18.0182, note: 'glucose: mg/dL = mmol/L × 18.0182' },
  { key: 'hemoglobin-a1c', from: 'mmol/mol', to: '%', factor: 0.09148, offset: 2.15, note: 'HbA1c: % ≈ (mmol/mol × 0.09148) + 2.15' },
  { key: 'ldl-cholesterol', from: 'mmol/L', to: 'mg/dL', factor: 38.67, note: 'cholesterol: mg/dL = mmol/L × 38.67' },
  { key: 'hdl-cholesterol', from: 'mmol/L', to: 'mg/dL', factor: 38.67, note: 'cholesterol: mg/dL = mmol/L × 38.67' },
  { key: 'total-cholesterol', from: 'mmol/L', to: 'mg/dL', factor: 38.67, note: 'cholesterol: mg/dL = mmol/L × 38.67' },
  { key: 'triglycerides', from: 'mmol/L', to: 'mg/dL', factor: 88.57, note: 'triglycerides: mg/dL = mmol/L × 88.57' },
  { key: 'creatinine', from: 'µmol/L', to: 'mg/dL', factor: 0.0113, note: 'creatinine: mg/dL = µmol/L × 0.0113' },
  { key: 'vitamin-d-25-oh', from: 'nmol/L', to: 'ng/mL', factor: 0.4, note: '25-OH vitamin D: ng/mL = nmol/L × 0.4' },
  { key: 'vitamin-b12', from: 'pmol/L', to: 'pg/mL', factor: 1.355, note: 'B12: pg/mL ≈ pmol/L × 1.355' },
];

export interface ParsedNumber {
  value: number;
  comparator?: '<' | '>' | '<=' | '>=';
  raw: string;
}

/** Read the numeric payload of a lab row: comparators, thousands separators, EU decimal commas. */
export function parseNumber(raw: string): ParsedNumber | null {
  let text = raw.trim();
  let comparator: ParsedNumber['comparator'];
  const cmp = /^(<=|>=|<|>|less than|greater than)\s*/i.exec(text);
  if (cmp) {
    const token = cmp[1].toLowerCase();
    comparator =
      token === '<' || token === '<=' ? token
      : token === '>' || token === '>=' ? token
      : token.startsWith('less') ? '<'
      : '>';
    text = text.slice(cmp[0].length);
  }
  text = text.replace(/,/g, '').replace(/\s+/g, '');
  if (/^\d+,\d+$/.test(raw.trim())) text = raw.trim().replace(',', '.');
  const m = /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.exec(text);
  if (!m) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return { value, comparator, raw: raw.trim() };
}

/** Reference range as written in the report: "<100", "70 - 99", "0.4-4.0". */
export function parseRange(raw: string): { low?: number; high?: number; text: string } | null {
  const text = raw.trim();
  if (!text) return null;
  let m = /^([<>]=?)\s*(\d*\.?\d+)$/.exec(text);
  if (m) {
    const n = Number(m[2]);
    return m[1].startsWith('<') ? { high: n, text } : { low: n, text };
  }
  m = /^(\d*\.?\d+)\s*(?:-|–|—|to)\s*(\d*\.?\d+)$/.exec(text);
  if (m) return { low: Number(m[1]), high: Number(m[2]), text };
  m = /^(?:up to|<=|≤)\s*(\d*\.?\d+)$/i.exec(text);
  if (m) return { high: Number(m[1]), text };
  return null;
}

export function inRange(value: number, ref?: { low?: number; high?: number }): boolean | null {
  if (!ref || (ref.low === undefined && ref.high === undefined)) return null;
  if (ref.low !== undefined && value < ref.low) return false;
  if (ref.high !== undefined && value > ref.high) return false;
  return true;
}

export function fmtNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

export function titleCase(text: string): string {
  return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

