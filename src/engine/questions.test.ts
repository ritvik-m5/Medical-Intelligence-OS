import { describe, expect, it } from 'vitest';
import { SAMPLE_DOCUMENTS, SAMPLE_PATIENT } from '../data/sampleCorpus';
import { ingestDocument } from './ingest';
import { buildGraph } from './graph';
import { derive } from './derive/engine';
import { snapshotAt, diffSnapshots } from './timeline';
import { findContradictions } from './contradiction';
import { addDays } from './text/normalize';
import type { ChangeEvent } from './types';
import type { Derivation } from './derive/types';
import {
  applyStatuses,
  generateQuestions,
  nextStatus,
  questionCounts,
  type QuestionInput,
  type RecordQuestion,
} from './questions';

/* ------------------------------------------------------------------ */
/* Record questions                                                    */
/*                                                                    */
/* Built from the real corpus, so every question is about content that  */
/* could only come from a genuine derivation. The second half corrupts  */
/* an input and asserts the change is *detected* — a question engine     */
/* that cannot be surprised cannot be trusted.                           */
/* ------------------------------------------------------------------ */

function input(): QuestionInput {
  const results = SAMPLE_DOCUMENTS.map((doc, index) => ingestDocument(doc, index)).sort((a, b) =>
    a.document.date.localeCompare(b.document.date),
  );
  const graph = buildGraph(SAMPLE_PATIENT, results);
  const asOf = graph.stats.spanEnd;
  const derivations = derive(graph, asOf);
  return {
    contradictions: findContradictions(graph),
    derivations,
    changes: diffSnapshots(snapshotAt(graph, addDays(asOf, -366)), snapshotAt(graph, asOf)),
  };
}

function questionsOf(next: QuestionInput): RecordQuestion[] {
  return generateQuestions(next);
}

describe('generating questions', () => {
  it('is deterministic', () => {
    expect(generateQuestions(input())).toEqual(generateQuestions(input()));
  });

  it('produces a question for every conflict, with a stable id', () => {
    const questions = generateQuestions(input());
    const conflicts = input().contradictions.filter((entry) => entry.kind !== 'documentation_gap');

    const conflictQuestions = questions.filter((question) => question.category === 'conflict');
    expect(conflictQuestions.length).toBe(conflicts.length);
    for (const question of conflictQuestions) {
      expect(question.id).toMatch(/^q:conflict:/);
      expect(question.destination).toBe('debugger');
      expect(question.question.length).toBeGreaterThan(10);
      expect(question.evidence.length).toBeGreaterThan(10);
    }
  });

  it('produces a question for every documentation gap', () => {
    const questions = generateQuestions(input());
    const gaps = input().contradictions.filter((entry) => entry.kind === 'documentation_gap');
    expect(questions.filter((question) => question.category === 'gap').length).toBe(gaps.length);
  });

  it('produces a question for every finding resting on grade C or D evidence', () => {
    const questions = generateQuestions(input());
    const weak = input().derivations.filter((entry) => entry.grade === 'C' || entry.grade === 'D');
    const evidenceQuestions = questions.filter((question) => question.category === 'evidence');

    expect(evidenceQuestions.length).toBe(weak.length);
    for (const question of evidenceQuestions) {
      expect(question.relatedDerivationIds.length).toBe(1);
      expect(question.destination).toBe('inference');
    }
  });

  it('never invents a question about something not in the artifact', () => {
    for (const question of generateQuestions(input())) {
      const traceable =
        question.relatedFactIds.length > 0 || question.relatedDerivationIds.length > 0;
      expect(traceable).toBe(true);
      expect(question.id.split(':')[1]).toMatch(/^(conflict|gap|evidence|unestablished|change)$/);
    }
  });

  it('orders conflicts before gaps before evidence before change', () => {
    const order = ['conflict', 'gap', 'evidence', 'unestablished', 'change'];
    let lastIndex = -1;
    for (const question of generateQuestions(input())) {
      const index = order.indexOf(question.category);
      expect(index).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
    }
  });
});

describe('the lifecycle', () => {
  it('cycles open → investigating → answered → dismissed → open', () => {
    expect(nextStatus('open')).toBe('investigating');
    expect(nextStatus('investigating')).toBe('answered');
    expect(nextStatus('answered')).toBe('dismissed');
    expect(nextStatus('dismissed')).toBe('open');
  });

  it('applies a status override without changing the question itself', () => {
    const question = generateQuestions(input())[0];
    const [applied] = applyStatuses([question], { [question.id]: 'answered' });

    expect(applied.status).toBe('answered');
    expect(applied.question).toBe(question.question);
    expect(applied.evidence).toBe(question.evidence);

/* ------------------------------------------------------------------ */
/* Mutation: a corrupt input must change the questions                  */
/* ------------------------------------------------------------------ */

describe('mutations are detected', () => {
  const base = input();

  it('changes when a contradiction is removed', () => {
    const conflicts = base.contradictions.filter((entry) => entry.kind !== 'documentation_gap');
    expect(conflicts.length).toBeGreaterThan(0);

    const withoutOne = {
      ...base,
      contradictions: base.contradictions.filter((entry) => entry.id !== conflicts[0].id),
    };

    expect(questionsOf(base).map((question) => question.id)).not.toEqual(
      questionsOf(withoutOne).map((question) => question.id),
    );
  });

  it('changes when a derivation is newly graded weak', () => {
    const first = base.derivations[0];
    const altered = { ...first, grade: 'C' as const } as Derivation;
    const next: QuestionInput = {
      ...base,
      derivations: [altered, ...base.derivations.slice(1)],
    };

    // A derivation newly graded weak must raise an evidence question for it.
    const after = questionsOf(next);
    const before = questionsOf(base);
    expect(after).not.toEqual(before);
    expect(after.some((question) => question.id === `q:evidence:${first.id}`)).toBe(
      after.some((question) => question.category === 'evidence'),
    );
  });

  it('changes when a change event loses its caveat', () => {
    const withCaveat = base.changes.find((change) => change.kind !== 'new_document');
    expect(withCaveat).toBeDefined();

    const stripped: ChangeEvent = { ...withCaveat!, caveat: '' };
    const next: QuestionInput = {
      ...base,
      changes: base.changes.map((change) => (change.id === withCaveat!.id ? stripped : change)),
    };

    expect(questionsOf(base).map((question) => question.id)).not.toEqual(
      questionsOf(next).map((question) => question.id),
    );
  });

  it('never produces a duplicate id', () => {
    const ids = questionsOf(base).map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every destination is a real, non-empty view id', () => {
    const destinations = new Set([
      'debugger',
      'quality',
      'inference',
      'records',
      'timemachine',
      'lab',
    ]);
    for (const question of questionsOf(base)) {
      expect(destinations.has(question.destination)).toBe(true);
    }
  });
});

  });

  it('counts the split correctly', () => {
    const questions = generateQuestions(input());
    const overrides = Object.fromEntries(
      questions.slice(0, 2).map((question) => [question.id, 'answered' as const]),
    );
    const counts = questionCounts(applyStatuses(questions, overrides));

    expect(counts.total).toBe(questions.length);
    expect(counts.answered).toBe(Math.min(2, questions.length));
    expect(counts.open + counts.investigating + counts.answered + counts.dismissed).toBe(
      counts.total,
    );
  });
});
