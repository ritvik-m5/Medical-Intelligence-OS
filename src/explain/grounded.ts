import type { Derivation } from '../engine/derive/types';
import { RULE_LABEL, STEP_KIND_LABEL } from '../engine/derive/types';
import { verificationHeadline } from '../engine/verify';
import { verifyProvenance } from '../engine/verify';
import { isPronounQuestion } from '../ai/context';
import type {
  Explanation,
  ExplanationIntent,
  ExplanationRequest,
  ExplanationSource,
  ExplainerBackend,
} from './types';

/* ------------------------------------------------------------------ */
/* The grounded explainer                                              */
/*                                                                    */
/* Deterministic, offline, and incapable of saying anything the engine */
/* did not already conclude. Every paragraph is assembled from the      */
/* proof graph; every claim carries the spans it came from.             */
/*                                                                    */
/* This is the shipped default precisely because it cannot hallucinate: */
/* its entire vocabulary is the set of derivations it was handed.       */
/* ------------------------------------------------------------------ */

/**
 * Work out what is being asked.
 *
 * Keyword rules rather than a model, and the result is reported to the reader as
 * `intent`. When nothing matches, the explainer says it did not understand and
 * lists what it can answer, which is more useful than a confident guess.
 */
export function detectIntent(question: string): ExplanationIntent {
  const text = question.toLowerCase().trim();

  // A bare greeting is met as a greeting, not as a failed question.
  if (/^(hi|hey|hello|hiya|howdy|yo|sup|good (morning|afternoon|evening))([!,.\s]*(there)?)?$/i.test(text)) {
    return 'greeting';
  }

  if (/\bwhy\b|\bbecause\b|\bexplain why\b/.test(text)) return 'why';
  if (/summar|overview|what did you find|what have you found|\bexplain\b/.test(text)) return 'summary';
  if (/serious|severe|urgent|high severity|worry|danger/.test(text)) return 'severity';
  if (/evidence|source|span|prove|proof|cite|citation|show me where/.test(text)) return 'evidence';
  if (/cannot|can't|not tell|limit|unable|what don't you know|refuse/.test(text)) return 'limits';
  if (/artifact|identity|reproduc|hash|same result|version/.test(text)) return 'identity';
  if (/how many|count|number of/.test(text)) return 'count';
  if (/what (is|are) |tell me about |what does .* (mean|refer to)/.test(text)) return 'concept';
  return 'unknown';
}

/** Pull a target term out of a "what is X" style question, lower-cased. */
function conceptTerm(question: string): string | null {
  const text = question.toLowerCase().trim();
  const match =
    text.match(/what (?:is|are) (?:a |an |the |my )?([^?]+?)[.!?]*$/) ??
    text.match(/tell me about (.+?)[.!?]*$/) ??
    text.match(/what does (.+?) (?:mean|refer to)/);
  if (!match) return null;
  const term = match[1].trim();
  return term.length >= 2 ? term : null;
}

/**
 * Resolve a question against the focused object.
 *
 * "this", "explain this", "what does this mean" are meaningless without a
 * focus; with one, they resolve to the focused finding's proof. Without one,
 * they fall through to `detectIntent`, which correctly answers "unknown".
 */
export function resolveIntent(question: string, focus?: string): ExplanationIntent {
  if (focus && isPronounQuestion(question)) return 'why';
  return detectIntent(question);
}

function derivationSource(derivation: Derivation): ExplanationSource {
  return {
    kind: 'derivation',
    id: derivation.id,
    label: derivation.title,
    detail: `${RULE_LABEL[derivation.ruleId] ?? derivation.ruleId} · grade ${derivation.grade} · confidence ${derivation.confidence.toFixed(2)}`,
    factIds: derivation.factIds,
    docIds: derivation.docIds,
  };
}

/** Every span a derivation rests on, as sources. */
function spanSources(request: ExplanationRequest, derivation: Derivation): ExplanationSource[] {
  const out: ExplanationSource[] = [];
  const seen = new Set<string>();
  for (const factId of derivation.factIds) {
    if (seen.has(factId)) continue;
    seen.add(factId);
    const fact = request.graph.facts.find((candidate) => candidate.id === factId);
    if (!fact) continue;
    out.push({
      kind: 'fact',
      id: fact.id,
      label: fact.quote.length > 120 ? `${fact.quote.slice(0, 119)}…` : fact.quote,
      detail: `${fact.docId} · characters ${fact.span[0]}–${fact.span[1]} · read by ${fact.extractor}`,
      factIds: [fact.id],
      docIds: [fact.docId],
    });
  }
  return out;
}

