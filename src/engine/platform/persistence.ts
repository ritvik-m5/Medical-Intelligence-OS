import type { HealthGraph } from '../types';

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/*                                                                    */
/* Versioned, pluggable storage. The version number is stored with the  */
/* payload so a future schema can migrate rather than silently fail,    */
/* and the backend is an interface so the same code runs against        */
/* localStorage, memory, or a server without changing a line.           */
/* ------------------------------------------------------------------ */

export const STORAGE_VERSION = 1;
export const STORAGE_KEY = 'medical-memory.record.v1';

export interface StorageBackend {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  available(): boolean;
}

export class MemoryBackend implements StorageBackend {
  private data = new Map<string, string>();
  read(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.data.set(key, value);
  }
  remove(key: string): void {
    this.data.delete(key);
  }
  available(): boolean {
    return true;
  }
}

export class LocalStorageBackend implements StorageBackend {
  available(): boolean {
    try {
      const probe = '__mm_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }
  read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota or privacy mode; reported by available() */
    }
  }
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export interface PersistedRecord {
  version: number;
  savedAt: string;
  patientId: string;
  patientName: string;
  /** The raw document inputs, not the derived graph: derivation is deterministic. */
  documents: Array<{
    title: string;
    kind: string;
    date?: string;
    facility?: string;
    author?: string;
    text: string;
    origin: string;
  }>;
}

export interface LoadResult {
  record: PersistedRecord | null;
  status: 'loaded' | 'empty' | 'version-mismatch' | 'corrupt';
  message: string;
}

/**
 * Persist the corpus, not the graph.
 *
 * Storing the graph would mean storing a derived artefact that can drift from
 * its inputs. Storing the documents and re-deriving on load guarantees the graph
 * is always a faithful function of the record, which is the same invariant the
 * rest of the platform depends on.
 */
export function saveRecord(
  backend: StorageBackend,
  graph: HealthGraph,
  documents: PersistedRecord['documents'],
  key = STORAGE_KEY,
): { ok: boolean; message: string } {
  if (!backend.available()) {
    return { ok: false, message: 'Storage is unavailable in this browser context.' };
  }
  const payload: PersistedRecord = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    patientId: graph.patient.id,
    patientName: graph.patient.name,
    documents,
  };
  backend.write(key, JSON.stringify(payload));
  return { ok: true, message: `Saved ${documents.length} documents locally.` };
}

export function loadRecord(backend: StorageBackend, key = STORAGE_KEY): LoadResult {
  if (!backend.available()) {
    return { record: null, status: 'empty', message: 'Storage is unavailable in this browser context.' };
  }
  const raw = backend.read(key);
  if (!raw) return { record: null, status: 'empty', message: 'No saved record found.' };
  try {
    const parsed = JSON.parse(raw) as PersistedRecord;
    if (typeof parsed.version !== 'number') {
      return { record: null, status: 'corrupt', message: 'Saved record has no version field.' };
    }
    if (parsed.version !== STORAGE_VERSION) {
      return {
        record: null,
        status: 'version-mismatch',
        message: `Saved record is schema v${parsed.version}; this build reads v${STORAGE_VERSION}. A migration is required rather than a silent load.`,
      };
    }
    if (!Array.isArray(parsed.documents)) {
      return { record: null, status: 'corrupt', message: 'Saved record has no documents array.' };
    }
    return {
      record: parsed,
      status: 'loaded',
      message: `Loaded ${parsed.documents.length} documents saved ${parsed.savedAt}.`,
    };
  } catch {
    return { record: null, status: 'corrupt', message: 'Saved record could not be parsed.' };
  }
}

export function clearRecord(backend: StorageBackend, key = STORAGE_KEY): void {
  backend.remove(key);
}
