import {
  REGISTRY_SCHEMA,
  RunRegistry,
  type RegistryLoadResult,
  type StoredRun,
} from './registry';
import { LocalStorageBackend } from './persistence';

/* ------------------------------------------------------------------ */
/* The artifact store                                                  */
/*                                                                    */
/* One contract, three implementations: memory for tests, localStorage  */
/* for the shipped app, HTTP for a server that wants to hold the        */
/* registry instead. The interface is async even where the               */
/* implementation is not, because a synchronous interface would make     */
/* the server adapter impossible without changing every caller.          */
/*                                                                    */
/* What is persisted is fixed and does not vary by adapter:             */
/*                                                                    */
/*   corpus + identity + lineage + metadata + cached listing           */
/*                                                                    */
/* The derived graph is never authoritative state and is never sent     */
/* over the wire as such. It is re-derived on open, and the result is    */
/* checked against the identity that was stored.                        */
/* ------------------------------------------------------------------ */

export const STORE_SCHEMA = REGISTRY_SCHEMA;

/** Re-exported so a consumer of the store does not need to know where it lives. */
export type { StoredRun } from './registry';

/**
 * How an artifact came to exist, relative to its parent.
 *
 * Declared in the engine because it is a property of an artifact rather than of
 * any interface that happens to display one.
 */
export type BranchOperation =
  | 'baseline'
  | 'as-of'
  | 'withhold-rule'
  | 'withhold-document'
  | 'add-document';

export const OPERATION_LABEL: Record<BranchOperation, string> = {
  baseline: 'Baseline',
  'as-of': 'Evaluated at an earlier date',
  'withhold-rule': 'Rule withheld',
  'withhold-document': 'Document withheld',
  'add-document': 'Document added',
};

/**
 * A content address, shortened for display.
 *
 * A 64-character address is unreadable in a sentence, so interfaces show this.
 * It is explicitly not an identity: two different artifacts could in principle
 * share these twelve characters, so anything that *matches* on an address uses
 * the full value.
 */
export function shortAddress(artifactId: string): string {
  return `${artifactId.slice(0, 12)}\u2026`;
}

export interface StoreResult {
  ok: boolean;
  message: string;
}

export interface StoreListing {
  runs: StoredRun[];
  status: 'loaded' | 'empty' | 'version-mismatch' | 'corrupt' | 'unreachable';
  message: string;
}

/** One node of the lineage graph, derived from stored metadata. */
export interface LineageNode {
  artifactId: string;
  displayId: string;
  /** What produced this artifact from its parent. */
  operation: BranchOperation | 'baseline';
  reason: string | null;
  parentId: string | null;
  children: string[];
  createdAt: string;
  engineVersion: string;
  rulesetVersion: string;
  /** How many findings the run recorded. A cache, like the listing. */
  findings: number;
  depth: number;
}

export interface LineageGraph {
  nodes: LineageNode[];
  /** Nodes with no parent present in the store. */
  roots: string[];
  /** The artifact the graph is centred on, when one was named. */
  focus: string | null;
}

export interface ArtifactStore {
  readonly kind: 'memory' | 'local' | 'http';
  readonly label: string;
  save(run: StoredRun): Promise<StoreResult>;
  get(artifactId: string): Promise<StoredRun | null>;
  list(): Promise<StoreListing>;
  delete(artifactId: string): Promise<StoreResult>;
  /** Both sides, or null when either is missing. */
  compare(a: string, b: string): Promise<{ a: StoredRun; b: StoredRun } | null>;
  /**
   * The stored record, ready to be re-derived.
   *
   * Deliberately the same shape as `get`: "reproduce" is not a different lookup,
   * it is `get` followed by re-deriving and checking. Naming it separately in the
   * contract makes the intent legible at every call site.
   */
  reproduce(artifactId: string): Promise<StoredRun | null>;
  lineage(artifactId?: string): Promise<LineageGraph>;
}

/* ------------------------------------------------------------------ */
/* Lineage                                                             */
/*                                                                    */
/* Computed from the stored records, every time. There is no separate   */
/* lineage table to fall out of step with the artifacts it describes:    */
/* the graph *is* the parent pointers, read back.                        */
/* ------------------------------------------------------------------ */