function pickTarget(request: ExplanationRequest): Derivation | null {
  if (request.focus) {
    const focused = request.derivations.find((derivation) => derivation.id === request.focus);
    if (focused) return focused;
  }
  // Otherwise the most severe, then the most confident.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return (
    [...request.derivations].sort(
      (a, b) => rank[a.severity] - rank[b.severity] || b.confidence - a.confidence,
    )[0] ?? null
  );
}

/* --------------------------- The answers --------------------------- */

function answerWhy(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  const target = pickTarget(request);
  if (!target) {
    return {
      paragraphs: [
        'No rule fired on this record, so there is nothing to explain. That is a result rather than an absence: the engine ran and concluded nothing.',
      ],
      sources: [],
      notAnswered: 'There is no finding to trace.',
      intent: 'why',
    };
  }

  const ruleName = RULE_LABEL[target.ruleId] ?? target.ruleId;
  const paragraphs: string[] = [
    `**${target.title}**`,
    `The rule that produced it is **${ruleName}** (\`${target.ruleId}\`). It rests on ${target.factIds.length} documented statement${target.factIds.length === 1 ? '' : 's'} across ${target.docIds.length} document${target.docIds.length === 1 ? '' : 's'}, and the proof has ${target.steps.length} steps.`,
  ];

  // Walk the proof in order, because it is stored topologically.
  for (const step of target.steps) {
    paragraphs.push(
      `*${STEP_KIND_LABEL[step.kind]}* — **${step.label}**\n${step.justification}`,
    );
  }

  paragraphs.push(`**The conclusion.** ${target.statement}`);
  paragraphs.push(`**What this does not say.** ${target.notConcluded}`);
  if (target.satisfiableBy) {
    paragraphs.push(`**What would clear it.** ${target.satisfiableBy}`);
  }
  paragraphs.push(
    `Confidence is ${target.confidence.toFixed(2)} and the evidence grade is ${target.grade}. The grade is the weakest grade among the premises: a chain of reasoning is only as strong as its weakest documented link.`,
  );

  return {
    paragraphs,
    sources: [derivationSource(target), ...spanSources(request, target)],
    notAnswered: null,
    intent: 'why',
  };
}

function answerSummary(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  const total = request.derivations.length;
  if (total === 0) {
    return {
      paragraphs: [
        `The engine read ${request.graph.documents.length} documents, extracted ${request.graph.facts.length} facts and resolved ${request.graph.entities.length} concepts. No rule fired.`,
        'A rule firing zero times is a result. It is reported rather than hidden, because "we checked and found nothing" and "we did not check" are different statements.',
      ],
      sources: [],
      notAnswered: null,
      intent: 'summary',
    };
  }

  const high = request.derivations.filter((derivation) => derivation.severity === 'high');
  const categories = new Map<string, number>();
  for (const derivation of request.derivations) {
    categories.set(derivation.category, (categories.get(derivation.category) ?? 0) + 1);
  }

  const paragraphs = [
    `${total} findings over ${request.graph.documents.length} documents and ${request.graph.facts.length} facts. ${high.length} of them are high severity.`,
    `By category: ${Array.from(categories.entries())
      .map(([category, count]) => `${category} ${count}`)
      .join(', ')}.`,
    'The highest-ranked findings are:',
  ];

  const shown = request.derivations.slice(0, 5);
  for (const derivation of shown) {
    paragraphs.push(
      `• **${derivation.title}** — ${RULE_LABEL[derivation.ruleId] ?? derivation.ruleId}, ${derivation.severity} severity, confidence ${derivation.confidence.toFixed(2)}.`,
    );
  }
  if (total > shown.length) {
    paragraphs.push(
      `${total - shown.length} further finding${total - shown.length === 1 ? '' : 's'} are listed in the artifact.`,
    );
  }

  return {
    paragraphs,
    sources: shown.map(derivationSource),
    notAnswered: null,
    intent: 'summary',
  };
}

function answerSeverity(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const ordered = [...request.derivations].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.confidence - a.confidence,
  );
  const serious = ordered.filter((derivation) => derivation.severity === 'high');

  if (serious.length === 0) {
    return {
      paragraphs: [
        `No finding on this record is high severity. ${ordered.length} finding${ordered.length === 1 ? '' : 's'} were produced, and the most severe ${ordered.length === 1 ? 'is' : 'are'} medium or low.`,
        'Severity reflects how much a finding would change what a reader does next, not how likely the underlying event is.',
      ],
      sources: ordered.slice(0, 3).map(derivationSource),
      notAnswered: null,
      intent: 'severity',
    };
  }

  const paragraphs = [
    `${serious.length} finding${serious.length === 1 ? ' is' : 's are'} high severity.`,
  ];
  for (const derivation of serious.slice(0, 5)) {
    paragraphs.push(
      `• **${derivation.title}** — ${derivation.statement} (${RULE_LABEL[derivation.ruleId] ?? derivation.ruleId})`,
    );
  }
  paragraphs.push(
    'Severity is a property of the finding, not a diagnosis. Every one of these states what it does not conclude.',
  );

  return {
    paragraphs,
    sources: serious.slice(0, 5).map(derivationSource),
    notAnswered: null,
    intent: 'severity',
  };
}

