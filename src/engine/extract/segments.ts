import type { DocSection, SectionKind, SourceDocument } from '../types';
import { sectionId } from '../ids';

interface HeadingRule {
  kind: SectionKind;
  pattern: RegExp;
}

/**
 * Section headings, in priority order. Section context is one of the strongest
 * provenance signals we have: "Atorvastatin" under *Current Medications* and
 * under *Discontinued Medications* are the same string but opposite facts.
 */
const HEADING_RULES: HeadingRule[] = [
  { kind: 'discontinued_medications', pattern: /^(discontinued|prior|previous|past)\s+(medications?|meds?|drugs?)\b/i },
  { kind: 'discontinued_medications', pattern: /^(medications?|meds?|drugs?)\s+(discontinued|stopped|not\s+continued)\b/i },
  { kind: 'current_medications', pattern: /^(current|active|home|outpatient|discharge|prescribed)\s+(medications?|meds?|drugs?|prescriptions?)\b/i },
  { kind: 'current_medications', pattern: /^(medications on file|current medication list|active medication list|medication list|prescription list|drug list|medications?|meds?)\b/i },
  { kind: 'medication_history', pattern: /^medication\s+(history|reconciliation|changes?)\b/i },
  { kind: 'allergies', pattern: /^(allergies on file|allergies and intolerances|allergies\s*\/\s*intolerances?|drug allergies|known allergies|allergy list|allergies|allergy|intolerances?|adverse reactions?)\b/i },
  { kind: 'problem_list', pattern: /^(problem list|active problems?|problems?|diagnoses|diagnosis list|conditions?|active diagnoses)\b/i },
  { kind: 'assessment', pattern: /^(assessment|assessment\s*\/\s*plan|a\s*\/\s*p|clinical impression)\b/i },
  { kind: 'plan', pattern: /^(plan|treatment plan|recommendations?|orders|management)\b/i },
  { kind: 'results', pattern: /^(results?|lab results?|laboratory|lab data|labs|test results?|lab values?|chemistry|hematology|lipid panel|cbc|cmp|bmp)\b/i },
  { kind: 'vitals', pattern: /^(vital signs?|vitals|vital measurements|measurements)\b/i },
  { kind: 'immunizations', pattern: /^(immunizations?|vaccinations?|vaccine record|immunization record|vaccine history)\b/i },
  { kind: 'procedures', pattern: /^(procedures?|procedures performed|surgical history|surgeries|operations)\b/i },
  { kind: 'social_history', pattern: /^(social history|social history and habits|health habits|lifestyle|social factors)\b/i },
  { kind: 'family_history', pattern: /^(family history)\b/i },
  { kind: 'history', pattern: /^(history|history of present illness|hpi|past medical history|pmh|past history|medical history|chief complaint|reason for visit|interval history)\b/i },
  { kind: 'impression', pattern: /^(impression|findings|conclusion|interpretation|summary)\b/i },
  { kind: 'instructions', pattern: /^(instructions?|patient instructions?|follow[- ]?up|return precautions|disposition)\b/i },
  { kind: 'header', pattern: /^(patient information|demographics|patient demographics|administrative)\b/i },
];

export interface HeadingMatch {
  kind: SectionKind;
  /** Offset in the line immediately after the heading (and its colon, if present). */
  headingEnd: number;
}

/**
 * Match a section heading at the start of a line.
 *
 * The important subtlety: "Current Medications: Lisinopril 10 mg daily" is a
 * heading *and* content on one line. Treating the whole line as a heading would
 * silently discard the medication, so the heading and the remainder are split.
 */
export function matchHeading(line: string): HeadingMatch | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (/[.;]$/.test(trimmed)) return null;

  for (const rule of HEADING_RULES) {
    const m = rule.pattern.exec(trimmed);
    if (!m) continue;
    if (m[0].length > 40) continue;
    const rest = trimmed.slice(m[0].length);
    const base = line.indexOf(m[0]) + m[0].length;
    if (rest.trim() === '') return { kind: rule.kind, headingEnd: base };
    if (rest.trimStart().startsWith(':')) {
      const colon = line.indexOf(':', base);
      return { kind: rule.kind, headingEnd: colon >= 0 ? colon + 1 : base };
    }
  }
  return null;
}

function headingKind(line: string): SectionKind | null {
  return matchHeading(line)?.kind ?? null;
}

export interface Segment {
  text: string;
  start: number;
  end: number;
  /** 0-based line number. */
  line: number;
  section?: DocSection;
}

export function buildSections(docIdValue: string, text: string): DocSection[] {
  const sections: DocSection[] = [];
  const lines = splitLines(text);
  let current: DocSection | null = null;
  for (const line of lines) {
    const heading = matchHeading(line.text);
    if (!heading) continue;
    if (current) current.span[1] = line.start;
    current = {
      id: sectionId(docIdValue, line.start),
      kind: heading.kind,
      heading: line.text.trim().slice(0, heading.headingEnd - line.start).replace(/[:#]+$/, ''),
      span: [line.start, text.length],
    };
    sections.push(current);
  }
  return sections;
}

export interface TextLine {
  text: string;
  start: number;
  end: number;
  line: number;
}

export function splitLines(text: string): TextLine[] {
  const out: TextLine[] = [];
  let offset = 0;
  let index = 0;
  for (const raw of text.split('\n')) {
    out.push({ text: raw, start: offset, end: offset + raw.length, line: index });
    offset += raw.length + 1;
    index++;
  }
  return out;
}

/**
 * Break a document into analysis segments: one line at a time, except that a
 * wrapped continuation line is merged into the previous one when the previous
 * line has no trailing punctuation. Real reports wrap mid-sentence and splitting
 * there loses the value that belongs to the label.
 */
export function buildSegments(doc: SourceDocument): Segment[] {
  const lines = splitLines(doc.text);
  const segments: Segment[] = [];

  for (const line of lines) {
    if (!line.text.trim()) continue;
    const heading = matchHeading(line.text);
    if (heading) {
      const rest = line.text.slice(heading.headingEnd);
      if (rest.trim()) {
        segments.push({
          text: rest.trim(),
          start: line.start + heading.headingEnd + (rest.length - rest.trimStart().length),
          end: line.end,
          line: line.line,
        });
      }
      continue;
    }
    const prev = segments[segments.length - 1];
    const isContinuation =
      prev !== undefined &&
      prev.line === line.line - 1 &&
      prev.text.trim().length > 0 &&
      !/[.;:!?]$/.test(prev.text.trim()) &&
      /^[\s\u2022\-\*]/.test(line.text) &&
      prev.text.trim().length < 110;
    if (isContinuation) {
      prev.text = `${prev.text} ${line.text.trim()}`;
      prev.end = line.end;
    } else {
      segments.push({ text: line.text, start: line.start, end: line.end, line: line.line });
    }
  }

  for (const segment of segments) {
    segment.section = sectionAt(doc.sections, segment.start);
  }
  return segments;
}

export function sectionAt(sections: DocSection[], offset: number): DocSection | undefined {
  let found: DocSection | undefined;
  for (const section of sections) {
    if (offset >= section.span[0]) found = section;
    else break;
  }
  return found;
}

export { headingKind };

