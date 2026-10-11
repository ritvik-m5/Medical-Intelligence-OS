import type { ArtifactIdentity } from '../identity';
import type { Severity } from '../derive/types';
import type { DocumentInput } from '../ingest';
import { STORAGE_KEY as CORPUS_KEY, type StorageBackend } from './persistence';
import type { BranchOperation } from './artifactStore';

/* ------------------------------------------------------------------ */
/* The run registry                                                    */
/*                                                                    */
/* Corpus persistence and run persistence are opposite boundaries, and */
/* the difference matters:                                              */
/*                                                                    */
/*   corpus   stores the INPUT. The graph is re-derived on load, so it  */
/*            can never drift from its sources.                         */
/*   run      stores a RESULT: the identity, a cache of the findings,   */
/*            and the corpus that produced it. The graph is still not   */
/*            stored.                                                   */
/*                                                                    */
/* So a saved run is a claim — "this corpus, this engine, this rule set */
/* produced these findings" — and opening it re-derives the graph and   */
/* checks the claim rather than trusting it.                            */
/*                                                                    */
/* That is why the cached findings are marked as a cache. They exist so */
/* the list is readable without re-deriving forty runs; they are        */
/* verified against a fresh derivation the moment one is opened.        */
/* ------------------------------------------------------------------ */

export const REGISTRY_SCHEMA = 1;
export const REGISTRY_KEY = 'medical-memory.runs.v1';

/** How many runs are kept. Beyond this the oldest go. */
export const MAX_RUNS = 40;

export interface StoredDocument {
  title: string;
  kind: string;
  date?: string;
  facility?: string;
  author?: string;
  text: string;
  origin: string;
}

export interface FindingSummary {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: number;
}

export interface StoredVerification {
  score: number;
  clean: boolean;
  factsQuoted: number;
  factsTotal: number;
  derivationsOrdered: number;
  derivationsTotal: number;
}

export interface StoredRun {
  schema: number;
  /**
   * The content address. Also the key.
   *
   * Two records with the same corpus, engine, effective rule set and result have
   * the same address and are therefore the same run — saving one twice replaces
   * rather than duplicates, and that falls out of the key rather than being
   * enforced by a comparison.
   */
  artifactId: string;
  identity: ArtifactIdentity;
  createdAt: string;
  /** What the reader called it. */
  label: string;
  /** Where it came from: which scenario, which prompt. */
  origin: { scenarioId: string; prompt: string };
  patientId: string;
  patientName: string;
  /** The corpus. The graph is re-derived from this, never stored. */
  documents: StoredDocument[];
  offset: number;
  /** Rules deliberately withheld for this run. Empty for a normal build. */
  suppressedRules: string[];
  /**
   * Documents deliberately excluded from this run, by title.
   *
   * Titles rather than indices, because a corpus is order-independent: an index
   * would silently point at a different document if the order changed.
   */
  withheldDocuments: string[];
  /**
   * The date the rules were evaluated as of.
   *
   * Stored because it is part of the question the run asked. Re-deriving a run
   * evaluated in 2024 under today's date would answer a different question and
   * call the difference a reproduction failure.
   */
  asOf: string;
  /** A cache, for listing without re-deriving. Verified on open. */
  findings: FindingSummary[];
  /** The provenance verdict at the time of saving. */
  verification: StoredVerification;
  /** Lineage, when this run came from another. */
  branch: {
    parentId: string | null;
    operation: BranchOperation;
    reason: string | null;
  };
}

export interface RegistrySaveResult {
  ok: boolean;
  message: string;
  /** The stored record, when it was kept. */
  run: StoredRun | null;
}

export interface RegistryLoadResult {
  runs: StoredRun[];
  status: 'loaded' | 'empty' | 'version-mismatch' | 'corrupt';
  message: string;
}

interface RegistryPayload {
  schema: number;
  savedAt: string;
  runs: StoredRun[];
}

/**
 * A durable list of runs.
 *
 * Pluggable over the same `StorageBackend` the corpus uses, so the same code runs
 * against localStorage, memory or a server without changing a line.
 */
