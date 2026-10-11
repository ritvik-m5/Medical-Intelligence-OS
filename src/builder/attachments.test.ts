// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENTS,
  dateFromFilename,
  extensionOf,
  inferDocKind,
  inferFacility,
  readAttachments,
  retypeAttachment,
  titleFromFilename,
} from './attachments';

/* Attachment tests.
 *
 * Two things are being defended here. First, that a file really does become the
 * same kind of object as a built-in document. Second, that every refusal carries
 * a reason the reader can act on, because silently dropping a file is the worst
 * possible behaviour for an import. */

function file(text: string, name: string, type = 'text/plain'): File {
  return new File([text], name, { type });
}

describe('document kind inference', () => {
  it('reads a medication list as a medication list', () => {
    const guess = inferDocKind(
      'Current medications:\n- Atorvastatin 20 mg at night\n- Metformin 1 g twice daily',
      'notes.txt',
    );
    expect(guess.kind).toBe('medication_list');
    expect(guess.source).toBe('content');
  });

  it('reads a lab report as a lab report', () => {
    const guess = inferDocKind(
      'Analyte | Result | Reference range\nHbA1c | 6.4 % | 4.0-5.6',
      'results.txt',
    );
    expect(guess.kind).toBe('lab_report');
  });

  it('reads an allergy section as an allergy record', () => {
    expect(inferDocKind('Allergies:\nPenicillin — rash', 'a.txt').kind).toBe('allergy_record');
  });

  it('reads an immunization list as a vaccination record', () => {
    expect(inferDocKind('Immunizations given: influenza vaccine', 'a.txt').kind).toBe(
      'vaccination_record',
    );
  });

  it('reads an imaging report as an imaging report', () => {
    expect(inferDocKind('Findings: no acute abnormality.', 'a.txt').kind).toBe('imaging_report');
  });

  it('reads a discharge summary as a discharge summary', () => {
    expect(inferDocKind('Discharge summary\nAdmitted on 2024-02-03', 'a.txt').kind).toBe(
      'discharge_summary',
    );
  });

  it('reads device data as a wearable summary', () => {
    expect(inferDocKind('Steps: 8,412\nResting heart rate: 58 bpm', 'a.txt').kind).toBe(
      'wearable_summary',
    );
  });

  it('reads the five Downloads records as the right kinds', () => {
    expect(
      inferDocKind('Health History Questionnaire\nplease fill out\nALLERGIES\nPenicillin', '01-2023-10-19-health-history.txt')
        .kind,
    ).toBe('questionnaire');
    expect(
      inferDocKind('Hospital Discharge Summary\nHospital course\nAllergies: Penicillin', '02-2025-03-11-discharge-summary.txt')
        .kind,
    ).toBe('discharge_summary');
    expect(
      inferDocKind('Date of Service: 02/18/2026\nChief Complaint\nCurrent medications:\nMetformin', '03-2026-02-18-annual-visit.txt')
        .kind,
    ).toBe('visit_note');
    expect(
      inferDocKind('Current medications:\n- Atorvastatin 40 mg at bedtime', '04-2026-06-24-medication-list.txt')
        .kind,
    ).toBe('medication_list');
    expect(
      inferDocKind('LDL Cholesterol 132\nHbA1c 6.6\nReference range 4.0-5.6', '05-2026-09-15-lipid-panel.txt').kind,
    ).toBe('lab_report');
  });

  it('lets the content override the filename', () => {
    // A file called lab-results.txt containing a medication list is a medication
    // list. The content is what will actually be extracted.
    const guess = inferDocKind('Current medications:\n- Metformin 500 mg', 'lab-results.txt');
    expect(guess.kind).toBe('medication_list');
    expect(guess.source).toBe('content');
  });

  it('falls back to the filename when the text gives nothing away', () => {
    const guess = inferDocKind('Seen today. Feeling well.', 'discharge-2024.txt');
    expect(guess.kind).toBe('discharge_summary');
    expect(guess.source).toBe('filename');
  });

  it('says so when it had to guess, rather than pretending', () => {
    const guess = inferDocKind('Seen today. Feeling well.', 'notes.txt');
    expect(guess.kind).toBe('visit_note');
    expect(guess.source).toBe('fallback');
    expect(guess.because).toContain('nothing in the text');
  });
});

describe('titles and extensions', () => {
  it('turns a filename into a readable title', () => {
    expect(titleFromFilename('2024-03-11_lab-results.txt')).toBe('Lab results');
    expect(titleFromFilename('01-2023-10-19-health-history.txt')).toBe('Health history');
  });

  it('reads a date stamped in the filename', () => {
    expect(dateFromFilename('01-2023-10-19-health-history.txt')).toBe('2023-10-19');
    expect(dateFromFilename('notes.txt')).toBeUndefined();
  });

  it('reads extensions case-insensitively', () => {
    expect(extensionOf('Report.PDF')).toBe('.pdf');
    expect(extensionOf('no-extension')).toBe('');
  });
});

