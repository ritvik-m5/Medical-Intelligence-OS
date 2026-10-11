import type { StepKind } from '../engine/derive/types';
import type { Fact } from '../engine/types';
import type { BuildArtifact } from './types';

/* ------------------------------------------------------------------ */
/* Story samples                                                       */
/*                                                                    */
/* The scrollytelling section used to illustrate the pipeline with      */
/* hand-written SVG: a fixed document, a fixed drug, a fixed proof.     */
/* That made it the one part of the page that described the product     */
/* without being downstream of it.                                      */
/*                                                                    */
/* Everything here is derived from the artifact a real build produced.  */
/* Where a number appears it is the artifact's number, and where a      */
/* label appears it is a label the engine actually read.                */
/* ------------------------------------------------------------------ */

export interface StoryLine {
  text: string;
  /** Character range within this line that a fact was read from. */
  highlights: Array<{ start: number; end: number }>;
}

export interface StoryDocument {
  title: string;
  kind: string;
  date: string;
  lines: StoryLine[];
  /** Facts the engine read from this document. */
  factsInDocument: number;
}

export interface StoryEntity {
  label: string;
  forms: Array<{ text: string; docs: number }>;
  docCount: number;
  factCount: number;
  totalEntities: number;
}

export interface StoryInterval {
  label: string;
  /** Position along the axis, 0 to 1. */
  start: number;
  width: number;
  tone: 'plain' | 'alert' | 'drug';
  detail: string;
}

export interface StoryProofNode {
  label: string;
  kind: StepKind;
  /** Column, so the proof reads left to right. */
  level: number;
  /** Row within the column. */
  row: number;
}

export interface StoryProof {
  nodes: StoryProofNode[];
  edges: Array<{ from: number; to: number }>;
  /** The real sequence of step kinds, e.g. "premise → rule → conclusion". */
  shape: string;
  ruleId: string;
  steps: number;
  totalDerivations: number;
}

export interface StorySample {
  document: StoryDocument | null;
  entity: StoryEntity | null;
  intervals: StoryInterval[];
  intervalCaption: string;
  proof: StoryProof | null;
  /** Every fact in the artifact, for the chapter-one caption. */
  factsTotal: number;
}

const MAX_LINES = 4;

/* --------------------------- Chapter one --------------------------- */

/**
 * A real document, with the real spans the extractor read highlighted in place.
 *
 * The lines shown are chosen so that at least one extracted fact is visible,
 * because a document excerpt with no highlight would illustrate nothing.
 */
function documentSample(artifact: BuildArtifact): StoryDocument | null {
  if (artifact.documents.length === 0) return null;

  const factsByDoc = new Map<string, Fact[]>();
  for (const fact of artifact.facts) {
    const list = factsByDoc.get(fact.docId);
    if (list) list.push(fact);
    else factsByDoc.set(fact.docId, [fact]);
  }

  // The document with the most extracted facts is the most interesting one.
  const doc = [...artifact.documents].sort(
    (a, b) => (factsByDoc.get(b.id)?.length ?? 0) - (factsByDoc.get(a.id)?.length ?? 0),
  )[0];
  const docFacts = factsByDoc.get(doc.id) ?? [];
  if (docFacts.length === 0) return null;

  // Build lines with their character offsets.
  const raw = doc.text.split('\n');
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of raw) {
    offsets.push(cursor);
    cursor += line.length + 1;
  }

  // Start at the first line that contains a fact, then take a few lines.
  const firstFactLine = raw.findIndex((_, index) => {
    const start = offsets[index];
    const end = start + raw[index].length;
    return docFacts.some((fact) => fact.span[0] < end && fact.span[1] > start);
  });
  const from = firstFactLine === -1 ? 0 : firstFactLine;
  const slice = raw.slice(from, from + MAX_LINES);

  const lines: StoryLine[] = slice.map((text, index) => {
    const lineStart = offsets[from + index];
    const lineEnd = lineStart + text.length;
    const highlights: Array<{ start: number; end: number }> = [];
    for (const fact of docFacts) {
      const start = Math.max(fact.span[0], lineStart);
      const end = Math.min(fact.span[1], lineEnd);
      if (end > start) highlights.push({ start: start - lineStart, end: end - lineStart });
    }
    return { text, highlights: highlights.sort((a, b) => a.start - b.start) };
  });

  return {
    title: doc.title,
    kind: doc.kind.replace(/_/g, ' '),
    date: doc.date,
    lines,
    factsInDocument: docFacts.length,
  };
}

