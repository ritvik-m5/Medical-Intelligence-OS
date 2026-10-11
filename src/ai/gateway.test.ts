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
import { generateQuestions } from '../engine/questions';
import type { ChatContext } from '../chat/conversation';
import { contextForFinding } from './context';
import { DEFAULT_LLM } from '../explain/config';
import { gatewayConverse, initialConversationState } from './gateway';
import { routeMessage } from './router';

function buildContext(): ChatContext {
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

describe('conversation router', () => {
  it('routes greetings to general, not record', () => {
    expect(routeMessage('Hi', { aiContext: null, activeConcern: null })).toBe('general');
    expect(routeMessage('hello', { aiContext: null, activeConcern: null })).toBe('general');
    expect(routeMessage('thanks', { aiContext: null, activeConcern: null })).toBe('general');
  });

  it('routes personal record questions to record', () => {
    expect(routeMessage('What changed?', { aiContext: null, activeConcern: null })).toBe('record');
    expect(routeMessage('What does my potassium result mean?', { aiContext: null, activeConcern: null })).toBe(
      'record',
    );
  });

  it('routes general medical knowledge to research', () => {
    expect(routeMessage('What is potassium?', { aiContext: null, activeConcern: null })).toBe('research');
  });
});

describe('Medical Memory AI gateway', () => {
  const chatContext = buildContext();
  const questions = generateQuestions({
    contradictions: chatContext.contradictions,
    changes: chatContext.changes,
    derivations: chatContext.derivations,
  });

  it('answers Hi with a natural greeting, not an intent failure', async () => {
    const { reply } = await gatewayConverse({
      message: 'Hi',
      chatContext,
      aiContext: null,
      conversationState: initialConversationState(),
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    expect(reply.route).toBe('general');
    expect(reply.notAnswered).toBeNull();
    expect(reply.paragraphs.join(' ')).toContain('Medical Memory');
    expect(reply.paragraphs.join(' ')).not.toContain('not answered');
  });

  it('runs the critical multi-turn regression without dead ends', async () => {
    let state = initialConversationState();

    const hi = await gatewayConverse({
      message: 'Hi',
      chatContext,
      aiContext: null,
      conversationState: state,
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    state = hi.nextState;
    expect(hi.reply.route).toBe('general');

    const worry = await gatewayConverse({
      message: "I'm worried about my lab results.",
      chatContext,
      aiContext: null,
      conversationState: state,
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    state = worry.nextState;
    expect(worry.reply.route).toBe('general');
    expect(state.activeConcern).toBe('lab results');

    const changed = await gatewayConverse({
      message: 'What changed?',
      chatContext,
      aiContext: null,
      conversationState: state,
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    state = changed.nextState;
    expect(changed.reply.route).toBe('record');
    expect(changed.reply.sources.length).toBeGreaterThan(0);

    const potassium = await gatewayConverse({
      message: 'Explain the potassium result.',
      chatContext,
      aiContext: null,
      conversationState: state,
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    state = potassium.nextState;
    expect(potassium.reply.route).toBe('record');

    const thanks = await gatewayConverse({
      message: 'Thanks.',
      chatContext,
      aiContext: null,
      conversationState: state,
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    expect(thanks.reply.route).toBe('general');
    expect(thanks.reply.paragraphs.join(' ')).toContain("You're welcome");
  });

  it('uses structured AIContext for "explain this"', async () => {
    const finding = chatContext.derivations[0];
    const aiContext = contextForFinding(
      chatContext.identity.artifactId,
      chatContext.asOf,
      finding,
    );
    const { reply } = await gatewayConverse({
      message: 'Explain this',
      chatContext: { ...chatContext, focus: finding.id },
      aiContext,
      conversationState: initialConversationState(),
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    expect(reply.route).toBe('record');
    expect(reply.paragraphs.join(' ')).toContain(finding.title);
  });

  it('survives when the model is unavailable', async () => {
    const { reply } = await gatewayConverse({
      message: 'What changed?',
      chatContext,
      aiContext: null,
      conversationState: initialConversationState(),
      llmConfig: { ...DEFAULT_LLM, baseUrl: 'http://127.0.0.1:1' },
      useModel: true,
      questions,
    });
    expect(reply.route).toBe('record');
    expect(reply.paragraphs.join(' ').length).toBeGreaterThan(20);
  });

  it('never creates a medical finding from a greeting', async () => {
    const { reply } = await gatewayConverse({
      message: 'Hi',
      chatContext,
      aiContext: null,
      conversationState: initialConversationState(),
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    expect(reply.route).toBe('general');
    expect(reply.sources).toEqual([]);
    expect(reply.sections).toBeNull();
  });

  it('keeps external research separate from the personal record', async () => {
    const { reply } = await gatewayConverse({
      message: 'What is potassium?',
      chatContext,
      aiContext: null,
      conversationState: initialConversationState(),
      llmConfig: DEFAULT_LLM,
      useModel: false,
      questions,
    });
    expect(reply.route).toBe('research');
    expect(reply.sections).not.toBeNull();
    // External claims and personal evidence stay in different lists.
    expect(reply.sections!.fromRecord).not.toEqual(reply.sections!.external);
  });
});
