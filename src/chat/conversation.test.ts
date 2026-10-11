import { describe, expect, it } from 'vitest';
import { SAMPLE_DOCUMENTS, SAMPLE_PATIENT } from '../data/sampleCorpus';
import { ingestDocument } from '../engine/ingest';
import { buildGraph } from '../engine/graph';
import { derive } from '../engine/derive/engine';
import { snapshotAt, diffSnapshots } from '../engine/timeline';
import { findContradictions } from '../engine/contradiction';
import { assessQuality } from '../engine/platform/quality';
import { verifyProvenance } from '../engine/verify';
import { artifactIdentity } from '../engine/identity';
import { addDays } from '../engine/text/normalize';
import {
  converse,
  detectChatIntent,
  followUpsFor,
  openingQuestions,
  receiptFor,
  type ChatContext,
} from './conversation';

/* ------------------------------------------------------------------ */
/* Talking to the record                                               */
/*                                                                    */
/* The context is built exactly the way the store builds it, from the   */
/* real sample corpus. So every answer asserted here is about content   */
/* that could only come from a genuine derivation.                      */
/* ------------------------------------------------------------------ */

function buildContext(): ChatContext {
  const results = SAMPLE_DOCUMENTS.map((doc, index) => ingestDocument(doc, index)).sort((a, b) =>
    a.document.date.localeCompare(b.document.date),
  );
  const graph = buildGraph(SAMPLE_PATIENT, results);
  const asOf = graph.stats.spanEnd;
  const derivations = derive(graph, asOf);
  const snapshot = snapshotAt(graph, asOf);
  const changes = diffSnapshots(snapshotAt(graph, addDays(asOf, -366)), snapshot);

  return {
    graph,
    derivations,
    identity: artifactIdentity({ graph, derivations, documents: SAMPLE_DOCUMENTS }),
    snapshot,
    changes,
    contradictions: findContradictions(graph),
    quality: assessQuality({ graph, derivations, asOf }),
    verification: verifyProvenance(graph, derivations),
    asOf,
  };
}

const context = buildContext();

describe('reading the question', () => {
  it('sends each question to the capability that can answer it', () => {
    expect(detectChatIntent('What changed since last year?')).toBe('changed');
    expect(detectChatIntent('what is new')).toBe('changed');
    expect(detectChatIntent('Where does the record disagree with itself?')).toBe('conflicts');
    expect(detectChatIntent('Is there a contradiction?')).toBe('conflicts');
    expect(detectChatIntent('What is missing?')).toBe('missing');
    expect(detectChatIntent('Which monitoring is overdue?')).toBe('missing');
    expect(detectChatIntent('How long was that medication taken?')).toBe('timeline');
    expect(detectChatIntent('What are the open questions?')).toBe('questions');
    expect(detectChatIntent('What should I investigate?')).toBe('questions');
    expect(detectChatIntent('Why did this finding appear?')).toBe('unknown');
  });

  it('does not mistake a change question for a summary question', () => {
    // Both words are present; change wins, because that is what was asked.
    expect(detectChatIntent('Summarise what changed in my medication')).toBe('changed');
  });
});

describe('the four answers the record gives directly', () => {
  it('reports change from the same structure the Time Machine shows', async () => {
    const reply = await converse('What changed?', context);

    expect(reply.intent).toBe('changed');
    expect(reply.paragraphs.join(' ')).toContain(`${context.changes.length} documented change`);
    expect(reply.sources.length).toBeGreaterThan(0);
    // Every source carries the facts and documents behind it.
    for (const source of reply.sources) {
      expect(source.id.length).toBeGreaterThan(0);
      expect(source.docIds.length).toBeGreaterThan(0);
    }
  });

  it('reports conflict without ever picking a side', async () => {
    const reply = await converse('Where does the record disagree with itself?', context);

    expect(reply.intent).toBe('conflicts');
    expect(reply.notAnswered).toContain('refuses to resolve it');
    expect(reply.paragraphs.join(' ')).toContain('does not decide which statement is right');
  });

  it('reports absence, and says what an absence means', async () => {
    const reply = await converse('What is missing?', context);

    expect(reply.intent).toBe('missing');
    expect(reply.paragraphs.join(' ').length).toBeGreaterThan(40);
    // A gap is an absence, and the answer says so rather than implying a cause.
    expect(reply.notAnswered).toContain('absence');
  });

  it('reports intervals from the snapshot, not from a guess', async () => {
    const reply = await converse('What do the intervals look like?', context);

    expect(reply.intent).toBe('timeline');
    expect(reply.paragraphs.join(' ')).toContain('documented from');
    // The window is what the documents establish, not how long it lasted.
    expect(reply.notAnswered).toContain('not how long the condition lasted');
  });

  it('reports the open questions, each with a real destination', async () => {
    const reply = await converse('What are the open questions?', context);

    expect(reply.intent).toBe('questions');
    expect(reply.paragraphs.join(' ')).toContain('open question');
    // Every question is generated from the artifact, never invented, and every
    // one offers a view the reader can actually open.
    expect(reply.actions.length).toBeGreaterThan(0);
    for (const action of reply.actions) {
      expect(action.kind).toBe('view');
      expect(action.view).toBeTruthy();
    }
    expect(reply.generated).toBe(false);
  });

  it('resolves "what does this mean" against the focused finding, not prose', async () => {
    const focus = context.derivations[0].id;
    const reply = await converse('what does this mean', { ...context, focus });

    expect(reply.intent).toBe('why');
    // It names the focused finding and its rule — no pasted rule prose.
    expect(reply.paragraphs.join(' ')).toContain(context.derivations[0].title);
    expect(reply.sources.length).toBeGreaterThan(0);
    // And the sources are real facts from the graph.
    const factIds = new Set(context.graph.facts.map((f) => f.id));
    for (const source of reply.sources) {
      for (const id of source.factIds) expect(factIds.has(id)).toBe(true);
    }
  });

  it('explains what was searched when there is nothing to report', async () => {
    const empty: ChatContext = { ...context, changes: [], contradictions: [] };

    const changed = await converse('What changed?', empty);
    expect(changed.paragraphs.join(' ')).toContain('No documented change was found');
    expect(changed.paragraphs.join(' ')).toContain('documents');

    const conflicts = await converse('Any conflicts?', empty);
    expect(conflicts.paragraphs.join(' ')).toContain('No contradiction was detected');
    // And it says what an absence does and does not mean.
    expect(conflicts.paragraphs.join(' ')).toContain('not proof that the record is correct');
    expect(conflicts.notAnswered).toContain('not in it cannot be detected');
  });
});