/* --------------------------- Chapter two --------------------------- */

/**
 * Collapse a surface form to its words, so that two readings of the same
 * measurement do not count as two different ways of writing it.
 *
 * "Blood pressure 138/86" and "Blood pressure 128/78" are the same form written
 * twice with different numbers. "Prediabetes" and "impaired fasting glucose" are
 * two genuinely different ways of writing the same thing, which is the claim
 * this chapter makes.
 */
function wordShape(form: string): string {
  return form
    .toLowerCase()
    .replace(/[0-9]+([.,][0-9]+)?/g, '#')
    .replace(/[^a-z#\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The concept that was written the most different ways.
 *
 * The surface form is the characters the fact was read from, taken straight from
 * the document at the stored span. That is the most faithful available answer:
 * `fact.label` is the canonical label the extractor resolved to, not what the
 * document actually said.
 */
function entitySample(artifact: BuildArtifact): StoryEntity | null {
  const factsById = new Map(artifact.facts.map((fact) => [fact.id, fact]));
  const docById = new Map(artifact.documents.map((doc) => [doc.id, doc]));

  let best:
    | { key: string; forms: Map<string, Set<string>>; docs: Set<string>; shapes: number }
    | null = null;

  for (const entity of artifact.graph.entities) {
    if (entity.factIds.length < 2) continue;

    const forms = new Map<string, Set<string>>();
    const docs = new Set<string>();

    for (const id of entity.factIds) {
      const fact = factsById.get(id);
      if (!fact) continue;
      const doc = docById.get(fact.docId);
      if (!doc) continue;
      const written = doc.text.slice(fact.span[0], fact.span[1]).trim();
      // Too short or too long to read in a diagram.
      if (written.length < 2 || written.length > 42) continue;
      const set = forms.get(written) ?? new Set<string>();
      set.add(fact.docId);
      forms.set(written, set);
      docs.add(fact.docId);
    }

    const shapes = new Set(Array.from(forms.keys()).map(wordShape)).size;
    // Only interesting when the concept was genuinely written more than one way.
    if (shapes < 2) continue;
    if (!best || shapes > best.shapes || (shapes === best.shapes && forms.size > best.forms.size)) {
      best = { key: entity.key, forms, docs, shapes };
    }
  }

  if (!best) return null;
  const chosen = best;
  const entity = artifact.graph.entities.find((candidate) => candidate.key === chosen.key)!;

  return {
    label: entity.label,
    forms: Array.from(chosen.forms.entries())
      .map(([text, docs]) => ({ text, docs: docs.size }))
      .sort((a, b) => b.docs - a.docs || a.text.localeCompare(b.text))
      .slice(0, 3),
    docCount: chosen.docs.size,
    factCount: entity.factIds.length,
    totalEntities: artifact.graph.entities.length,
  };
}

/* -------------------------- Chapter three -------------------------- */

/** Map a date onto a 0..1 position between the record's first and last day. */
function position(date: string, start: string, end: string): number {
  const span = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(span) || span <= 0) return 0;
  const offset = Date.parse(date) - Date.parse(start);
  return Math.min(1, Math.max(0, offset / span));
}

/**
 * Real courses and condition spans, laid out on a real axis.
 *
 * The tone of each bar is not decoration: a bar is red when a finding in this
 * same artifact cites the entity behind it. The overlap the chapter talks about
 * is the artifact's overlap, not an illustration of one.
 */
function intervalSample(artifact: BuildArtifact): {
  intervals: StoryInterval[];
  caption: string;
} {
  const start = artifact.graph.stats.spanStart;
  const end = artifact.graph.stats.spanEnd;

  const flagged = new Set(artifact.derivations.flatMap((d) => d.entityKeys));

  const rows: StoryInterval[] = [];

  for (const course of artifact.courses) {
    const courseEnd = course.interval.end ?? end;
    const left = position(course.interval.start, start, end);
    const right = position(courseEnd, start, end);
    rows.push({
      label: course.label,
      start: left,
      width: Math.max(right - left, 0.012),
      tone: flagged.has(course.entityKey) ? 'alert' : 'drug',
      detail: `${course.interval.start} → ${course.interval.end ?? 'open'} · ${course.state}`,
    });
  }

  for (const span of artifact.spans) {
    const spanEnd = span.interval.end ?? end;
    const left = position(span.interval.start, start, end);
    const right = position(spanEnd, start, end);
    rows.push({
      label: span.label,
      start: left,
      width: Math.max(right - left, 0.012),
      tone: flagged.has(span.entityKey) ? 'alert' : 'plain',
      detail: `${span.interval.start} → ${span.interval.end ?? 'open'} · ${span.state}`,
    });
  }

  // Show the most informative rows: flagged first, then the longest.
  const shown = rows
    .sort((a, b) => {
      const aFlag = a.tone === 'alert' ? 1 : 0;
      const bFlag = b.tone === 'alert' ? 1 : 0;
      return bFlag - aFlag || b.width - a.width;
    })
    .slice(0, 4);

  const flaggedShown = shown.filter((row) => row.tone === 'alert').length;
  const caption =
    flaggedShown > 0
      ? `${shown.length} of ${rows.length} intervals, ${flaggedShown} cited by a finding`
      : `${shown.length} of ${rows.length} reconstructed intervals`;

  return { intervals: shown, caption };
}

/* -------------------------- Chapter four --------------------------- */

/**
 * A real proof graph, laid out by dependency depth.
 *
 * The node count, the edges and the shape string all come from one derivation
 * the engine produced. Nothing is drawn that is not in the proof.
 */
function proofSample(artifact: BuildArtifact): StoryProof | null {
  if (artifact.derivations.length === 0) return null;

  // The deepest proof is the one worth showing.
  const derivation = [...artifact.derivations].sort((a, b) => b.depth - a.depth || b.steps.length - a.steps.length)[0];
  const steps = derivation.steps;
  if (steps.length === 0) return null;

  const index = new Map(steps.map((step, position) => [step.id, position]));

  // Longest path from a premise, so a step always sits right of its inputs.
  const levels: number[] = new Array(steps.length).fill(0);
  for (let pass = 0; pass < steps.length; pass += 1) {
    let changed = false;
    steps.forEach((step, at) => {
      for (const dependency of step.dependsOn) {
        const from = index.get(dependency);
        if (from === undefined) continue;
        if (levels[at] < levels[from] + 1) {
          levels[at] = levels[from] + 1;
          changed = true;
        }
      }
    });
    if (!changed) break;
  }

  const rows = new Map<number, number>();
  const nodes: StoryProofNode[] = steps.map((step, at) => {
    const level = levels[at];
    const row = rows.get(level) ?? 0;
    rows.set(level, row + 1);
    const text = step.label.length > 26 ? `${step.label.slice(0, 25)}…` : step.label;
    return { label: text, kind: step.kind, level, row };
  });

  const edges: Array<{ from: number; to: number }> = [];
  steps.forEach((step, to) => {
    for (const dependency of step.dependsOn) {
      const from = index.get(dependency);
      if (from !== undefined) edges.push({ from, to });
    }
  });

  return {
    nodes,
    edges,
    shape: steps.map((step) => step.kind).join(' → '),
    ruleId: derivation.ruleId,
    steps: steps.length,
    totalDerivations: artifact.derivations.length,
  };
}

/* ----------------------------- Assembly ---------------------------- */

/**
 * Everything the scrollytelling needs, from one artifact.
 *
 * When there is no artifact yet — the first frame after mount, before the
 * automatic build lands — every sample is null and the visuals render as an
 * unlabelled schematic. They never show invented data.
 */
export function storySample(artifact: BuildArtifact | null): StorySample {
  if (!artifact) {
    return {
      document: null,
      entity: null,
      intervals: [],
      intervalCaption: '',
      proof: null,
      factsTotal: 0,
    };
  }

  const { intervals, caption } = intervalSample(artifact);

  return {
    document: documentSample(artifact),
    entity: entitySample(artifact),
    intervals,
    intervalCaption: caption,
    proof: proofSample(artifact),
    factsTotal: artifact.facts.length,
  };
}

/** True when every chapter has something real to show. */
export function storyIsComplete(sample: StorySample): boolean {
  return (
    sample.document !== null &&
    sample.entity !== null &&
    sample.intervals.length > 0 &&
    sample.proof !== null
  );
}
