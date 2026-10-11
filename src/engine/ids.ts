/**
 * Deterministic ids and small numeric helpers.
 *
 * Ids are content-addressed on purpose: re-ingesting the same document twice
 * must produce the same fact ids, otherwise provenance links silently break
 * and the "document lineage" feature becomes meaningless.
 */

/** 64-bit-ish FNV-1a over a string, rendered as base36. Stable across runs. */
export function hash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export function docId(source: string, date: string, title: string): string {
  return `doc_${hash(`${source}|${date}|${title}`)}`;
}

export function factId(parts: Array<string | number>): string {
  return `fct_${hash(parts.join('¦'))}`;
}

export function entityId(key: string): string {
  return `ent_${hash(key)}`;
}

export function edgeId(from: string, to: string, kind: string): string {
  return `edg_${hash(`${from}>${kind}>${to}`)}`;
}

export function sectionId(doc: string, start: number): string {
  return `sec_${hash(`${doc}|${start}`)}`;
}

/** Mulberry32 — tiny, seedable, good enough for deterministic graph layout. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}
