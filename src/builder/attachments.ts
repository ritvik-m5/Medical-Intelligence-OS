import type { DocKind } from '../engine/types';
import { inferDocumentDate, type DocumentInput } from '../engine/ingest';

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/*                                                                    */
/* A file becomes a DocumentInput, which is the same thing the built-in */
/* corpus produces. From that point on it is indistinguishable from any */
/* other document: same extractors, same provenance, same rules.        */
/*                                                                    */
/* Two things are refused rather than faked. Files with no text layer   */
/* are rejected because there is nothing to anchor a span to, and FHIR  */
/* bundles are pointed at the Interop view, which imports them with     */
/* their provenance extensions intact instead of flattening them here.  */
/* ------------------------------------------------------------------ */

export interface AcceptedAttachment {
  input: DocumentInput;
  /** The name the file had on disk, kept so the interface can show it. */
  filename: string;
  bytes: number;
  /** How the document kind was decided. */
  kindSource: 'filename' | 'content' | 'fallback' | 'manual';
  /** Why that kind was chosen. Shown to the user, who can override it. */
  because: string;
  /** Characters of text that will actually be read. */
  characters: number;
}

export interface RejectedAttachment {
  filename: string;
  reason: string;
}

export interface AttachmentReadResult {
  accepted: AcceptedAttachment[];
  rejected: RejectedAttachment[];
}

/** Extensions the reader can turn into text. */
const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.tsv', '.text', '.log'];

/** Extensions that are refused with a specific reason rather than a shrug. */
const REFUSALS: Record<string, string> = {
  '.pdf': 'PDFs need their text layer extracted before the engine can anchor a span to them.',
  '.doc': 'Word documents need converting to text first.',
  '.docx': 'Word documents need converting to text first.',
  '.png': 'Images have no text for the engine to read.',
  '.jpg': 'Images have no text for the engine to read.',
  '.jpeg': 'Images have no text for the engine to read.',
  '.heic': 'Images have no text for the engine to read.',
  '.xlsx': 'Spreadsheets need exporting to CSV first.',
  '.xls': 'Spreadsheets need exporting to CSV first.',
  '.zip': 'Archives are not unpacked here.',
  '.json':
    'JSON is not read as a document. A FHIR bundle goes through the Interop view, where its provenance extensions survive.',
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

/**
 * Guess a facility name from the first non-empty line of a document.
 *
 * Many records open with the institution's letterhead ("NORTHSIDE
 * LABORATORIES", "Riverbend Family Medicine"). A line is only returned when it
 * looks like a name rather than a patient, a date, or a section heading.
 */
export function inferFacility(text: string): string | undefined {
  const first = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!first) return undefined;
  if (first.length > 60) return undefined;
  if (
    /\b(patient|dob|date|report|summary|note|section|admission|discharge|collected|service)\b/i.test(
      first,
    )
  ) {
    return undefined;
  }
  return first;
}

/* ------------------------------------------------------------------ */
/* Document kind inference                                             */
/* ------------------------------------------------------------------ */

interface KindGuess {
  kind: DocKind;
  source: 'filename' | 'content' | 'fallback';
  because: string;
}

const CONTENT_RULES: Array<{ kind: DocKind; patterns: RegExp[]; because: string }> = [
  {
    kind: 'questionnaire',
    patterns: [/health history questionnaire/i, /please fill out/i],
    because: 'the text is a completed questionnaire',
  },
  {
    kind: 'lab_report',
    patterns: [
      /reference range/i,
      /\b(?:HbA1c|haemoglobin a1c|LDL|HDL|creatinine|TSH|eGFR)\b/,
      /^\s*(?:result|analyte|test)\s*[:|]/im,
    ],
    because: 'the text contains laboratory results or reference ranges',
  },
  {
    kind: 'imaging_report',
    patterns: [/^\s*(?:impression|findings)\s*:/im, /\bradiograph\b|\bMRI\b|\bCT scan\b/i],
    because: 'the text has imaging report headings',
  },
  {
    kind: 'discharge_summary',
    patterns: [/discharge (?:summary|diagnosis)/i, /admitted on/i, /hospital course/i],
    because: 'the text reads like a discharge summary',
  },
  {
    kind: 'visit_note',
    patterns: [/chief complaint/i, /date of service/i, /history of present illness/i],
    because: 'the text reads like a clinic visit note',
  },
  {
    kind: 'medication_list',
    patterns: [
      /^\s*(?:current\s+)?medications?\b/im,
      /^\s*Rx\b/im,
      /discharge medications/i,
      /\bmg\s+(?:once|twice|three times)\s+daily\b/i,
    ],
    because: 'the text reads like a medication list',
  },
  {
    kind: 'wearable_summary',
    patterns: [/\bsteps\b/i, /resting heart rate/i, /\bsleep (?:score|duration)\b/i],
    because: 'the text contains device or wearable measurements',
  },
  {
    kind: 'procedure_note',
    patterns: [/procedure (?:note|performed)/i, /\bcolonoscopy\b|\bbiopsy\b|\bsutures?\b/i],
    because: 'the text describes a procedure',
  },
  {
    kind: 'vaccination_record',
    patterns: [/immuni[sz]ation/i, /\bvaccin/i, /\bCVX\b/],
    because: 'the text mentions immunizations or vaccines',
  },
  {
    kind: 'allergy_record',
    patterns: [/^\s*allergies\b/im, /drug allergy/i, /\ballerg(?:y|ies)\s*:/i],
    because: 'the text has an allergy section',
  },
];