function answerEvidence(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  const target = pickTarget(request);
  if (!target) {
    return {
      paragraphs: ['There is no finding to cite evidence for.'],
      sources: [],
      notAnswered: 'Nothing fired, so there are no spans to show.',
      intent: 'evidence',
    };
  }

  const spans = spanSources(request, target);
  const paragraphs = [
    `**${target.title}** rests on ${spans.length} span${spans.length === 1 ? '' : 's'}. Each is a pair of character offsets into a document this build read.`,
  ];
  for (const source of spans) {
    paragraphs.push(`• ${source.detail}\n  "${source.label}"`);
  }
  paragraphs.push(
    'These are re-read from the source text every time the artifact is verified, rather than stored as a claim about themselves.',
  );

  return {
    paragraphs,
    sources: [derivationSource(target), ...spans],
    notAnswered: null,
    intent: 'evidence',
  };
}

function answerLimits(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  const withLimits = request.derivations.slice(0, 6);
  const paragraphs = [
    'Here is what this build refuses to conclude, taken from the findings themselves rather than written by hand.',
  ];
  for (const derivation of withLimits) {
    paragraphs.push(`• **${derivation.title}**\n  ${derivation.notConcluded}`);
  }
  paragraphs.push(
    `Beyond the findings: this is a record of ${request.graph.documents.length} documents. Anything not written in them is not known here. The engine does not infer a diagnosis, does not recommend treatment, and does not tell anyone what to do. A value it cannot believe is reported as reported, with a flag, rather than corrected.`,
  );

  return {
    paragraphs,
    sources: withLimits.map(derivationSource),
    notAnswered: null,
    intent: 'limits',
  };
}

function answerIdentity(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  const identity = request.identity;
  const verification = verifyProvenance(request.graph, request.derivations);

  return {
    paragraphs: [
      `This result is named **${identity.id}**.`,
      `The name is computed from three things. The corpus hash \`${identity.corpusHash}\` names the record: ${identity.documents} documents, hashed in an order-independent way, so importing the same documents in a different order is the same record. The result hash \`${identity.resultHash}\` names the output: ${identity.facts} facts, ${identity.entities} entities and ${identity.derivations} findings.`,
      `It was produced by engine \`${identity.engineVersion}\` over rule set \`${identity.rulesetVersion}\` (${identity.ruleCount} rules, in registry order). Both are recorded because a change to either can change the result without any change to the record.`,
      `**Verified.** ${verificationHeadline(verification)}`,
      'Reproducing means re-reading the corpus, rebuilding the graph, running the rules again and comparing. If the engine version differs, this build reports that a migration is required rather than silently re-deriving and calling it a reproduction.',
    ],
    sources: [
      {
        kind: 'identity',
        id: identity.id,
        label: `Artifact ${identity.id}`,
        detail: `corpus ${identity.corpusHash} · result ${identity.resultHash}`,
        factIds: [],
        docIds: [],
      },
    ],
    notAnswered: null,
    intent: 'identity',
  };
}

function answerCount(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  return {
    paragraphs: [
      `${request.graph.documents.length} documents were read, producing ${request.graph.facts.length} facts across ${request.graph.entities.length} resolved concepts.`,
      `${request.derivations.length} rule${request.derivations.length === 1 ? '' : 's'} fired, out of a registry of ${request.identity.ruleCount}. A rule that fired zero times is still counted: the registry shows those rows rather than hiding them.`,
    ],
    sources: [],
    notAnswered: null,
    intent: 'count',
  };
}

function answerUnknown(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  return {
    paragraphs: [
      'I did not understand that as a question about this artifact, so I am not going to guess at an answer.',
      'This explainer only talks about findings the engine already produced. It cannot answer a clinical question, and it will not invent a finding to answer one with.',
    ],
    sources: [],
    notAnswered: `No intent matched "${request.question}".`,
    intent: 'unknown',
  };
}

function answerGreeting(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  return {
    paragraphs: [
      'Hello. I can explain what this record establishes — and nothing more.',
      `This artifact read ${request.graph.documents.length} documents, extracted ${request.graph.facts.length} facts and produced ${request.derivations.length} findings. Ask me to summarise them, explain why one appeared, show the evidence, or tell you what I cannot say.`,
    ],
    sources: [],
    notAnswered: null,
    intent: 'greeting',
  };
}

/**
 * Answer "what is X" from the record itself.
 *
 * X is resolved against the entities and facts the engine actually read, so the
 * answer can only ever name something the record contains. If the term is not
 * in the record, the answer says so rather than producing a definition from
 * nowhere — a definition is not evidence.
 */