export class RunRegistry {
  constructor(
    private readonly backend: StorageBackend,
    private readonly key = REGISTRY_KEY,
  ) {}

  load(): RegistryLoadResult {
    if (!this.backend.available()) {
      return {
        runs: [],
        status: 'empty',
        message: 'Storage is unavailable in this browser context, so no runs are kept.',
      };
    }

    const raw = this.backend.read(this.key);
    if (!raw) return { runs: [], status: 'empty', message: 'No saved runs yet.' };

    try {
      const parsed = JSON.parse(raw) as RegistryPayload;
      if (typeof parsed.schema !== 'number') {
        return { runs: [], status: 'corrupt', message: 'The run registry has no schema field.' };
      }
      if (parsed.schema !== REGISTRY_SCHEMA) {
        return {
          runs: [],
          status: 'version-mismatch',
          message: `Saved runs are schema v${parsed.schema}; this build writes v${REGISTRY_SCHEMA}. A migration is required rather than a silent load.`,
        };
      }
      if (!Array.isArray(parsed.runs)) {
        return { runs: [], status: 'corrupt', message: 'The run registry has no runs array.' };
      }
      return {
        runs: parsed.runs,
        status: 'loaded',
        message: `${parsed.runs.length} saved run${parsed.runs.length === 1 ? '' : 's'}.`,
      };
    } catch {
      return { runs: [], status: 'corrupt', message: 'The run registry could not be parsed.' };
    }
  }

  /** Write the whole list. The registry is small enough that partial writes are not worth it. */
  private write(runs: StoredRun[]): { ok: boolean; message: string } {
    if (!this.backend.available()) {
      return { ok: false, message: 'Storage is unavailable, so the run was not saved.' };
    }
    const payload: RegistryPayload = {
      schema: REGISTRY_SCHEMA,
      savedAt: new Date().toISOString(),
      runs,
    };
    this.backend.write(this.key, JSON.stringify(payload));
    return { ok: true, message: 'Saved.' };
  }

  /**
   * Keep a run.
   *
   * Keyed by content address, so saving the same run twice replaces rather than
   * duplicates without any comparison being needed: two runs with the same
   * address are the same run, because the address is what the run *is*.
   */
  save(run: StoredRun): RegistrySaveResult {
    const { runs } = this.load();
    const existing = runs.some((entry) => entry.artifactId === run.artifactId);
    const kept = [run, ...runs.filter((entry) => entry.artifactId !== run.artifactId)].slice(
      0,
      MAX_RUNS,
    );
    const written = this.write(kept);
    if (!written.ok) return { ok: false, message: written.message, run: null };
    return {
      ok: true,
      message: existing
        ? `${run.identity.id} was already saved, and has been updated.`
        : `${run.identity.id} saved. ${kept.length} run${kept.length === 1 ? '' : 's'} kept.`,
      run,
    };
  }

  get(artifactId: string): StoredRun | null {
    return this.load().runs.find((run) => run.artifactId === artifactId) ?? null;
  }

  remove(artifactId: string): void {
    const { runs } = this.load();
    this.write(runs.filter((run) => run.artifactId !== artifactId));
  }

  clear(): void {
    this.backend.remove(this.key);
  }

  /** True when the key holds runs this build understands. */
  hasRuns(): boolean {
    const result = this.load();
    return result.status === 'loaded' && result.runs.length > 0;
  }
}

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

export function toStoredDocument(input: DocumentInput): StoredDocument {
  return {
    title: input.title,
    kind: input.kind,
    date: input.date,
    facility: input.facility,
    author: input.author,
    text: input.text,
    origin: input.origin,
  };
}

/** Back to the input shape the pipeline reads. */
export function toDocumentInput(document: StoredDocument): DocumentInput {
  return {
    title: document.title,
    kind: document.kind as DocumentInput['kind'],
    date: document.date,
    facility: document.facility,
    author: document.author,
    text: document.text,
    origin: document.origin as DocumentInput['origin'],
  };
}

/** The key the corpus is stored under, so the two can be told apart. */
export const CORPUS_STORAGE_KEY = CORPUS_KEY;