const FILENAME_RULES: Array<{ kind: DocKind; patterns: RegExp[] }> = [
  { kind: 'vaccination_record', patterns: [/vacc|immun/i] },
  { kind: 'allergy_record', patterns: [/allerg/i] },
  { kind: 'medication_list', patterns: [/med|rx|prescription/i] },
  { kind: 'lab_report', patterns: [/lab|bloods?|panel|result/i] },
  { kind: 'imaging_report', patterns: [/xray|x-ray|mri|ct|scan|imaging|radiology/i] },
  { kind: 'discharge_summary', patterns: [/discharge|admission|summary/i] },
  { kind: 'wearable_summary', patterns: [/wearable|watch|fitbit|steps|device/i] },
  { kind: 'pathology_report', patterns: [/patholog|histolog|biopsy/i] },
];

/**
 * Decide how to read a document.
 *
 * Content wins over filename, because a file called `notes.txt` containing a
 * medication list is a medication list. The reasoning is returned so the
 * interface can show it and the reader can disagree.
 */
export function inferDocKind(text: string, filename: string): KindGuess {
  for (const rule of CONTENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return { kind: rule.kind, source: 'content', because: rule.because };
    }
  }

  const base = filename.toLowerCase();
  for (const rule of FILENAME_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(base))) {
      return {
        kind: rule.kind,
        source: 'filename',
        because: 'the filename contains a clue, and the text did not',
      };
    }
  }

  return {
    kind: 'visit_note',
    source: 'fallback',
    because: 'nothing in the text or the filename identified a more specific kind',
  };
}

/** A date stamped in the filename, when the file itself was named that way. */
export function dateFromFilename(filename: string): string | undefined {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(filename);
  return match?.[1];
}

/** A readable title for a document that arrived as a file. */
export function titleFromFilename(filename: string): string {
  const stem = filename
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{1,2}[-_]/, '')
    .replace(/\d{4}-\d{2}-\d{2}[-_]?/, '');
  const cleaned = stem
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return filename.replace(/\.[^.]+$/, '');
  return cleaned.replace(/^./, (character) => character.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** Beyond this a "document" is probably a database dump, not a record. */
export const MAX_ATTACHMENT_BYTES = 2_000_000;
/** More than this and the preview stops being readable. */
export const MAX_ATTACHMENTS = 12;

async function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsText(file);
  });
}

/**
 * Turn dropped or chosen files into documents.
 *
 * Rejections carry a reason, because "unsupported file" tells the reader nothing
 * about what to do next. Nothing here silently skips a file.
 */
export async function readAttachments(files: ArrayLike<File>): Promise<AttachmentReadResult> {
  const accepted: AcceptedAttachment[] = [];
  const rejected: RejectedAttachment[] = [];
  const list = Array.from(files);

  for (const file of list) {
    if (accepted.length >= MAX_ATTACHMENTS) {
      rejected.push({
        filename: file.name,
        reason: `Only ${MAX_ATTACHMENTS} documents are read at once.`,
      });
      continue;
    }

    const extension = extensionOf(file.name);
    const refusal = REFUSALS[extension];
    if (refusal) {
      rejected.push({ filename: file.name, reason: refusal });
      continue;
    }

    if (extension && !TEXT_EXTENSIONS.includes(extension)) {
      rejected.push({
        filename: file.name,
        reason: `Only text documents are read (${TEXT_EXTENSIONS.join(', ')}).`,
      });
      continue;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      rejected.push({
        filename: file.name,
        reason: `The file is ${Math.round(file.size / 1000)} kB; the limit is ${MAX_ATTACHMENT_BYTES / 1000} kB.`,
      });
      continue;
    }

    let text: string;
    try {
      text = await readText(file);
    } catch (error) {
      rejected.push({
        filename: file.name,
        reason: error instanceof Error ? error.message : 'The file could not be read.',
      });
      continue;
    }

    if (text.trim().length === 0) {
      rejected.push({
        filename: file.name,
        reason: 'The file is empty, so there is nothing to extract.',
      });
      continue;
    }

    // A NUL byte means this is not text, whatever the extension claimed.
    if (text.includes('\u0000')) {
      rejected.push({
        filename: file.name,
        reason: 'The file contains binary data and is not readable as text.',
      });
      continue;
    }

    const guess = inferDocKind(text, file.name);
    accepted.push({
      input: {
        title: titleFromFilename(file.name),
        kind: guess.kind,
        date: dateFromFilename(file.name) ?? inferDocumentDate(text),
        facility: inferFacility(text),
        origin: 'upload',
        text,
        fileName: file.name,
      },
      filename: file.name,
      bytes: file.size,
      kindSource: guess.source,
      because: guess.because,
      characters: text.length,
    });
  }

  return { accepted, rejected };
}

/** Re-read one attachment as a different kind, after the reader corrects it. */
export function retypeAttachment(
  attachment: AcceptedAttachment,
  kind: DocKind,
): AcceptedAttachment {
  return {
    ...attachment,
    input: { ...attachment.input, kind },
    kindSource: 'manual',
    because: 'you set this kind directly',
  };
}
