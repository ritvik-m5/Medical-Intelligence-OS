import type { DocumentInput } from '../engine/ingest';
import type { HealthGraph, Patient } from '../engine/types';
import { ingestDocument } from '../engine/ingest';
import { buildGraph } from '../engine/graph';
import { SAMPLE_DOCUMENTS, SAMPLE_PATIENT } from './sampleCorpus';
import { SUBJECT_B_DOCUMENTS, SUBJECT_B_PATIENT, SUBJECT_C_PATIENT } from './cohortCorpus';
import { SUBJECT_C_DOCUMENTS } from './cohortCorpus2';

export { SUBJECT_B_PATIENT, SUBJECT_C_PATIENT, SUBJECT_B_DOCUMENTS, SUBJECT_C_DOCUMENTS };

function build(patient: Patient, documents: DocumentInput[], offset: number): HealthGraph {
  const results = documents.map((doc, index) => ingestDocument(doc, offset + index));
  return buildGraph(patient, results);
}

/** The primary subject, the one the main application works with. */
export function buildPrimaryGraph(): HealthGraph {
  return build(SAMPLE_PATIENT, SAMPLE_DOCUMENTS, 0);
}

export interface CohortEntry {
  id: string;
  label: string;
  graph: HealthGraph;
  documents: DocumentInput[];
}

/**
 * Three subjects with deliberately different record quality, so the cohort view
 * has something real to compare rather than three copies of the same shape.
 */
export function buildCohortGraphs(): CohortEntry[] {
  return [
    {
      id: SAMPLE_PATIENT.id,
      label: SAMPLE_PATIENT.name,
      graph: build(SAMPLE_PATIENT, SAMPLE_DOCUMENTS, 0),
      documents: SAMPLE_DOCUMENTS,
    },
    {
      id: SUBJECT_B_PATIENT.id,
      label: SUBJECT_B_PATIENT.name,
      graph: build(SUBJECT_B_PATIENT, SUBJECT_B_DOCUMENTS, 500),
      documents: SUBJECT_B_DOCUMENTS,
    },
    {
      id: SUBJECT_C_PATIENT.id,
      label: SUBJECT_C_PATIENT.name,
      graph: build(SUBJECT_C_PATIENT, SUBJECT_C_DOCUMENTS, 900),
      documents: SUBJECT_C_DOCUMENTS,
    },
  ];
}
