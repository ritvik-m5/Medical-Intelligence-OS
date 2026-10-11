import { describe, expect, it } from 'vitest';
import { isGeneralChat, friendlyFallback } from './general';
import { converse } from './conversation';
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
import type { ChatContext } from './conversation';

/* ------------------------------------------------------------------ */
/* General conversation                                                */
/*                                                                    */
/* The regression the spec calls out: a greeting or "thanks" must be     */
/* answered conversationally, never as a failed medical intent.          */
/* ------------------------------------------------------------------ */

function context(): ChatContext {
  const results = SAMPLE_DOCUMENTS.map((doc, index) => ingestDocument(doc, index)).sort((a, b) =>
    a.document.date.localeCompare(b.document.date),
  );
  const graph = buildGraph(SAMPLE_PATIENT, results);
  const asOf = graph.stats.spanEnd;
  const derivations = derive(graph, asOf);
  const snapshot = snapshotAt(graph, asOf);
  return {
    graph,
    derivations,
    identity: artifactIdentity({ graph, derivations, documents: SAMPLE_DOCUMENTS }),
    snapshot,
    changes: diffSnapshots(snapshotAt(graph, addDays(asOf, -366)), snapshot),
    contradictions: findContradictions(graph),
    quality: assessQuality({ graph, derivations, asOf }),
    verification: verifyProvenance(graph, derivations),
    asOf,
  };
}

describe('isGeneralChat', () => {
  it('recognises casual conversation', () => {
    for (const text of ['Hi', 'hello', 'hey there', 'good morning', 'thanks', 'thank you', 'what can you do?', 'who are you?', 'how are you?', 'tell me a joke', 'bye']) {
      expect(isGeneralChat(text), `should be general: "${text}"`).toBe(true);
    }
  });

  it('does not misclassify a record question as chit-chat', () => {
    for (const text of ['What changed?', 'What is potassium?', 'Summarise what you found', 'What does my A1c result mean?', 'Why did this finding appear?']) {
      expect(isGeneralChat(text), `should not be general: "${text}"`).toBe(false);
    }
  });
});

describe('friendlyFallback', () => {
  it('answers a greeting warmly, not with an intent failure', () => {
    const paragraphs = friendlyFallback('Hi');
    expect(paragraphs.join(' ')).toContain('Medical Memory');
    expect(paragraphs.join(' ')).not.toContain('not answered');
  });

  it('answers thanks and capability questions', () => {
    expect(friendlyFallback('thanks').join(' ')).toContain("You're welcome");
    expect(friendlyFallback('what can you do?').join(' ')).toContain('explain');
  });
});

describe('the conversation never dead-ends on small talk', () => {
  it('answers "Hi" as a greeting, not "not answered"', async () => {
    const reply = await converse('Hi', context());
    expect(reply.intent).toBe('greeting');
    expect(reply.notAnswered).toBeNull();
    expect(reply.paragraphs.join(' ')).toContain('Medical Memory');
  });

  it('answers "thanks" conversationally', async () => {
    const reply = await converse('thanks', context());
    expect(reply.notAnswered).toBeNull();
    expect(reply.paragraphs.join(' ')).toContain("You're welcome");
  });

  it('keeps record questions grounded after small talk', async () => {
    const ctx = context();
    const greeting = await converse('Hi', ctx);
    expect(greeting.intent).toBe('greeting');

    // The next turn is a real record question and still hits the engine.
    const record = await converse('What changed?', ctx);
    expect(record.intent).toBe('changed');
    expect(record.sources.length).toBeGreaterThan(0);
  });
});