function answerConcept(request: ExplanationRequest): Omit<Explanation, 'backend' | 'generated'> {
  const term = conceptTerm(request.question);
  if (!term) return answerUnknown(request);

  // Match entities by label, key, or alias.
  const entities = request.graph.entities.filter(
    (entity) =>
      entity.label.toLowerCase().includes(term) ||
      entity.key.toLowerCase().includes(term) ||
      entity.aliases.some((alias) => alias.toLowerCase().includes(term)),
  );

  if (entities.length > 0) {
    const factIds = new Set<string>();
    for (const entity of entities) for (const id of entity.factIds) factIds.add(id);
    const facts = request.graph.facts.filter((fact) => factIds.has(fact.id));

    const related = request.derivations.filter((derivation) =>
      derivation.factIds.some((id) => factIds.has(id)),
    );

    const label = entities[0].label;
    const paragraphs: string[] = [
      `**${label}** is documented in ${facts.length} statement${facts.length === 1 ? '' : 's'} across ${new Set(facts.map((f) => f.docId)).size} document${facts.length === 1 ? '' : 's'}.`,
    ];

    for (const fact of facts.slice(0, 5)) {
      paragraphs.push(`• ${fact.quote}${fact.valueNum !== undefined ? ` (${fact.valueNum}${fact.unit ? ` ${fact.unit}` : ''})` : ''}`);
    }
    if (facts.length > 5) paragraphs.push(`…and ${facts.length - 5} further statement${facts.length - 5 === 1 ? '' : 's'}.`);

    if (related.length > 0) {
      paragraphs.push('The engine raised these findings about it:');
      for (const derivation of related.slice(0, 4)) {
        paragraphs.push(`• **${derivation.title}** — ${derivation.statement}`);
      }
    } else {
      paragraphs.push('The engine raised no finding about it, which is itself a result: nothing about it contradicted anything else in the record.');
    }

    return {
      paragraphs,
      sources: facts.slice(0, 5).map((fact) => ({
        kind: 'fact',
        id: fact.id,
        label: fact.quote.length > 120 ? `${fact.quote.slice(0, 119)}…` : fact.quote,
        detail: `${fact.docId} · characters ${fact.span[0]}–${fact.span[1]}`,
        factIds: [fact.id],
        docIds: [fact.docId],
      })),
      notAnswered: null,
      intent: 'concept',
    };
  }

  // No entity, but a finding may mention the term directly.
  const related = request.derivations.filter(
    (derivation) =>
      derivation.title.toLowerCase().includes(term) ||
      derivation.statement.toLowerCase().includes(term),
  );

  if (related.length > 0) {
    return {
      paragraphs: [
        `"${term}" appears in ${related.length} finding${related.length === 1 ? '' : 's'}:`,
        ...related.slice(0, 5).map((d) => `• **${d.title}** — ${d.statement}`),
      ],
      sources: related.slice(0, 5).map(derivationSource),
      notAnswered: null,
      intent: 'concept',
    };
  }

  return {
    paragraphs: [
      `I could not find "${term}" in this record.`,
      `The record contains ${request.graph.entities.length} concepts and ${request.graph.facts.length} facts. Ask about a name you see in the record — a medication, a lab, or a condition — and I will tell you exactly what the documents say about it.`,
    ],
    sources: [],
    notAnswered: `"${term}" is not documented in this record.`,
    intent: 'concept',
  };
}

const ANSWER_BY_INTENT: Record<
  ExplanationIntent,
  (request: ExplanationRequest) => Omit<Explanation, 'backend' | 'generated'>
> = {
  why: answerWhy,
  summary: answerSummary,
  severity: answerSeverity,
  evidence: answerEvidence,
  limits: answerLimits,
  identity: answerIdentity,
  count: answerCount,
  concept: answerConcept,
  greeting: answerGreeting,
  unknown: answerUnknown,
};

/**
 * The shipped explainer.
 *
 * Deterministic and offline. Its whole vocabulary is the set of derivations it
 * was handed, which is why it cannot state something the engine did not conclude:
 * there is no code path here that produces a claim the proof does not contain.
 */
export class GroundedExplainer implements ExplainerBackend {
  readonly id = 'grounded';
  readonly label = 'Proof-grounded';
  readonly generated = false;
  readonly requiresNetwork = false;
  readonly note =
    'Answers assembled from the proof graph itself. Every paragraph traces to a derivation and its spans. No model is involved.';

  async explain(request: ExplanationRequest): Promise<Explanation> {
    const intent = resolveIntent(request.question, request.focus);
    const answer = ANSWER_BY_INTENT[intent](request);
    return { ...answer, backend: this.id, generated: false };
  }
}