describe('the receipt', () => {
  it('names the artifact, the engine, the ruleset and the verification', () => {
    const receipt = receiptFor(context, { modelUsed: false });

    expect(receipt.artifactId).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.displayId).toMatch(/^MM-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(receipt.engineVersion).toBe(context.identity.engineVersion);
    expect(receipt.rulesetVersion).toBe(context.identity.rulesetVersion);
    expect(receipt.documents).toBe(context.graph.documents.length);
    expect(receipt.verification.clean).toBe(true);
    expect(receipt.modelUsed).toBe(false);
  });

  it('carries the proof length only when the answer is about a proof', () => {
    expect(receiptFor(context, { modelUsed: false }).steps).toBeNull();

    const derivation = context.derivations[0];
    expect(receiptFor(context, { derivation, modelUsed: false }).steps).toBe(
      derivation.steps.length,
    );
  });

  it('says when a model wrote the prose, which is the one thing the engine cannot know', () => {
    expect(receiptFor(context, { modelUsed: true }).modelUsed).toBe(true);
    expect(receiptFor(context, { modelUsed: false }).modelUsed).toBe(false);
  });

  it('is attached to every reply, on every path', async () => {
    for (const question of [
      'What changed?',
      'Any contradictions?',
      'What is missing?',
      'Summarise what you found',
      'Why did this appear?',
    ]) {
      const reply = await converse(question, context);
      expect(reply.receipt.artifactId).toBe(context.identity.artifactId);
      expect(reply.receipt.verification.score).toBeGreaterThan(0);
    }
  });
});

describe('what to ask next', () => {
  it('only offers questions this record can answer', () => {
    const questions = openingQuestions(context);
    expect(questions.length).toBeGreaterThan(2);
    expect(questions.length).toBeLessThanOrEqual(5);
  });

  it('does not offer a question about change when nothing changed', () => {
    expect(openingQuestions({ ...context, changes: [] })).not.toContain('What changed?');
  });

  it('always offers a way to find the limits', () => {
    expect(
      openingQuestions({ ...context, changes: [], contradictions: [], derivations: [] }),
    ).toContain('What can you not tell me?');
  });

  it('follows an answer with questions that build on it', async () => {
    const changed = await converse('What changed?', context);
    expect(changed.followUps.length).toBeGreaterThan(0);
    expect(changed.followUps).not.toContain('What changed?');
    expect(followUpsFor(context, 'why').join(' ')).toContain('exact characters');
  });
});

describe('every reply', () => {
  it('says what it does not say, on every path', async () => {
    for (const question of [
      'What changed?',
      'Where does the record disagree?',
      'What is missing?',
      'What do the intervals look like?',
      'Summarise what you found',
    ]) {
      const reply = await converse(question, context);
      expect(reply.notAnswered).not.toBeNull();
      expect((reply.notAnswered ?? '').length).toBeGreaterThan(20);
    }
  });

  it('offers something real to do next', async () => {
    for (const question of [
      'What changed?',
      'Any conflicts?',
      'What is missing?',
      'Summarise what you found',
    ]) {
      const reply = await converse(question, context);
      expect(reply.actions.length).toBeGreaterThan(0);
      for (const action of reply.actions) {
        // An action names a view, a proof or a set of spans. Never nothing.
        const real =
          (action.kind === 'view' && Boolean(action.view)) ||
          (action.kind === 'proof' && Boolean(action.derivationId)) ||
          (action.kind === 'evidence' && Boolean(action.factIds?.length));
        expect(real).toBe(true);
        expect(action.detail.length).toBeGreaterThan(10);
      }
    }
  });

  it('never claims a model wrote an answer it did not write', async () => {
    for (const question of ['What changed?', 'Any conflicts?', 'What is missing?']) {
      const reply = await converse(question, context);
      expect(reply.generated).toBe(false);
      expect(reply.receipt.modelUsed).toBe(false);
    }
  });

  it('answers from the engine alone when no model is configured', async () => {
    const reply = await converse('Summarise what you found', context);

    expect(reply.generated).toBe(false);
    expect(reply.paragraphs.length).toBeGreaterThan(0);
    expect(reply.sources.length).toBeGreaterThan(0);
  });
});
