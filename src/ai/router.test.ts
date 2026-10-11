import { describe, expect, it } from 'vitest';
import {
  expandFollowUp,
  extractConcern,
  isFollowUp,
  routeMessage,
  type ConversationRoute,
} from './router';
import type { AIContext } from './context';

/* ------------------------------------------------------------------ */
/* The router in isolation                                             */
/*                                                                    */
/* routeMessage and expandFollowUp decide where a turn goes and what it */
/* means. They must be right on their own — every classifier branch,    */
/* context-over-text priority, pronoun resolution, and concern           */
/* persistence — before the gateway is trusted.                         */
/* ------------------------------------------------------------------ */

const potassiumContext: AIContext = {
  artifactId: 'MM-TEST',
  asOf: '2026-09-15',
  kind: 'finding',
  id: 'finding-1',
  title: 'Potassium finding',
  summary: 'Potassium has a value outside the plausible range.',
  sourceIds: ['doc-1'],
  factIds: ['fact-1'],
  derivationIds: ['finding-1'],
};

describe('routeMessage — general', () => {
  const cases: Array<[string, ConversationRoute]> = [
    ['Hi', 'general'],
    ['hello', 'general'],
    ['thanks', 'general'],
    ['how are you?', 'general'],
    ['tell me a joke', 'general'],
    ['bye', 'general'],
    ['what can you do?', 'general'],
  ];
  for (const [text, route] of cases) {
    it(`routes "${text}" to ${route}`, () => {
      expect(routeMessage(text, { aiContext: null, activeConcern: null })).toBe(route);
    });
  }

  it('routes a health worry to general conversation, never to a diagnosis', () => {
    expect(
      routeMessage("I'm worried about my lab results", { aiContext: null, activeConcern: null }),
    ).toBe('general');
    expect(
      routeMessage('I am concerned about my medication', { aiContext: null, activeConcern: null }),
    ).toBe('general');
  });
});

describe('routeMessage — record', () => {
  const cases: Array<[string, ConversationRoute]> = [
    ['What changed?', 'record'],
    ['What does my potassium result mean?', 'record'],
    ['Explain the potassium result', 'record'],
    ['What conflicts are in my record?', 'record'],
    ['What is missing from my record?', 'record'],
  ];
  for (const [text, route] of cases) {
    it(`routes "${text}" to ${route}`, () => {
      expect(routeMessage(text, { aiContext: null, activeConcern: null })).toBe(route);
    });
  }

  it('routes a pronoun question to record', () => {
    expect(routeMessage('Explain this', { aiContext: null, activeConcern: null })).toBe('record');
  });

  it('routes a follow-up to record when a concern is active', () => {
    expect(routeMessage('why is that', { aiContext: null, activeConcern: 'lab results' })).toBe(
      'record',
    );
    expect(routeMessage('show me the source', { aiContext: null, activeConcern: 'lab results' })).toBe(
      'record',
    );
  });
});

describe('routeMessage — research', () => {
  it('routes general medical knowledge to research', () => {
    expect(routeMessage('What is potassium?', { aiContext: null, activeConcern: null })).toBe(
      'research',
    );
  });

  it('routes external/registry topics to research', () => {
    expect(
      routeMessage('What does the FDA say about statins?', { aiContext: null, activeConcern: null }),
    ).toBe('research');
    expect(
      routeMessage('Find clinical trials for diabetes', { aiContext: null, activeConcern: null }),
    ).toBe('research');
  });
});

describe('routeMessage — context over text', () => {
  it('prefers the attached AIContext even when the text would otherwise be research', () => {
    // "What is potassium?" is research on its own; an attached finding makes it record.
    expect(
      routeMessage('What is potassium?', { aiContext: potassiumContext, activeConcern: null }),
    ).toBe('record');
  });
});

describe('expandFollowUp', () => {
  const state = { activeConcern: 'lab results', lastQuestion: 'What changed?' };

  it('resolves "what about …" against the active concern', () => {
    expect(expandFollowUp('what about potassium', state, null)).toBe(
      'What does my record say about lab results?',
    );
  });

  it('resolves "more simply" against the active concern', () => {
    expect(expandFollowUp('explain that more simply', state, null)).toBe(
      'Explain lab results in simpler terms',
    );
  });

  it('resolves a source request against the active concern', () => {
    expect(expandFollowUp('show me the source', state, null)).toBe(
      'Show me the evidence for lab results',
    );
  });

  it('resolves "why is that" against the active concern', () => {
    expect(expandFollowUp('why is that', state, null)).toBe('Why is lab results in my record?');
  });

  it('resolves "what changed after" against the active concern', () => {
    expect(expandFollowUp('what changed after', state, null)).toBe(
      'What changed after lab results?',
    );
  });

  it('resolves a medication follow-up to the medication record', () => {
    expect(expandFollowUp('my medication', state, null)).toBe(
      'What does my record say about my medications?',
    );
  });

  it('uses the AIContext title when no active concern is set', () => {
    expect(
      expandFollowUp('what about this', { activeConcern: null, lastQuestion: null }, potassiumContext),
    ).toBe('What does my record say about Potassium finding?');
  });

  it('leaves a pronoun question alone when a context is attached', () => {
    expect(expandFollowUp('explain this', state, potassiumContext)).toBe('explain this');
  });

  it('returns the text unchanged when there is nothing to resolve against', () => {
    expect(expandFollowUp('what about potassium', { activeConcern: null, lastQuestion: null }, null)).toBe(
      'what about potassium',
    );
  });
});

describe('extractConcern', () => {
  it('pulls "lab results" from a worry', () => {
    expect(extractConcern("I'm worried about my lab results")).toBe('lab results');
  });

  it('pulls "medications" from a medication mention', () => {
    expect(extractConcern('my medication')).toBe('medications');
  });

  it('pulls a named subject from "worried about …"', () => {
    expect(extractConcern("I'm worried about my blood pressure")).toBe('blood pressure');
  });

  it('returns null for a message with no concern', () => {
    expect(extractConcern('What changed?')).toBeNull();
  });
});

describe('isFollowUp', () => {
  it('recognises follow-up phrasings', () => {
    for (const text of ['what about that', 'why is that', 'show me the source', 'more simply', 'that result']) {
      expect(isFollowUp(text), `should be a follow-up: "${text}"`).toBe(true);
    }
  });

  it('does not treat a fresh question as a follow-up', () => {
    expect(isFollowUp('What is potassium?')).toBe(false);
  });
});

