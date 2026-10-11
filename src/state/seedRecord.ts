import { SAMPLE_DOCUMENTS } from '../data/sampleCorpus';
import { STORAGE_KEY, STORAGE_VERSION } from '../engine/platform/persistence';

/**
 * Seed the browser's persisted record with the sample corpus.
 *
 * The workspace no longer ships with a built-in record: it starts empty and
 * unlocks once documents are imported. Tests that exercise record-dependent
 * views seed the persisted corpus first, so the store restores a real record on
 * mount exactly as it would for a returning reader.
 */
export function seedSampleRecord(): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      patientId: 'synthetic-alex-morgan',
      patientName: 'Alex Morgan',
      documents: SAMPLE_DOCUMENTS,
    }),
  );
}

/** Remove any persisted record, returning the store to its empty state. */
export function clearSeededRecord(): void {
  localStorage.removeItem(STORAGE_KEY);
}
