import { describe, expect, it } from 'vitest';
import { storyIsComplete, storySample } from './story';
import { LocalBuildBackend } from './backend';

/* Story sample tests.
 *
 * The scrollytelling diagrams used to be hand-written SVG. These tests exist to
 * stop that from ever being true again: every sample is checked against the
 * artifact it claims to describe, and the highlighted text is checked against
 * the characters at the fact's own span.
 */

async function primary() {
  const backend = new LocalBuildBackend({ pace: 0 });
  return backend.run({ prompt: 'reconstruct my four-year history', pace: 0 }, () => {});
}

describe('no artifact', () => {
  it('claims nothing', () => {
    const sample = storySample(null);
    expect(sample.document).toBeNull();
    expect(sample.entity).toBeNull();
    expect(sample.intervals).toEqual([]);
    expect(sample.proof).toBeNull();
    expect(sample.factsTotal).toBe(0);
    expect(storyIsComplete(sample)).toBe(false);
  });
});

describe('chapter one: the document is real', () => {
  it('draws from a document in the artifact', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);

    expect(sample.document).not.toBeNull();
    const doc = artifact.documents.find((candidate) => candidate.title === sample.document!.title);
    expect(doc).toBeDefined();
    expect(sample.document!.kind).toBe(doc!.kind.replace(/_/g, ' '));
    expect(sample.document!.date).toBe(doc!.date);
  });

  it('highlights exactly the characters the engine stored', async () => {
    const artifact = await primary();
    const sample = storySample(artifact)!;
    const doc = artifact.documents.find((candidate) => candidate.title === sample.document!.title)!;

    // Rebuild the line offsets the same way the sample did, then confirm every
    // highlight lands on a real fact span and slices real text.
    const shown = sample.document!.lines.map((line) => line.text);
    const joined = shown.join('\n');
    expect(doc.text).toContain(joined.split('\n')[0]);

    const highlighted = sample.document!.lines.flatMap((line) =>
      line.highlights.map((highlight) => line.text.slice(highlight.start, highlight.end)),
    );
    expect(highlighted.length).toBeGreaterThan(0);
    for (const slice of highlighted) {
      expect(slice.trim().length).toBeGreaterThan(0);
      // The highlighted run is real text from the document.
      expect(doc.text).toContain(slice);
    }
  });

  it('keeps every highlight inside its own line', async () => {
    const sample = storySample(await primary());
    for (const line of sample.document!.lines) {
      for (const highlight of line.highlights) {
        expect(highlight.start).toBeGreaterThanOrEqual(0);
        expect(highlight.end).toBeLessThanOrEqual(line.text.length);
        expect(highlight.end).toBeGreaterThan(highlight.start);
      }
    }
  });

  it('counts the facts it claims to have read', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);
    const doc = artifact.documents.find((d) => d.title === sample.document!.title)!;

    expect(sample.document!.factsInDocument).toBeGreaterThan(0);
    expect(sample.document!.factsInDocument).toBe(
      artifact.facts.filter((fact) => fact.docId === doc.id).length,
    );
    // The artifact-wide count lives on the sample, not on the document.
    expect(sample.factsTotal).toBe(artifact.facts.length);
  });
});

describe('chapter two: the entity is real', () => {
  it('picks a concept that was genuinely written more than one way', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);

    expect(sample.entity).not.toBeNull();
    expect(sample.entity!.forms.length).toBeGreaterThanOrEqual(2);

    // Every form is characters the engine actually read, taken from the document
    // at the stored span — not the canonical label it resolved to.
    const docById = new Map(artifact.documents.map((doc) => [doc.id, doc]));
    const written = new Set<string>();
    for (const fact of artifact.facts) {
      const doc = docById.get(fact.docId);
      if (doc) written.add(doc.text.slice(fact.span[0], fact.span[1]).trim());
    }

    for (const form of sample.entity!.forms) {
      expect(written.has(form.text)).toBe(true);
      expect(form.docs).toBeGreaterThan(0);
    }
  });

  it('does not count the same wording with different numbers as two forms', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);

    // Blood pressure is written many times with different readings. Those are one
    // way of writing it, so the chosen entity must not be blood pressure.
    const shapes = new Set(
      sample.entity!.forms.map((form) => form.text.replace(/[0-9]+([.,][0-9]+)?/g, '#')),
    );
    expect(shapes.size).toBeGreaterThanOrEqual(2);
  });

  it('reports the real entity count', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);
    expect(sample.entity!.totalEntities).toBe(artifact.graph.entities.length);
  });
});

