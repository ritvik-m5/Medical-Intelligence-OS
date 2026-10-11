import type { IngestResult } from '../ingest';
import type { ISODate, Patient } from '../types';
import { parseDate } from '../text/normalize';

const NAME_PATTERNS = [
  /\bpatient\s*[:\-]\s*([^\n\r]{2,72})/gi,
  /\b(?:patient\s+name|pt\s+name)\s*[:\-]\s*([^\n\r]{2,72})/gi,
];

const TRAILING_JUNK =
  /\s+(?:MRN|DOB|Date of Service|Admission|Discharge|Provider|Attending|Sex|Gender)\b.*/i;

const INVALID_NAMES = new Set([
  'unknown',
  'patient',
  'name',
  'your record',
  'not recorded',
  'n/a',
]);

function titleCaseWord(word: string): string {
  if (word.length <= 2 && word.endsWith('.')) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Normalize a raw name line scraped from document text. */
export function cleanPatientName(raw: string): string | null {
  let name = raw.trim().replace(TRAILING_JUNK, '').trim();
  name = name.split(/\r?\n/)[0].trim();
  name = name.replace(/^patient\s*[:\-]\s*/i, '').trim();
  if (name.length < 3 || name.length > 64) return null;
  if (INVALID_NAMES.has(name.toLowerCase())) return null;

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return null;

  const strict = parts.every(
    (part) =>
      /^[A-Z][a-z'-]+$/.test(part) || /^[A-Z]\.?$/.test(part) || /^[A-Za-z]+-[A-Za-z]+$/.test(part),
  );
  if (strict) return parts.join(' ');

  if (!parts.every((part) => /^[A-Za-z'.-]+$/.test(part))) return null;
  return parts.map(titleCaseWord).join(' ');
}

/** Pull the most common patient name across document headers. */
export function extractNameFromText(text: string): string | null {
  const votes = new Map<string, number>();
  for (const pattern of NAME_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const cleaned = cleanPatientName(match[1]);
      if (cleaned) votes.set(cleaned, (votes.get(cleaned) ?? 0) + 1);
    }
  }
  if (votes.size === 0) return null;
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
}

function voteDemographic(
  results: IngestResult[],
  entityKey: string,
  read: (fact: IngestResult['facts'][number]) => string | undefined,
): string | undefined {
  const votes = new Map<string, number>();
  for (const result of results) {
    for (const fact of result.facts) {
      if (fact.entityKey !== entityKey) continue;
      const value = read(fact);
      if (value) votes.set(value, (votes.get(value) ?? 0) + 1);
    }
  }
  if (votes.size === 0) return undefined;
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Derive patient identity from imported documents.
 *
 * Names are read from document headers (never invented). DOB and sex come from
 * provenanced demographic facts when present.
 */
export function derivePatientFromCorpus(base: Patient, results: IngestResult[]): Patient {
  if (results.length === 0) return base;

  const nameVotes = new Map<string, number>();
  for (const result of results) {
    const name = extractNameFromText(result.document.text);
    if (name) nameVotes.set(name, (nameVotes.get(name) ?? 0) + 1);
  }

  const name =
    nameVotes.size > 0
      ? [...nameVotes.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : base.name;

  const dateOfBirth = voteDemographic(results, 'demographic:date-of-birth', (fact) => {
    const parsed = fact.attrs.parsedDate;
    if (typeof parsed === 'string' && parsed) return parsed as ISODate;
    if (fact.valueText) return parseDate(fact.valueText) ?? undefined;
    return undefined;
  });

  const sex = voteDemographic(results, 'demographic:sex', (fact) => {
    if (typeof fact.attrs.raw === 'string') return fact.attrs.raw;
    return fact.valueText?.toLowerCase();
  });

  return {
    ...base,
    id: name ? `local-${slugFromName(name)}` : base.id,
    name,
    dateOfBirth: dateOfBirth ?? base.dateOfBirth,
    sex: sex ?? base.sex,
  };
}
