import type { DocumentInput } from '../engine/ingest';
import type { HealthGraph, Patient } from '../engine/types';
import { ingestDocument } from '../engine/ingest';
import { buildGraph } from '../engine/graph';
import { SAMPLE_DOCUMENTS_A } from './sampleCorpus1';
import { SAMPLE_DOCUMENTS_B } from './sampleCorpus2';
import { SAMPLE_DOCUMENTS_C } from './sampleCorpus3';
import { SAMPLE_DOCUMENTS_D } from './sampleCorpus4';
import { SAMPLE_DOCUMENTS_E } from './sampleCorpus5';
import { SAMPLE_DOCUMENTS_F } from './sampleCorpus6';

import { SAMPLE_PATIENT as PATIENT } from './sampleCorpus1';

export const SAMPLE_PATIENT: Patient = PATIENT;

/** The full synthetic corpus, chronological. */
export const SAMPLE_DOCUMENTS: DocumentInput[] = [
  ...SAMPLE_DOCUMENTS_A,
  ...SAMPLE_DOCUMENTS_B,
  ...SAMPLE_DOCUMENTS_C,
  ...SAMPLE_DOCUMENTS_D,
  ...SAMPLE_DOCUMENTS_E,
  ...SAMPLE_DOCUMENTS_F,
].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

/** Ingest the whole corpus and build the graph. Used by the app and by tests. */
export function buildSampleGraph(patient?: Patient): HealthGraph {
  const p = patient ?? SAMPLE_PATIENT;
  const results = SAMPLE_DOCUMENTS.map((doc, index) => ingestDocument(doc, index));
  return buildGraph(p, results);
}

export function ingestSampleDocument(index: number) {
  return ingestDocument(SAMPLE_DOCUMENTS[index], index);
}