describe('reading files', () => {
  it('accepts a text document and gives it a kind', async () => {
    const result = await readAttachments([
      file('Current medications:\n- Metformin 1 g twice daily', 'meds.txt'),
    ]);

    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    const accepted = result.accepted[0];
    expect(accepted.input.kind).toBe('medication_list');
    expect(accepted.input.origin).toBe('upload');
    expect(accepted.input.text).toContain('Metformin');
    expect(accepted.filename).toBe('meds.txt');
    expect(accepted.characters).toBeGreaterThan(0);
  });

  it('refuses a PDF with a reason the reader can act on', async () => {
    const result = await readAttachments([file('not really a pdf', 'scan.pdf')]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toContain('text layer');
  });

  it('sends JSON to the Interop view rather than flattening it', async () => {
    const result = await readAttachments([file('{"resourceType":"Bundle"}', 'export.json')]);
    expect(result.rejected[0].reason).toContain('Interop view');
  });

  it('refuses an image', async () => {
    const result = await readAttachments([file('x', 'photo.png')]);
    expect(result.rejected[0].reason).toContain('no text');
  });

  it('refuses an empty file', async () => {
    const result = await readAttachments([file('   \n  ', 'blank.txt')]);
    expect(result.rejected[0].reason).toContain('empty');
  });

  it('refuses a file that is not really text', async () => {
    const result = await readAttachments([file('text\u0000then binary', 'weird.txt')]);
    expect(result.rejected[0].reason).toContain('binary data');
  });

  it('refuses a file that is too large', async () => {
    const huge = file('a'.repeat(10), 'huge.txt');
    Object.defineProperty(huge, 'size', { value: 5_000_000 });
    const result = await readAttachments([huge]);
    expect(result.rejected[0].reason).toContain('limit');
  });

  it('caps how many documents it will read, and says why', async () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, index) =>
      file(`Visit note ${index}`, `note-${index}.txt`),
    );
    const result = await readAttachments(files);
    expect(result.accepted).toHaveLength(MAX_ATTACHMENTS);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].reason).toContain(`${MAX_ATTACHMENTS} documents`);
  });

  it('reports accepted and rejected files together rather than stopping', async () => {
    const result = await readAttachments([
      file('Current medications:\n- Aspirin 75 mg once daily', 'meds.txt'),
      file('x', 'scan.pdf'),
      file('Reference range 4.0-5.6\nHbA1c 6.1', 'labs.txt'),
    ]);

    expect(result.accepted.map((entry) => entry.input.kind)).toEqual([
      'medication_list',
      'lab_report',
    ]);
    expect(result.rejected).toHaveLength(1);
  });
});

describe('correcting the kind', () => {
  it('retypes an attachment and records that the reader did it', async () => {
    const result = await readAttachments([file('Seen today. Well.', 'notes.txt')]);
    const corrected = retypeAttachment(result.accepted[0], 'lab_report');

    expect(corrected.input.kind).toBe('lab_report');
    expect(corrected.kindSource).toBe('manual');
    expect(corrected.because).toContain('you set this kind');
    // The original is untouched.
    expect(result.accepted[0].input.kind).toBe('visit_note');
  });
});

describe('auto-filling metadata on drop', () => {
  it('infers the facility from the letterhead', () => {
    expect(inferFacility('NORTHSIDE LABORATORIES\nLipid Panel\nPatient: Alex Morgan')).toBe(
      'NORTHSIDE LABORATORIES',
    );
    expect(inferFacility('Riverbend Family Medicine\nAnnual Visit')).toBe(
      'Riverbend Family Medicine',
    );
  });

  it('does not mistake a patient or date line for a facility', () => {
    expect(inferFacility('Patient: Alex Morgan\nDOB: 04/12/1979')).toBeUndefined();
    expect(inferFacility('Collected: 09/15/2026\nLIPID PANEL')).toBeUndefined();
  });

  it('reads the date from the content when the filename has none', async () => {
    const result = await readAttachments([
      file('NORTHSIDE LABORATORIES\nLipid Panel\nCollected: 09/15/2026\nLDL 132', '01_lipid_panel.txt'),
    ]);

    const input = result.accepted[0].input;
    expect(input.date).toBe('2026-09-15');
    expect(input.facility).toBe('NORTHSIDE LABORATORIES');
    expect(input.kind).toBe('lab_report');
  });
});
