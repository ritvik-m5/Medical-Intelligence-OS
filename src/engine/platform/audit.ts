import type { AuditEntry, AuditKind } from '../derive/types';

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/*                                                                    */
/* An append-only record of every action that read, derived from, or   */
/* left the graph. Not a security control on its own — it is the       */
/* evidence that a control existed, which is the part that is normally */
/* missing from a health product.                                       */
/* ------------------------------------------------------------------ */

export interface AuditStore {
  read(): AuditEntry[];
  write(entries: AuditEntry[]): void;
}

export class MemoryAuditStore implements AuditStore {
  private entries: AuditEntry[] = [];
  read(): AuditEntry[] {
    return [...this.entries];
  }
  write(entries: AuditEntry[]): void {
    this.entries = [...entries];
  }
}

export class LocalStorageAuditStore implements AuditStore {
  constructor(private readonly key = 'medical-memory.audit.v1') {}

  read(): AuditEntry[] {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as AuditEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  write(entries: AuditEntry[]): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(entries));
    } catch {
      // Storage can be unavailable or full. An audit failure must never take the
      // platform down, but it must also never be silent in production — the
      // health surface reports whether persistence is active.
    }
  }
}

const MAX_ENTRIES = 500;

let sequence = 0;

export class AuditLog {
  private entries: AuditEntry[];

  constructor(private readonly store: AuditStore) {
    this.entries = store.read();
  }

  record(
    kind: AuditKind,
    summary: string,
    options: { factIds?: string[]; docIds?: string[]; detail?: string } = {},
  ): AuditEntry {
    sequence += 1;
    const entry: AuditEntry = {
      id: `aud_${Date.now().toString(36)}_${sequence}`,
      at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      kind,
      summary,
      factIds: options.factIds ?? [],
      docIds: options.docIds ?? [],
      detail: options.detail,
    };
    this.entries = [entry, ...this.entries].slice(0, MAX_ENTRIES);
    this.store.write(this.entries);
    return entry;
  }

  all(): AuditEntry[] {
    return [...this.entries];
  }

  filter(kind: AuditKind): AuditEntry[] {
    return this.entries.filter((e) => e.kind === kind);
  }

  /** Serialised for export alongside the record. */
  toJSON(): string {
    return JSON.stringify(
      {
        schema: 'medical-memory.audit/v1',
        exportedAt: new Date().toISOString(),
        entryCount: this.entries.length,
        entries: this.entries,
      },
      null,
      2,
    );
  }

  clear(): void {
    this.entries = [];
    this.store.write([]);
  }
}
