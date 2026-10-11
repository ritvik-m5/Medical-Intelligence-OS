import type { Derivation } from '../engine/derive/types';
import type { QualityReport } from '../engine/derive/types';
import type { ArtifactIdentity } from '../engine/identity';
import type { ProvenanceReport } from '../engine/verify';
import type { ChangeEvent, Contradiction, HealthGraph, ISODate, Snapshot } from '../engine/types';
import { CONTRADICTION_LABEL } from '../engine/types';
import { generateQuestions } from '../engine/questions';
import { isGeneralChat, friendlyFallback } from './general';
import type { Explanation, ExplanationIntent, ExplanationSource, ExplainerBackend } from '../explain/types';
import { GroundedExplainer } from '../explain/grounded';
import type { ViewId } from '../state/store';

/* ------------------------------------------------------------------ */
/* Talking to the record                                               */
/*                                                                    */
/* A conversation, but not a chatbot. The engine answers first, from    */
/* the artifact, and the answer is assembled rather than generated. A   */
/* model may rewrite the wording; it cannot add a sentence's worth of   */
/* meaning.                                                             */
/*                                                                    */
/* What makes this different from a question box is that every reply     */
/* carries three more things:                                            */
/*                                                                    */
/*   actions    what the reader can do about the answer, as real links   */
/*   follow-ups questions this record can actually answer next           */
/*   receipt    what produced it, so the answer is quotable              */
/*                                                                    */
/* Nothing here invents a capability. If the record cannot answer, the   */
/* reply says which question would have been answerable instead.         */
/* ------------------------------------------------------------------ */

export type ChatIntent =
  | ExplanationIntent
  | 'changed'
  | 'conflicts'
  | 'missing'
  | 'timeline'
  | 'questions';

export interface ChatAction {
  /** What pressing it does. */
  kind: 'proof' | 'evidence' | 'view';
  label: string;
  /** Why it is worth pressing, in one line. */
  detail: string;
  view?: ViewId;
  derivationId?: string;
  factIds?: string[];
  docIds?: string[];
}

/**
 * What produced an answer.
 *
 * The point of a receipt is that a reader can quote it. Every field here is
 * read from the artifact, not written by the model — including `modelUsed`,
 * which is the one thing about the answer the engine cannot know on its own.
 */
export interface Receipt {
  artifactId: string;
  displayId: string;
  engineVersion: string;
  rulesetVersion: string;
  documents: number;
  facts: number;
  derivations: number;
  /** Steps in the proof this answer is about, when it is about one. */
  steps: number | null;
  verification: { score: number; clean: boolean };
  modelUsed: boolean;
}

export interface ChatReply {
  paragraphs: string[];
  sources: ExplanationSource[];
  notAnswered: string | null;
  actions: ChatAction[];
  followUps: string[];
  receipt: Receipt;
  generated: boolean;
  intent: ChatIntent;
  /** The question as the engine understood it, when it read it differently. */
  understoodAs: string | null;
}

export interface ChatContext {
  graph: HealthGraph;
  derivations: Derivation[];
  identity: ArtifactIdentity;
  snapshot: Snapshot;
  changes: ChangeEvent[];
  contradictions: Contradiction[];
  quality: QualityReport;
  verification: ProvenanceReport;
  asOf: ISODate;
  /** The finding the reader has open, so "why" resolves to it. */
  focus?: string;
}

/* ------------------------------------------------------------------ */
/* Understanding the question                                          */
/* ------------------------------------------------------------------ */

/**
 * What is being asked.
 *
 * Checked in order, because a question can look like two things. "What changed
 * in my medication" is about change, not about the record's shape, so the change
 * words are tested before the summary words.
 *
 * The stems are matched with `\w*` rather than a closing word boundary, because
 * the natural phrasings are the inflected ones: "contradiction" and "conflicts"
 * are how people ask, not "contradict" and "conflict". A leading boundary is
 * kept, so "exchange" does not read as "change".
 */