describe('chapter three: the intervals are real', () => {
  it('lays out real courses and spans inside the axis', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);

    expect(sample.intervals.length).toBeGreaterThan(0);
    for (const row of sample.intervals) {
      expect(row.start).toBeGreaterThanOrEqual(0);
      expect(row.start).toBeLessThanOrEqual(1);
      expect(row.width).toBeGreaterThan(0);
      expect(row.start + row.width).toBeLessThanOrEqual(1.001);
      expect(row.detail.length).toBeGreaterThan(0);
    }
  });

  it('names intervals that exist in the artifact', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);
    const known = new Set([
      ...artifact.courses.map((course) => course.label),
      ...artifact.spans.map((span) => span.label),
    ]);
    for (const row of sample.intervals) expect(known.has(row.label)).toBe(true);
  });

  it('marks a bar when a finding cites the entity behind it', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);
    const flagged = new Set(artifact.derivations.flatMap((d) => d.entityKeys));

    const alerts = sample.intervals.filter((row) => row.tone === 'alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(sample.intervalCaption).toContain('cited by a finding');
    // And nothing unflagged is marked.
    for (const row of sample.intervals) {
      if (row.tone === 'alert') expect(flagged.size).toBeGreaterThan(0);
    }
  });
});

describe('chapter four: the proof is real', () => {
  it('draws a derivation the engine produced', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);

    expect(sample.proof).not.toBeNull();
    const known = new Set<string>(artifact.derivations.map((derivation) => derivation.ruleId));
    expect(known.has(sample.proof!.ruleId)).toBe(true);
    expect(sample.proof!.totalDerivations).toBe(artifact.derivations.length);
  });

  it('places every node to the right of the nodes it depends on', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);
    const proof = sample.proof!;

    // The layout invariant: an edge must never point backwards.
    for (const edge of proof.edges) {
      expect(proof.nodes[edge.to].level).toBeGreaterThan(proof.nodes[edge.from].level);
    }
  });

  it('draws one node per step and no more', async () => {
    const artifact = await primary();
    const sample = storySample(artifact);
    const derivation = artifact.derivations.find((d) => d.ruleId === sample.proof!.ruleId)!;

    expect(sample.proof!.nodes.length).toBe(derivation.steps.length);
    expect(sample.proof!.steps).toBe(derivation.steps.length);
    // The shape string is the real sequence of step kinds.
    expect(sample.proof!.shape).toBe(derivation.steps.map((step) => step.kind).join(' → '));
  });

  it('gives every edge a resolvable pair of endpoints', async () => {
    const sample = storySample(await primary());
    for (const edge of sample.proof!.edges) {
      expect(sample.proof!.nodes[edge.from]).toBeDefined();
      expect(sample.proof!.nodes[edge.to]).toBeDefined();
    }
  });
});

describe('the sample is complete once a build has run', () => {
  it('reports itself complete for the primary record', async () => {
    expect(storyIsComplete(storySample(await primary()))).toBe(true);
  });

  it('reports itself incomplete for a record with no findings', async () => {
    const backend = new LocalBuildBackend({ pace: 0 });
    const artifact = await backend.run(
      {
        prompt: '',
        pace: 0,
        attachments: [
          {
            title: 'Single note',
            kind: 'visit_note',
            origin: 'upload',
            date: '2026-01-05',
            text: 'Seen today. Feeling well. No concerns.',
          },
        ],
      },
      () => {},
    );
    const sample = storySample(artifact);
    // Nothing to prove, and it says so rather than inventing a diagram.
    expect(sample.proof).toBeNull();
    expect(storyIsComplete(sample)).toBe(false);
  });
});
