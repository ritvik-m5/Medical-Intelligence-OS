import { describe, expect, it } from 'vitest';
import {
  contextForFinding,
  contextQuestions,
  isPronounQuestion,
  validateAIContext,
} from './context';
import type { Derivation } from '../engine/derive/types';
import type { HealthGraph } from '../engine/types';

const derivation = {
  id: 'derivation-1',
  title: 'Potassium is out of range',
  statement: 'Potassium has a value outside the plausible range.',
  factIds: ['fact-1', 'fact-2'],
  docIds: ['doc-1'],
  ruleId: 'quality.implausible_value',
  severity: 'medium',
  grade: 'B',
  confidence: 0.8,
} as unknown as Derivation;

const graph = {
  facts: [{ id: 'fact-1' }, { id: 'fact-2' }],
  documents: [{ id: 'doc-1' }],
  entities: [],
} as unknown as HealthGraph;

describe('contextForFinding', () => {
  it('preserves the full provenance of the derivation', () => {
    const context = contextForFinding('MM-1', '2026-09-15', derivation);
    expect(context.kind).toBe('finding');
    expect(context.id).toBe('derivation-1');
    expect(context.title).toBe('Potassium is out of range');
    expect(context.factIds).toEqual(['fact-1', 'fact-2']);
    expect(context.sourceIds).toEqual(['doc-1']);
    expect(context.derivationIds).toEqual(['derivation-1']);
  });
});

describe('validateAIContext', () => {
  it('accepts a finding that still exists in the artifact', () => {
    const context = contextForFinding('MM-1', '2026-09-15', derivation);
    expect(validateAIContext(context, graph, [derivation]).valid).toBe(true);
  });

  it('rejects a finding that is no longer in the artifact', () => {
    const context = contextForFinding('MM-1', '2026-09-15', derivation);
    const result = validateAIContext(context, graph, []);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('no longer');
  });

  it('rejects a deleted document', () => {
    const context = {
      artifactId: 'MM-1',
      asOf: '2026-09-15',
      kind: 'document' as const,
      id: 'doc-gone',
      title: 'Gone',
      summary: '',
      sourceIds: [],
      factIds: [],
      derivationIds: [],
    };
    expect(validateAIContext(context, graph, []).valid).toBe(false);
  });
});

describe('contextQuestions', () => {
  it('offers finding-specific questions', () => {
    const questions = contextQuestions(contextForFinding('MM-1', '2026-09-15', derivation));
    expect(questions).toContain('Explain this');
    expect(questions).toContain('Why is this here?');
    expect(questions).toContain('Show the evidence');
  });
});

describe('isPronounQuestion', () => {
  it('recognises pronouns that refer to the active context', () => {
    expect(isPronounQuestion('this')).toBe(true);
    expect(isPronounQuestion('explain this')).toBe(true);
    expect(isPronounQuestion('what does this mean')).toBe(true);
    expect(isPronounQuestion('this finding')).toBe(true);
  });

  it('does not mistake a real question for a pronoun', () => {
    expect(isPronounQuestion('What is potassium')).toBe(false);
    expect(isPronounQuestion('Summarise what you found')).toBe(false);
  });
});