export function detectChatIntent(question: string): ChatIntent {
  const text = question.toLowerCase();

  if (/\b(what changed|changed since|diff\w*|difference|what is new|what's new|change\w*)\b/.test(text)) {
    return 'changed';
  }
  if (/\b(conflict\w*|contradict\w*|disagree\w*|inconsisten\w*|does not match|doesn't match)\b/.test(text)) {
    return 'conflicts';
  }
  if (/\b(missing|gap\w*|not documented|absent|overdue|no evidence|never recorded)\b/.test(text)) {
    return 'missing';
  }
  if (/\b(timeline|interval\w*|over time|history of|when did|how long)\b/.test(text)) {
    return 'timeline';
  }
  if (/\b(open question\w*|unresolved\w*|unanswered\w*|still unknown|needs investigation|what (do|should) i (investigate|look into|need to))\b/.test(text)) {
    return 'questions';
  }
  return 'unknown';
}

/** The engine's own vocabulary for the question, used when it reads it as one of its own. */
export function chatIntentFromExplanation(intent: ExplanationIntent): ChatIntent {
  return intent;
}

/* ------------------------------------------------------------------ */
/* The receipt                                                         */
/* ------------------------------------------------------------------ */

export function receiptFor(
  context: ChatContext,
  options: { derivation?: Derivation | null; modelUsed: boolean },
): Receipt {
  return {
    artifactId: context.identity.artifactId,
    displayId: context.identity.id,
    engineVersion: context.identity.engineVersion,
    rulesetVersion: context.identity.rulesetVersion,
    documents: context.graph.documents.length,
    facts: context.graph.facts.length,
    derivations: context.derivations.length,
    steps: options.derivation ? options.derivation.steps.length : null,
    verification: {
      score: context.verification.score,
      clean: context.verification.clean,
    },
    modelUsed: options.modelUsed,
  };
}

/* ------------------------------------------------------------------ */
/* Answers the record can give directly                                */
/*                                                                    */
/* These four read structures the engine already built — changes,       */
/* contradictions, quality, the snapshot — so they cannot disagree with  */
/* the views that show the same data.                                   */
/* ------------------------------------------------------------------ */

interface Assembly {
  paragraphs: string[];
  sources: ExplanationSource[];
  notAnswered: string | null;
  actions: ChatAction[];
}

function sourceFromChange(change: ChangeEvent): ExplanationSource {
  return {
    kind: 'derivation',
    id: change.id,
    label: `${change.entityLabel} — ${change.kind.replace(/_/g, ' ')}`,
    detail: `${change.fromDate} → ${change.toDate}: ${change.deltaText}`,
    factIds: [change.fromFactId, change.toFactId].filter(Boolean) as string[],
    docIds: change.docIds,
  };
}

function answerChanged(context: ChatContext): Assembly {
  const changes = context.changes;

  if (changes.length === 0) {
    return {
      paragraphs: [
        `**No documented change was found** in the window this artifact covers, which runs to ${context.asOf}.`,
        'That is a statement about the documents, not about you. The record contains no pair of statements that describe the same thing differently at two points in time.',
      ],
      sources: [],
      notAnswered:
        'Nothing in these documents changed. That is not the same as nothing having happened — a change nobody wrote down leaves no trace in the record.',
      actions: [
        {
          kind: 'view',
          label: 'Open the Time Machine',
          detail: 'Compare any two dates yourself, rather than the default window',
          view: 'timemachine',
        },
      ],
    };
  }

  const byKind = new Map<string, ChangeEvent[]>();
  for (const change of changes) {
    byKind.set(change.kind, [...(byKind.get(change.kind) ?? []), change]);
  }

  const summary = Array.from(byKind.entries())
    .map(([kind, entries]) => `${entries.length} ${kind.replace(/_/g, ' ')}`)
    .join(', ');

  const paragraphs = [
    `**${changes.length} documented change${changes.length === 1 ? '' : 's'}** in the window this artifact covers: ${summary}.`,
    ...changes
      .slice(0, 4)
      .map(
        (change) =>
          `**${change.entityLabel}** — ${change.deltaText} (${change.fromDate} → ${change.toDate}). ${change.caveat}`,
      ),
  ];

  if (changes.length > 4) {
    paragraphs.push(`And ${changes.length - 4} more, listed in full in the Time Machine.`);
  }

  return {
    paragraphs,
    sources: changes.slice(0, 8).map(sourceFromChange),
    notAnswered:
      'A change is between two documents, not between two days. The engine knows what the record shows at each end of the window; it does not know when in between the change actually happened, and it does not know what happened that nobody wrote down.',
    actions: [
      {
        kind: 'view',
        label: 'See all changes side by side',
        detail: 'The Time Machine lists every change with both dates and both documents',
        view: 'timemachine',
      },
      {
        kind: 'view',
        label: 'Open the record as of an earlier date',
        detail: 'Every view updates together to that moment',
        view: 'overview',
      },
    ],
  };
}

function answerConflicts(context: ChatContext): Assembly {
  const conflicts = context.contradictions;

  if (conflicts.length === 0) {
    return {
      paragraphs: [
        '**No contradiction was detected** across the documents in this artifact.',
        `The engine compared every statement that describes the same thing — medications, conditions, measurements, demographics — across ${context.graph.documents.length} documents and found no pair that disagrees.`,
        'An absence of contradictions is not proof that the record is correct. It means nothing in these documents contradicts anything else in them.',
      ],
      sources: [],
      notAnswered:
        'A contradiction between this record and a document that is not in it cannot be detected, because that document was never read.',
      actions: [
        {
          kind: 'view',
          label: 'Open the Debugger',
          detail: 'Every consistency check, including the ones that found nothing',
          view: 'debugger',
        },
      ],
    };
  }

  const high = conflicts.filter((entry) => entry.severity === 'high');

  const paragraphs = [
    `**${conflicts.length} contradiction${conflicts.length === 1 ? '' : 's'}** across ${context.graph.documents.length} documents${high.length > 0 ? `, ${high.length} of them high severity` : ''}.`,
    ...conflicts
      .slice(0, 4)
      .map(
        (entry) =>
          `**${CONTRADICTION_LABEL[entry.kind]}** — ${entry.detail} The engine does not decide which statement is right.`,
      ),
  ];

  if (conflicts.length > 4) {
    paragraphs.push(`And ${conflicts.length - 4} more, each with both sides quoted.`);
  }

  return {
    paragraphs,
    sources: conflicts.slice(0, 8).map((entry) => ({
      kind: 'fact',
      id: entry.id,
      label: entry.title,
      detail: entry.detail,
      factIds: entry.factIds,
      docIds: entry.docIds,
    })),
    notAnswered:
      'The engine reports disagreement and refuses to resolve it. Which document is correct is a question for whoever wrote them.',
    actions: [
      {
        kind: 'view',
        label: 'Open the Debugger',
        detail: 'Both sides of every conflict, with the documents quoted',
        view: 'debugger',
      },
      {
        kind: 'view',
        label: 'Check the record quality',
        detail: 'Whether the problem is the health or the paperwork',
        view: 'quality',
      },
    ],
  };
}

function answerMissing(context: ChatContext): Assembly {
  const gaps = context.contradictions.filter(
    (entry) => entry.kind === 'documentation_gap',
  );
  const weakFindings = context.derivations.filter((entry) => entry.grade === 'C' || entry.grade === 'D');
  const weakest = context.quality.dimensions
    .filter((dimension) => dimension.score < 0.7)
    .sort((a, b) => a.score - b.score);

  if (gaps.length === 0 && weakFindings.length === 0 && weakest.length === 0) {
    return {
      paragraphs: [
        '**Nothing in this record reads as missing or weak** on the checks the engine runs.',
        `All nine quality dimensions scored at or above 0.7, every finding rests on grade A or B evidence, and no documentation gap was detected across ${context.graph.documents.length} documents.`,
        'This is not a statement that the record is complete. It is a statement that nothing in it looks absent by the engine\u2019s checks.',
      ],
      sources: [],
      notAnswered:
        'The engine can only detect a gap where something else in the record implies it. A test that was never ordered and never mentioned leaves no trace to find.',
      actions: [
        {
          kind: 'view',
          label: 'Open the record quality scorecard',
          detail: 'What each of the nine dimensions measured',
          view: 'quality',
        },
      ],
    };
  }

  const paragraphs: string[] = [];

  if (gaps.length > 0) {
    paragraphs.push(
      `**${gaps.length} documentation gap${gaps.length === 1 ? '' : 's'}** — a problem the record documents as active, with nothing later saying how it is being followed up.`,
    );
    for (const gap of gaps.slice(0, 3)) {
      paragraphs.push(`**${gap.title}** — ${gap.detail}`);
    }
  }

  if (weakFindings.length > 0) {
    paragraphs.push(
      `**${weakFindings.length} finding${weakFindings.length === 1 ? '' : 's'}** rest${weakFindings.length === 1 ? 's' : ''} on weaker evidence (grade C or D): ${weakFindings
        .slice(0, 3)
        .map((entry) => `“${entry.title}”`)
        .join(', ')}${weakFindings.length > 3 ? ', and others' : ''}.`,
    );
  }

  if (weakest.length > 0) {
    paragraphs.push(
      `The lowest quality scores are ${weakest
        .slice(0, 3)
        .map((dimension) => `${dimension.label} (${Math.round(dimension.score * 100)}%)`)
        .join(', ')}.`,
    );
  }

  return {
    paragraphs,
    sources: gaps.slice(0, 6).map((gap) => ({
      kind: 'fact',
      id: gap.id,
      label: gap.title,
      detail: gap.detail,
      factIds: gap.factIds,
      docIds: gap.docIds,
    })),
    notAnswered:
      'A gap is an absence. The engine can say what the record does not contain; it cannot say why, and it cannot say what happened outside the documents.',
    actions: [
      {
        kind: 'view',
        label: 'Open the record quality scorecard',
        detail: 'Nine dimensions, each with the evidence behind its score',
        view: 'quality',
      },
      {
        kind: 'view',
        label: 'Find the weakest findings',
        detail: 'Stability profiles rank every finding by how well the record supports it',
        view: 'lab',
      },
    ],
  };
}

function answerTimeline(context: ChatContext): Assembly {
  const conditions = context.snapshot.conditions;
  const medications = context.snapshot.medications;

  if (conditions.length === 0 && medications.length === 0) {
    return {
      paragraphs: [
        '**The record establishes no intervals** — no condition and no medication course that spans more than a single document.',
        `Across ${context.graph.documents.length} documents, nothing was documented with a start and an end that the engine could reconstruct.`,
      ],
      sources: [],
      notAnswered:
        'An interval needs at least two dated statements. A condition mentioned once, with no later reference, cannot be reconstructed into a period.',
      actions: [
        {
          kind: 'view',
          label: 'Open Intervals',
          detail: 'How the engine reconstructs periods from dated statements',
          view: 'temporal',
        },
      ],
    };
  }

  const paragraphs = [
    `**${conditions.length} condition${conditions.length === 1 ? '' : 's'} and ${medications.length} medication course${medications.length === 1 ? '' : 's'}** were reconstructed from the documents.`,
    ...conditions
      .slice(0, 3)
      .map(
        (condition) =>
          `**${condition.label}** — documented from ${condition.since}, last seen ${condition.lastDocumented} (${condition.status}).`,
      ),
    ...medications
      .slice(0, 3)
      .map(
        (medication) =>
          `**${medication.label}** — documented from ${medication.since}, last seen ${medication.lastDocumented} (${medication.status}).`,
      ),
  ];

  return {
    paragraphs,
    sources: [...conditions, ...medications].slice(0, 8).map((entry) => ({
      kind: 'derivation',
      id: entry.entityKey,
      label: entry.label,
      detail: `${entry.since} → ${entry.lastDocumented} (${entry.status})`,
      factIds: entry.factIds,
      docIds: entry.docIds,
    })),
    notAnswered:
      'The window is what the documents establish, not how long the condition lasted. A problem documented in 2021 and again in 2024 was not necessarily present in between — it was not necessarily absent either.',
    actions: [
      {
        kind: 'view',
        label: 'Open Intervals',
        detail: 'Every period on one timeline, with the statements that bound it',
        view: 'temporal',
      },
      {
        kind: 'view',
        label: 'Open the Time Machine',
        detail: 'What the record established at any point in that span',
        view: 'timemachine',
      },
    ],
  };
}

/**
 * Answer "what are the open questions?" from the record itself.
 *
 * Questions are generated — never invented — from the same contradictions,
 * derivations and changes the views read, so this answer cannot disagree with
 * the State of the Record. Every one carries a destination the reader can act
 * on.
 */
function answerQuestions(context: ChatContext): Assembly {
  const questions = generateQuestions({
    contradictions: context.contradictions,
    derivations: context.derivations,
    changes: context.changes,
  });
  const nonDismissed = questions.filter((question) => question.status !== 'dismissed');
  const top = nonDismissed.slice(0, 5);

  const paragraphs = [`The record raises ${nonDismissed.length} open question${nonDismissed.length === 1 ? '' : 's'}.`];

  const detail = top
    .map((question, index) => `${index + 1}. ${question.question} — ${question.evidence}`)
    .join('\n');
  paragraphs.push(detail || 'Nothing in this record currently raises an open question.');

  const sources = top
    .map((question) => ({
      kind: 'fact' as const,
      id: question.relatedFactIds[0] ?? question.relatedDerivationIds[0] ?? question.id,
      label: question.question,
      detail: question.evidence,
      factIds: question.relatedFactIds,
      docIds: [],
    }))
    .filter((source) => source.id);

  const actions = top.map((question) => ({
    kind: 'view' as const,
    label: `Investigate: ${question.question}`,
    detail: `${question.evidence} — opens ${question.destination}`,
    view: question.destination,
  }));

  return {
    paragraphs,
    sources,
    notAnswered:
      nonDismissed.length === 0
        ? 'I found no open question; this does not mean the record is complete, only that nothing in it raises one it cannot settle.'
        : 'These are questions the record raises but cannot answer. Resolving them needs a human decision, not more inference.',
    actions,
  };
}

/* ------------------------------------------------------------------ */
/* What to ask next                                                    */
/*                                                                    */
/* Suggestions come from what this record actually contains, so a        */
/* reader is never offered a question the artifact cannot answer.        */
/* ------------------------------------------------------------------ */

export function followUpsFor(context: ChatContext, intent: ChatIntent): string[] {
  void context;
  const common = ['Summarise what you found', 'What can you not tell me?'];
  const byIntent: Partial<Record<ChatIntent, string[]>> = {
    why: ['Show me the exact characters that caused it', 'What would make this finding disappear?'],
    evidence: ['Which document is responsible?', 'What would make this finding disappear?'],
    summary: ['What changed?', 'Where does the record disagree with itself?'],
    severity: ['Why is that the most serious?', 'What is missing?'],
    changed: ['What was knowable a year ago?', 'Which document caused the change?'],
    conflicts: ['What is missing?', 'Show me the record quality'],
    missing: ['Which conclusions are fragile?', 'Where does the record disagree with itself?'],
    timeline: ['What changed over that period?', 'Summarise what you found'],
    questions: ['Why is this finding present?', 'What is missing?'],
    limits: ['Summarise what you found', 'Where does the record disagree with itself?'],
  };

  const specific = byIntent[intent] ?? [];
  return [...specific, ...common]
    .filter((question, index, all) => all.indexOf(question) === index)
    .slice(0, 4);
}

/**
 * The questions this artifact is worth opening with.
 *
 * Chosen from what the record contains rather than from a fixed list, so a
 * reader is never shown a suggestion that leads nowhere.
 */
export function openingQuestions(context: ChatContext): string[] {
  const questions: string[] = [];

  if (context.changes.length > 0) questions.push('What changed?');
  if (context.contradictions.length > 0) {
    questions.push('Where does the record disagree with itself?');
  }
  if (context.derivations.length > 0) questions.push('Summarise what you found');

  const gaps = context.contradictions.filter((entry) => entry.kind === 'documentation_gap');
  const weak = context.derivations.filter((entry) => entry.grade === 'C' || entry.grade === 'D');
  if (gaps.length > 0 || weak.length > 0) questions.push('What is missing?');

  questions.push('What can you not tell me?');
  if (context.snapshot.conditions.length + context.snapshot.medications.length > 0) {
    questions.push('What do the intervals look like?');
  }

  return questions.slice(0, 5);
}

/* ------------------------------------------------------------------ */
/* Answering                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_BACKEND: ExplainerBackend = new GroundedExplainer();

/**
 * The limitation every answer carries when the explainer does not supply one.
 *
 * A reply without a limitation reads as a complete answer, and nothing here is
 * ever complete: the engine can only speak to what is written down. This is the
 * floor, not a replacement — where the explainer has something more specific to
 * say, that is what appears.
 */
const FLOOR_LIMITATION =
  'The engine can only speak to what these documents say. Anything that was never written down is outside what it can answer, however relevant it might be.';

/**
 * Answer a question about the record.
 *
 * Two paths, and the order matters. Questions about change, conflict, absence
 * and time are answered here, from the structures the engine already built, so
 * the answer cannot disagree with the view that shows the same data. Everything
 * else goes to the explainer, which owns the proof-shaped answers.
 *
 * Either way the reply carries its sources, its limitations, what to do next and
 * a receipt.
 */
export async function converse(
  question: string,
  context: ChatContext,
  backend: ExplainerBackend = DEFAULT_BACKEND,
): Promise<ChatReply> {
  const trimmed = question.trim();
  const intent = detectChatIntent(trimmed);

  /*
   * Ordinary conversation is answered conversationally, before any medical
   * routing. A greeting, thanks or "what can you do?" is not a failed query;
   * forcing it through intent detection is exactly what makes the assistant
   * feel like a keyword matcher instead of a person you are talking to.
   */
  if (isGeneralChat(trimmed)) {
    return {
      paragraphs: friendlyFallback(trimmed),
      sources: [],
      notAnswered: null,
      actions: [],
      followUps: followUpsFor(context, 'summary'),
      receipt: receiptFor(context, { modelUsed: false }),
      generated: false,
      intent: 'greeting',
      understoodAs: null,
    };
  }

  if (
    intent === 'changed' ||
    intent === 'conflicts' ||
    intent === 'missing' ||
    intent === 'timeline' ||
    intent === 'questions'
  ) {
    const assembly =
      intent === 'changed'
        ? answerChanged(context)
        : intent === 'conflicts'
          ? answerConflicts(context)
          : intent === 'missing'
            ? answerMissing(context)
            : intent === 'timeline'
              ? answerTimeline(context)
              : answerQuestions(context);

    return {
      paragraphs: assembly.paragraphs,
      sources: assembly.sources,
      notAnswered: assembly.notAnswered,
      actions: assembly.actions,
      followUps: followUpsFor(context, intent),
      receipt: receiptFor(context, { modelUsed: false }),
      generated: false,
      intent,
      understoodAs: null,
    };
  }

  /* Everything else goes to the explainer, which owns the proof-shaped answers. */
  const explanation: Explanation = await backend.explain({
    question: trimmed,
    graph: context.graph,
    derivations: context.derivations,
    identity: context.identity,
    focus: context.focus,
  });

  const focusDerivation = context.derivations.find((entry) => entry.id === context.focus) ?? null;

  const actions: ChatAction[] = [];
  if (focusDerivation) {
    actions.push({
      kind: 'proof',
      label: 'Show the full proof',
      detail: `${focusDerivation.steps.length} steps, from the documented statements to the conclusion`,
      derivationId: focusDerivation.id,
    });
  }
  const withFacts = explanation.sources.find((source) => source.factIds.length > 0);
  if (withFacts) {
    actions.push({
      kind: 'evidence',
      label: 'Show me the exact characters',
      detail: `The span behind \u201c${withFacts.label}\u201d`,
      factIds: withFacts.factIds,
      docIds: withFacts.docIds,
    });
  }
  if (explanation.intent === 'summary' || explanation.intent === 'count') {
    actions.push({
      kind: 'view',
      label: 'Open the inference board',
      detail: 'Every finding with its proof, filterable',
      view: 'inference',
    });
  }

  return {
    paragraphs: explanation.paragraphs,
    sources: explanation.sources,
    notAnswered: explanation.notAnswered ?? FLOOR_LIMITATION,
    actions,
    followUps: followUpsFor(context, explanation.intent),
    receipt: receiptFor(context, {
      derivation: focusDerivation,
      modelUsed: explanation.generated,
    }),
    generated: explanation.generated,
    intent: explanation.intent,
    understoodAs: explanation.intent === 'unknown' ? 'not a question the record can answer' : null,
  };
}