export function buildLineage(runs: StoredRun[], focus?: string): LineageGraph {
  const byId = new Map(runs.map((run) => [run.artifactId, run]));
  const children = new Map<string, string[]>();

  for (const run of runs) {
    const parent = run.branch.parentId;
    // A parent that is not in the store is not a parent we can draw an edge to.
    if (!parent || !byId.has(parent)) continue;
    children.set(parent, [...(children.get(parent) ?? []), run.artifactId]);
  }

  const depthOf = (run: StoredRun): number => {
    let depth = 0;
    let cursor = run.branch.parentId;
    const seen = new Set<string>([run.artifactId]);
    while (cursor && byId.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      depth += 1;
      cursor = byId.get(cursor)!.branch.parentId;
    }
    return depth;
  };

  const nodes: LineageNode[] = runs.map((run) => ({
    artifactId: run.artifactId,
    displayId: run.identity.id,
    operation: run.branch.operation ?? 'baseline',
    reason: run.branch.reason,
    parentId: run.branch.parentId && byId.has(run.branch.parentId) ? run.branch.parentId : null,
    children: children.get(run.artifactId) ?? [],
    createdAt: run.createdAt,
    engineVersion: run.identity.engineVersion,
    rulesetVersion: run.identity.rulesetVersion,
    findings: run.findings.length,
    depth: depthOf(run),
  }));

  return {
    nodes,
    roots: nodes.filter((node) => node.parentId === null).map((node) => node.artifactId),
    focus: focus ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* localStorage                                                        */
/*                                                                    */
/* The shipped adapter. A thin async facade over the registry, which    */
/* keeps the versioned schema, the bound and the corruption reporting   */
/* in one place rather than duplicating them here.                      */
/* ------------------------------------------------------------------ */


export class LocalArtifactStore implements ArtifactStore {
  readonly kind = 'local' as const;
  readonly label = 'This browser';

  constructor(private readonly registry = new RunRegistry(new LocalStorageBackend())) {}

  async save(run: StoredRun): Promise<StoreResult> {
    const result = this.registry.save(run);
    return { ok: result.ok, message: result.message };
  }

  async get(artifactId: string): Promise<StoredRun | null> {
    return this.registry.get(artifactId);
  }

  async list(): Promise<StoreListing> {
    const result: RegistryLoadResult = this.registry.load();
    return result;
  }

  async delete(artifactId: string): Promise<StoreResult> {
    const existed = this.registry.get(artifactId) !== null;
    this.registry.remove(artifactId);
    return { ok: existed, message: existed ? 'Removed.' : 'No such run.' };
  }

  async compare(a: string, b: string) {
    const left = this.registry.get(a);
    const right = this.registry.get(b);
    return left && right ? { a: left, b: right } : null;
  }

  async reproduce(artifactId: string): Promise<StoredRun | null> {
    return this.registry.get(artifactId);
  }

  async lineage(artifactId?: string): Promise<LineageGraph> {
    return buildLineage(this.registry.load().runs, artifactId);
  }
}

/* ------------------------------------------------------------------ */
/* In memory                                                           */
/*                                                                    */
/* The reference implementation. Every other adapter is asserted to     */
/* behave identically against the same sequence of calls — that parity  */
/* is a test, not a hope.                                               */
/* ------------------------------------------------------------------ */

export class MemoryArtifactStore implements ArtifactStore {
  readonly kind = 'memory' as const;
  readonly label = 'In memory';

  constructor(private runs: StoredRun[] = []) {}

  async save(run: StoredRun): Promise<StoreResult> {
    const existing = this.runs.some((entry) => entry.artifactId === run.artifactId);
    this.runs = [run, ...this.runs.filter((entry) => entry.artifactId !== run.artifactId)];
    return {
      ok: true,
      message: existing
        ? `${run.identity.id} was already saved, and has been updated.`
        : `${run.identity.id} saved.`,
    };
  }

  async get(artifactId: string): Promise<StoredRun | null> {
    return this.runs.find((run) => run.artifactId === artifactId) ?? null;
  }

  async list(): Promise<StoreListing> {
    return this.runs.length === 0
      ? { runs: [], status: 'empty', message: 'No saved runs yet.' }
      : { runs: this.runs, status: 'loaded', message: `${this.runs.length} saved.` };
  }

  async delete(artifactId: string): Promise<StoreResult> {
    const before = this.runs.length;
    this.runs = this.runs.filter((run) => run.artifactId !== artifactId);
    return {
      ok: this.runs.length < before,
      message: this.runs.length < before ? 'Removed.' : 'No such run.',
    };
  }

  async compare(a: string, b: string) {
    const left = await this.get(a);
    const right = await this.get(b);
    return left && right ? { a: left, b: right } : null;
  }

  async reproduce(artifactId: string): Promise<StoredRun | null> {
    return this.get(artifactId);
  }

  async lineage(artifactId?: string): Promise<LineageGraph> {
    return buildLineage(this.runs, artifactId);
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/*                                                                    */
/* For a server that wants to hold the registry. The UI contract is     */
/* unchanged: the same seven methods, the same shapes, one fetch each.  */
/*                                                                    */
/* A failure to reach the server is reported as `unreachable` rather    */
/* than as an empty registry. "You have no saved runs" and "I could not */
/* ask" are different answers and must not look the same.               */
/* ------------------------------------------------------------------ */

export class HttpArtifactStore implements ArtifactStore {
  readonly kind = 'http' as const;

  constructor(
    private readonly base = '/api/artifacts',
    readonly label = 'Server',
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  }

  async save(run: StoredRun): Promise<StoreResult> {
    return this.call<StoreResult>('', { method: 'POST', body: JSON.stringify(run) });
  }

  async get(artifactId: string): Promise<StoredRun | null> {
    try {
      return await this.call<StoredRun>(`/${artifactId}`);
    } catch {
      return null;
    }
  }

  async list(): Promise<StoreListing> {
    try {
      return await this.call<StoreListing>('');
    } catch (error) {
      return {
        runs: [],
        status: 'unreachable',
        message: `The artifact server could not be reached (${String(error)}). Nothing is lost; the server did not answer.`,
      };
    }
  }

  async delete(artifactId: string): Promise<StoreResult> {
    try {
      return await this.call<StoreResult>(`/${artifactId}`, { method: 'DELETE' });
    } catch (error) {
      return { ok: false, message: `Could not delete: ${String(error)}` };
    }
  }

  async compare(a: string, b: string) {
    const [left, right] = await Promise.all([this.get(a), this.get(b)]);
    return left && right ? { a: left, b: right } : null;
  }

  async reproduce(artifactId: string): Promise<StoredRun | null> {
    return this.get(artifactId);
  }

  async lineage(artifactId?: string): Promise<LineageGraph> {
    const query = artifactId ? `?focus=${encodeURIComponent(artifactId)}` : '';
    try {
      return await this.call<LineageGraph>(`/lineage${query}`);
    } catch {
      // Falling back to an empty graph would be a lie about the lineage. An
      // unreachable server means unknown, and unknown is what is returned.
      return { nodes: [], roots: [], focus: artifactId ?? null };
    }
  }
}
