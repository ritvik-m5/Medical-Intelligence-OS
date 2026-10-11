import type { FactStatus, FactType, SectionKind } from '../types';

/** True when the character at `i` ends a clause. Decimal points do not. */
function isClauseBreak(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === undefined) return false;
  if (/[\n;•·|]/.test(ch)) return true;
  if (ch === ',') return true;
  if (ch === '.') {
    const prev = text[i - 1] ?? '';
    const next = text[i + 1] ?? '';
    // "5.9" is a number, not the end of a sentence.
    if (/\d/.test(prev) && /\d/.test(next)) return false;
    return true;
  }
  return false;
}

/** Find the clause (comma/semicolon/period-delimited) containing a span. */
export function clauseAround(text: string, start: number, end: number): [number, number] {
  let left = start;
  while (left > 0 && !isClauseBreak(text, left - 1)) left--;
  let right = end;
  while (right < text.length && !isClauseBreak(text, right)) right++;
  return [left, right];
}

const STATUS_CUES: Array<{ status: FactStatus; pattern: RegExp; strength: number }> = [
  { status: 'discontinued', pattern: /\b(discontinued|discontinue|stopped|stop taking|d\/c(?:'d)?|dc'd|not continued|no longer (?:taking|on)|withdrawn|withdrew|off of|held)\b/i, strength: 1 },
  { status: 'resolved', pattern: /\b(resolved|resolving|in remission|no longer present|cleared)\b/i, strength: 1 },
  { status: 'completed', pattern: /\b(completed|performed|underwent|done on|status post|s\/p)\b/i, strength: 0.9 },
  { status: 'ordered', pattern: /\b(ordered|pending|awaiting|sent for|drawn today|to be drawn)\b/i, strength: 0.9 },
  { status: 'scheduled', pattern: /\b(scheduled|planned|upcoming|due for|recommended|advised to (?:get|have|obtain)|referred for)\b/i, strength: 0.85 },
  { status: 'active', pattern: /\b(active|currently taking|continues|continue|ongoing|current(?:ly)?|taking|restarted|restart(?:ed)?|initiated|new(?:ly)? started|started on|began)\b/i, strength: 0.9 },
  { status: 'historical', pattern: /\b(history of|h\/o|prior history|past medical history|previous|remote history|prior)\b/i, strength: 0.7 },
];

const NEGATION = /\b(denies|denied|no |not |without|negative for|no evidence of|no history of|never|absent|unremarkable|ruled out|non-)\b/i;

export interface StatusResult {
  status: FactStatus;
  cue?: string;
  /** Two different cues disagreed — worth flagging. */
  ambiguous: boolean;
  /** The status came from the section heading, not from the sentence. */
  sectionDerived: boolean;
  negated: boolean;
}

const SECTION_STATUS: Partial<Record<SectionKind, FactStatus>> = {
  current_medications: 'active',
  discontinued_medications: 'discontinued',
  medication_history: 'historical',
  immunizations: 'completed',
  procedures: 'completed',
  problem_list: 'active',
  allergies: 'active',
  social_history: 'historical',
  family_history: 'historical',
  history: 'historical',
};

/** Bounds of the line containing a span. Status cues must not cross lines. */
function lineBounds(text: string, start: number, end: number): [number, number] {
  const before = text.lastIndexOf('\n', Math.max(0, start - 1));
  const lineStart = before === -1 ? 0 : before + 1;
  const after = text.indexOf('\n', end);
  const lineEnd = after === -1 ? text.length : after;
  return [lineStart, lineEnd];
}

/**
 * Resolve the status of an assertion from the text around it, falling back to
 * the section it sits in. Explicit sentence-level cues always beat headings,
 * because headings are stale more often than sentences are.
 *
 * The cue window is deliberately the current *line*, not a character radius: a
 * radius would let "medication discontinued" from the previous sentence turn a
 * resolved condition into a discontinued one.
 */
export function detectStatus(
  text: string,
  start: number,
  end: number,
  sectionKind: SectionKind | undefined,
  factType: FactType,
): StatusResult {
  const [cs, ce] = clauseAround(text, start, end);
  const clause = text.slice(cs, ce);
  const [ls, le] = lineBounds(text, start, end);
  const window = text.slice(ls, le);

  const hits = STATUS_CUES.filter((cue) => cue.pattern.test(window)).sort((a, b) => b.strength - a.strength);
  const negated = NEGATION.test(clause) && factType !== 'allergy';

  if (hits.length > 0) {
    const distinct = new Set(hits.map((h) => h.status));
    const chosen = hits[0];
    return {
      status: chosen.status,
      cue: clause.trim(),
      ambiguous: distinct.size > 1,
      sectionDerived: false,
      negated,
    };
  }

  const fromSection = sectionKind ? SECTION_STATUS[sectionKind] : undefined;
  if (fromSection) {
    return { status: fromSection, sectionDerived: true, ambiguous: false, negated };
  }

  const fallback: FactStatus =
    factType === 'condition' ? 'active'
    : factType === 'medication' ? 'unknown'
    : factType === 'procedure' ? 'completed'
    : factType === 'allergy' ? 'active'
    : factType === 'immunization' ? 'completed'
    : 'unknown';

  return { status: fallback, sectionDerived: false, ambiguous: true, negated };
}

/** Dose + frequency reading for medication lines. */
export interface DoseInfo {
  dose?: number;
  doseUnit?: string;
  route?: string;
  frequency?: string;
  asNeeded: boolean;
  raw?: string;
}

const FREQUENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(once|one time|1)\s*(?:a|per)\s*day\b/i, 'once daily'],
  [/\b(twice|two times|2)\s*(?:a|per)\s*day\b/i, 'twice daily'],
  [/\b(three times|3 times)\s*(?:a|per)\s*day\b/i, 'three times daily'],
  [/\b(four times|4 times)\s*(?:a|per)\s*day\b/i, 'four times daily'],
  [/\b(q\.?d\.?|daily|every day|q24h|qam|every morning)\b/i, 'once daily'],
  [/\b(b\.?i\.?d\.?)\b/i, 'twice daily'],
  [/\b(t\.?i\.?d\.?)\b/i, 'three times daily'],
  [/\b(q\.?i\.?d\.?)\b/i, 'four times daily'],
  [/\b(qhs|at bedtime|before bed|nightly|every night)\b/i, 'at bedtime'],
  [/\b(every\s+\d+\s+hours|q\d+h)\b/i, 'interval dosing'],
  [/\b(weekly|once a week|every week)\b/i, 'weekly'],
  [/\b(every other day|qod)\b/i, 'every other day'],
  [/\b(monthly|once a month|every month)\b/i, 'monthly'],
  [/\b(as needed|as required|prn)\b/i, 'as needed'],
];

export function detectDose(text: string, start: number, end: number): DoseInfo {
  const [cs, ce] = clauseAround(text, start, end);
  const clause = text.slice(cs, ce);
  const doseMatch = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|units?|iu|mL|ml|%|mg\/ml)\b/i.exec(clause);
  const routeMatch = /\b(po|by mouth|oral|topical|inhaled|inhalation|subcutaneous|subq|sq|im|iv|intramuscular|intravenous|nasal|ophthalmic|transdermal)\b/i.exec(clause);
  let frequency: string | undefined;
  for (const [pattern, label] of FREQUENCY_PATTERNS) {
    if (pattern.test(clause)) {
      frequency = label;
      break;
    }
  }
  const asNeeded = /\b(as needed|as required|prn)\b/i.test(clause);
  return {
    dose: doseMatch ? Number(doseMatch[1]) : undefined,
    doseUnit: doseMatch ? doseMatch[2].toLowerCase() : undefined,
    route: routeMatch ? routeMatch[1].toLowerCase() : undefined,
    frequency,
    asNeeded,
    raw: clause.trim(),
  };
}

