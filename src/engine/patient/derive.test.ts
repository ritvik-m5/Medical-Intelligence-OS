import { describe, expect, it } from 'vitest';
import { ingestDocument } from '../ingest';
import {
  cleanPatientName,
  derivePatientFromCorpus,
  extractNameFromText,
} from './derive';
import type { Patient } from '../types';

const BASE: Patient = { id: 'local-record', name: '', synthetic: false };

describe('cleanPatientName', () => {
  it('accepts a typical header name and strips trailing identifiers', () => {
    expect(cleanPatientName('Alex Morgan   MRN 44821')).toBe('Alex Morgan');
    expect(cleanPatientName('Alex Morgan')).toBe('Alex Morgan');
  });

  it('rejects placeholders and single tokens', () => {
    expect(cleanPatientName('unknown')).toBeNull();
    expect(cleanPatientName('Patient')).toBeNull();
  });
});

describe('extractNameFromText', () => {
  it('reads patient lines from messy documents', () => {
    const text = 'RIVERBEND FAMILY MEDICINE\n\nPatient : Alex Morgan\nDOB 4/12/1979\n';
    expect(extractNameFromText(text)).toBe('Alex Morgan');
  });
});

describe('derivePatientFromCorpus', () => {
  it('votes the most common name across documents', () => {
    const results = [
      ingestDocument({
        title: 'Visit',
        kind: 'visit_note',
        date: '2026-02-18',
        text: 'Patient: Alex Morgan\nRoutine follow-up.',
        origin: 'upload',
      }),
      ingestDocument({
        title: 'Labs',
        kind: 'lab_report',
        date: '2026-09-15',
        text: 'Patient: Alex Morgan\nLDL 132 mg/dL',
        origin: 'upload',
      }),
    ];

    const patient = derivePatientFromCorpus(BASE, results);
    expect(patient.name).toBe('Alex Morgan');
    expect(patient.id).toBe('local-alex-morgan');
  });

  it('derives date of birth from demographic facts', () => {
    const results = [
      ingestDocument({
        title: 'Questionnaire',
        kind: 'questionnaire',
        date: '2023-10-19',
        text: 'Patient : Alex Morgan\nDOB 4/12/1979\n',
        origin: 'upload',
      }),
    ];

    const patient = derivePatientFromCorpus(BASE, results);
    expect(patient.name).toBe('Alex Morgan');
    expect(patient.dateOfBirth).toBe('1979-04-12');
  });
});
