import type {
  Answer,
  AnswerBlock,
  Citation,
  Entity,
  Fact,
  HealthGraph,
  ISODate,
  QueryIntent,
} from './types';
import { citationFor, citationsFor, factsFor, getDocument } from './access';
import { matchConcepts } from './text/lexicon';
import { entityKeyFor } from './text/lexiconTypes';
import { addDays, formatDate } from './text/normalize';
import { round } from './ids';
import { diffSnapshots, snapshotAt } from './timeline';
import { findContradictions } from './contradiction';
import { filterContradictionsAsOf } from './temporal/eligibility';
import { evidenceForEntities, EXTERNAL_EVIDENCE_NOTE } from './evidence';

/* ------------------------------------------------------------------ */
/* Intent detection                                                    */
/* ------------------------------------------------------------------ */

const INTENT_CUES: Array<{ intent: QueryIntent; patterns: RegExp[] }> = [
  {
    intent: 'conflict',
    patterns: [
      /\b(conflicts?|contradict\w*|inconsisten\w*|mismatch\w*|disagree\w*|discrepan\w*|errors?|wrong|doesn'?t match|not match)\b/i,
      /\b(which is (?:right|correct))\b/i,
    ],
  },
  {
    intent: 'change',
    patterns: [
      /\b(changed?|changes|what'?s new|new since|added|removed|started|stopped|discontinued|difference|diff|since|compare|what happened)\b/i,
    ],
  },
  {
    intent: 'trend',
    patterns: [
      /\b(trends?|trending|increasing|decreasing|rising|falling|worsening|improving|getting better|getting worse|over time|trajectory|direction)\b/i,
    ],
  },
  {
    intent: 'timeline',
    patterns: [/\b(timeline|when|first|last time|history|how long|since when|sequence)\b/i],
  },
  {
    intent: 'medication_review',
    patterns: [/\b(medications?|meds?|drugs?|prescriptions?|pills?|dose|dosage|taking|on any)\b/i],
  },
  {
    intent: 'lab_explanation',
    patterns: [
      /\b(what does .* measure|what is .* test|what does .* mean|explain .* (?:lab|test|result)|reference range|normal range|units)\b/i,
    ],
  },
  {
    intent: 'external_education',
    patterns: [
      /\b(what is|what are|generally used|used for|side effects?|guidelines?|why is .* (?:prescribed|used)|how does .* work|learn about)\b/i,
    ],
  },
  {
    intent: 'coverage',
    patterns: [
      /\b(what (?:records|documents|data) do you have|how many documents|what do you have|coverage|sources do you have)\b/i,
    ],
  },
  {
    intent: 'summary',
    patterns: [/\b(everything|summary|summar\w*|overview|about me|my health|overall|big picture)\b/i],
  },
];

export function detectIntent(question: string): QueryIntent {
  for (const cue of INTENT_CUES) {
    for (const pattern of cue.patterns) {
      if (pattern.test(question)) return cue.intent;
    }
  }
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Entity resolution                                                   */
/* ------------------------------------------------------------------ */

export interface EntityResolution {
  primary?: Entity;
  entities: Entity[];
  /** How the match was made, shown in the plan so the user can judge it. */
  method: string;
}

/**
 * Resolve the concepts a question is about.
 *
 * Two passes: the clinical lexicon (which handles synonyms, brands and
 * abbreviations), then a direct alias scan over the graph (which catches surface
 * forms the lexicon does not know). Longer matches win, so "LDL cholesterol"
 * beats a bare "cholesterol" mention elsewhere in the sentence.
 */
export function resolveEntities(graph: HealthGraph, question: string): EntityResolution {
  const lower = question.toLowerCase();
  const scores = new Map<string, number>();

  for (const match of matchConcepts(question)) {
    const spec = match.specs[0];
    const key = entityKeyFor(spec.kind, spec.key);
    const score = match.alias.length * 2 + (graph.entityKeyIndex[key] ? 4 : 0);
    scores.set(key, Math.max(scores.get(key) ?? 0, score));
    // Also credit every concept sharing the alias (e.g. aspirin as drug and allergy).
    for (const extra of match.specs.slice(1)) {
      const extraKey = entityKeyFor(extra.kind, extra.key);
      if (graph.entityKeyIndex[extraKey]) {
        scores.set(extraKey, Math.max(scores.get(extraKey) ?? 0, score - 1));
      }
    }
  }

  for (const entity of graph.entities) {
    if (entity.kind === 'person') continue;
    for (const alias of entity.aliases) {
      if (alias.length < 3) continue;
      if (lower.includes(alias)) {
        const score = alias.length * 2 + (entity.kind === 'measurement' || entity.kind === 'medication' ? 3 : 0);
        scores.set(entity.key, Math.max(scores.get(entity.key) ?? 0, score));
      }
    }
    if (lower.includes(entity.label.toLowerCase())) {
      scores.set(entity.key, Math.max(scores.get(entity.key) ?? 0, entity.label.length * 2 + 3));
    }
  }

  const ranked = Array.from(scores.entries())
    .filter(([key]) => Boolean(graph.entityKeyIndex[key]))
    .sort((a, b) => b[1] - a[1]);

  const entities = ranked.map(([key]) => graph.entities.find((e) => e.key === key)!).filter(Boolean);
  const method =
    entities.length === 0
      ? 'No concept in the question matched the graph; answering from aggregate state.'
      : `Matched ${entities.length} concept${entities.length === 1 ? '' : 's'} in your graph, longest alias first.`;

  return { primary: entities[0], entities, method };
}

/* ------------------------------------------------------------------ */
/* Block builders                                                      */
/* ------------------------------------------------------------------ */

let blockCounter = 0;
function block(kind: AnswerBlock['kind'], fields: Omit<AnswerBlock, 'id' | 'kind'>): AnswerBlock {
  blockCounter += 1;
  return { id: `blk_${blockCounter}`, kind, ...fields };
}

function valueLabel(fact: Fact): string {
  if (fact.valueNum !== undefined) {
    return `${fact.valueNum}${fact.unit ? ` ${fact.unit}` : ''}`;
  }
  return String(fact.attrs.valueText ?? fact.valueText ?? fact.status);
}

function seriesFacts(graph: HealthGraph, entityKey: string): Fact[] {
  return factsFor(graph, entityKey)
    .filter((f) => f.attrs.restated !== true)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function entityBlocks(graph: HealthGraph, entity: Entity, asOf: ISODate): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  const facts = factsFor(graph, entity.key).filter((f) => f.occurredAt <= asOf);
  const documents = Array.from(new Set(facts.map((f) => f.docId)));
  const confidences = facts.map((f) => f.confidence);
  const meanConfidence = confidences.length
    ? round(confidences.reduce((a, b) => a + b, 0) / confidences.length, 2)
    : 0;

  blocks.push(
    block('metric', {
      title: entity.label,
      metrics: [
        { label: 'Documented statements', value: String(facts.length) },
        { label: 'Documents', value: String(documents.length) },
        { label: 'First seen', value: formatDate(entity.firstSeen) },
        { label: 'Last seen', value: formatDate(entity.lastSeen) },
        { label: 'Mean extraction confidence', value: meanConfidence.toFixed(2) },
      ],
      entityKeys: [entity.key],
    }),
  );

  if (entity.kind === 'measurement' || entity.kind === 'vital') {
    const series = seriesFacts(graph, entity.key).filter((f) => f.occurredAt <= asOf);
    if (series.length > 0) {
      blocks.push(
        block('chart', {
          title: `${entity.label} over time`,
          items: series.map((f) => ({
            label: f.occurredAt,
            value: valueLabel(f),
            sub: getDocument(graph, f.docId)?.title,
            tone: f.flags.includes('implausible_value')
              ? 'critical'
              : f.flags.includes('outside_reference_range')
                ? 'warn'
                : 'ok',
            factId: f.id,
          })),
          factIds: series.map((f) => f.id),
          entityKeys: [entity.key],
        }),
      );
    }
  } else if (facts.length > 0) {
    blocks.push(
      block('timeline', {
        title: `Every documented statement about ${entity.label}`,
        items: facts.map((f) => ({
          label: formatDate(f.occurredAt),
          value: f.status,
          sub: `${f.quote.slice(0, 120)} — ${getDocument(graph, f.docId)?.title ?? ''}`,
          tone: f.status === 'discontinued' || f.status === 'resolved' ? 'warn' : 'ok',
          factId: f.id,
        })),
        factIds: facts.map((f) => f.id),
        entityKeys: [entity.key],
      }),
    );
  }
  return blocks;
}


function contradictionBlocks(
  graph: HealthGraph,
  entityKeys: string[],
  asOf: ISODate,
  limit = 8,
): AnswerBlock[] {
  const all = filterContradictionsAsOf(findContradictions(graph), graph, asOf);
  const relevant =
    entityKeys.length === 0
      ? all
      : all.filter((c) => (c.entityKey ? entityKeys.includes(c.entityKey) : false));
  const chosen = relevant.slice(0, limit);
  if (chosen.length === 0) {
    return [
      block('text', {
        text:
          entityKeys.length === 0
            ? 'No internal inconsistencies were detected across the imported documents.'
            : 'No internal inconsistencies were detected for those concepts.',
      }),
    ];
  }
  return [
    block('warning', {
      title: `${relevant.length} inconsistenc${relevant.length === 1 ? 'y' : 'ies'} found`,
      text: 'Each item below is a disagreement between documents. The engine reports the disagreement and asks the question that would resolve it — it does not decide which statement is correct.',
      factIds: chosen.flatMap((c) => c.factIds),
    }),
    ...chosen.map((c) =>
      block('list', {
        title: `${c.severity.toUpperCase()} · ${c.title}`,
        items: [
          { label: 'Kind', value: c.kind.replace(/_/g, ' ') },
          { label: 'Window', value: `${formatDate(c.window.start)} → ${formatDate(c.window.end)}` },
          { label: 'Documents', value: c.docIds.length ? String(c.docIds.length) : '—' },
          { label: 'Ask', value: c.questionForClinician, tone: 'ask' },
          { label: 'Not concluded', value: c.notConcluded, tone: 'muted' },
        ],
        factIds: c.factIds,
        docIds: c.docIds,
      }),
    ),
  ];
}

function changeBlocks(graph: HealthGraph, asOf: ISODate, entityKeys: string[], months = 12): AnswerBlock[] {
  const start = addDays(asOf, -Math.round(months * 30.44));
  const before = snapshotAt(graph, start);
  const after = snapshotAt(graph, asOf);
  const changes = diffSnapshots(before, after).filter((c) => c.kind !== 'new_document');
  const relevant =
    entityKeys.length === 0 ? changes : changes.filter((c) => entityKeys.includes(c.entityKey));

  const blocks: AnswerBlock[] = [
    block('text', {
      text: `Comparing the record as of ${formatDate(start)} with the record as of ${formatDate(asOf)}. ${relevant.length} documented change${relevant.length === 1 ? '' : 's'} detected.`,
    }),
  ];

  if (relevant.length === 0) {
    blocks.push(block('text', { text: 'Nothing in the imported documents changed in that window for those concepts.' }));
    return blocks;
  }

  blocks.push(
    block('list', {
      title: 'Documented changes',
      items: relevant.slice(0, 20).map((c) => ({
        label: c.kind.replace(/_/g, ' '),
        value: c.deltaText,
        sub: `Caveat: ${c.caveat}`,
        tone: c.kind === 'status_changed' ? 'warn' : 'ok',
        factId: c.toFactId ?? c.fromFactId,
      })),
      factIds: relevant.flatMap((c) => [c.toFactId, c.fromFactId].filter((x): x is string => Boolean(x))),
    }),
  );
  return blocks;
}

function externalBlocks(entityKeys: string[]): AnswerBlock[] {
  const evidence = evidenceForEntities(entityKeys).slice(0, 6);
  if (evidence.length === 0) {
    return [
      block('text', {
        text: 'No external reference material is bundled for those concepts. Nothing outside your records was used.',
      }),
    ];
  }
  return [
    block('warning', {
      title: 'External evidence — not about you',
      text: EXTERNAL_EVIDENCE_NOTE,
    }),
    block('evidence', {
      title: 'Public sources',
      items: evidence.map((e) => ({
        label: e.title,
        value: e.source,
        sub: e.summary,
        tone: 'external',
      })),
      evidenceIds: evidence.map((e) => e.id),
    }),
  ];
}


function medicationReviewBlocks(graph: HealthGraph, asOf: ISODate): AnswerBlock[] {
  const snapshot = snapshotAt(graph, asOf);
  const active = snapshot.medications.filter((m) => m.status === 'active');
  const other = snapshot.medications.filter((m) => m.status !== 'active');
  const blocks: AnswerBlock[] = [];

  blocks.push(
    block('metric', {
      title: 'Medication state',
      metrics: [
        { label: 'Active', value: String(active.length), tone: 'ok' },
        { label: 'Not active', value: String(other.length), tone: 'warn' },
        { label: 'Allergies on file', value: String(snapshot.allergies.length), tone: 'warn' },
      ],
    }),
  );

  blocks.push(
    block('table', {
      title: 'Medications documented as active',
      columns: ['Medication', 'Class', 'Dose', 'Since', 'Source'],
      rows: active.map((m) => {
        const latest = factsFor(graph, m.entityKey).filter((f) => f.occurredAt <= asOf).slice(-1)[0];
        return [
          m.label,
          String(latest?.attrs.drugClass ?? m.category ?? '—'),
          latest ? `${latest.attrs.dose ?? '—'} ${latest.attrs.doseUnit ?? ''} ${latest.attrs.frequency ?? ''}`.trim() : '—',
          formatDate(m.since),
          getDocument(graph, latest?.docId)?.title ?? '—',
        ];
      }),
      entityKeys: active.map((m) => m.entityKey),
      factIds: active.flatMap((m) => m.factIds.slice(-1)),
    }),
  );

  if (other.length > 0) {
    blocks.push(
      block('list', {
        title: 'Not currently active',
        items: other.map((m) => ({
          label: m.label,
          value: m.status,
          sub: `Last documented ${formatDate(m.lastDocumented)}`,
          tone: 'muted',
        })),
        entityKeys: other.map((m) => m.entityKey),
      }),
    );
  }

  blocks.push(...contradictionBlocks(graph, snapshot.medications.map((m) => m.entityKey), asOf, 6));
  blocks.push(...externalBlocks(snapshot.medications.map((m) => m.entityKey)));
  return blocks;
}

function summaryBlocks(graph: HealthGraph, asOf: ISODate): AnswerBlock[] {
  const snapshot = snapshotAt(graph, asOf);
  const contradictions = filterContradictionsAsOf(findContradictions(graph), graph, asOf);
  const high = contradictions.filter((c) => c.severity === 'high').length;
  const blocks: AnswerBlock[] = [];

  blocks.push(
    block('metric', {
      title: 'Record at a glance',
      metrics: [
        { label: 'Documents', value: String(graph.stats.documents) },
        { label: 'Provenanced facts', value: String(graph.stats.facts) },
        { label: 'Resolved concepts', value: String(graph.stats.entities) },
        { label: 'Mean confidence', value: graph.stats.meanConfidence.toFixed(2) },
        { label: 'High-severity inconsistencies', value: String(high), tone: high > 0 ? 'critical' : 'ok' },
        { label: 'Coverage', value: `${formatDate(graph.stats.spanStart)} → ${formatDate(graph.stats.spanEnd)}` },
      ],
    }),
  );

  blocks.push(
    block('list', {
      title: `Active problems as of ${formatDate(asOf)}`,
      items: snapshot.conditions
        .filter((c) => c.status === 'active')
        .map((c) => ({
          label: c.label,
          value: c.category ?? 'condition',
          sub: `Documented since ${formatDate(c.since)} · last ${formatDate(c.lastDocumented)}`,
          tone: 'ok',
        })),
      entityKeys: snapshot.conditions.map((c) => c.entityKey),
    }),
  );

  const keyLabs = snapshot.measurements
    .filter((m) => m.readings >= 2)
    .sort((a, b) => b.readings - a.readings)
    .slice(0, 10);

  blocks.push(
    block('table', {
      title: 'Measurements with repeated readings',
      columns: ['Measurement', 'First', 'Latest', 'Change', 'Readings'],
      rows: keyLabs.map((m) => [
        m.label,
        `${m.first.valueNum} ${m.first.unit ?? ''}`.trim(),
        `${m.latest.valueNum} ${m.latest.unit ?? ''}`.trim(),
        m.changePct === null ? '—' : `${m.changePct > 0 ? '+' : ''}${m.changePct}%`,
        String(m.readings),
      ]),
      entityKeys: keyLabs.map((m) => m.entityKey),
      factIds: keyLabs.flatMap((m) => [m.first.id, m.latest.id]),
    }),
  );

  blocks.push(...changeBlocks(graph, asOf, [], 12).slice(0, 2));
  blocks.push(...contradictionBlocks(graph, [], asOf, 5));
  return blocks;
}


/* ------------------------------------------------------------------ */
/* The Ask entry point                                                 */
/* ------------------------------------------------------------------ */

export interface AskOptions {
  /** Answer as if the record ended on this date (the Time Machine's setting). */
  asOf?: ISODate;
}

/**
 * Answer a question by planning a query over the personal graph.
 *
 * The returned `plan` is shown in the UI on purpose: the value of this system is
 * that a reader can see which steps were taken and which sources were used.
 */
export function ask(graph: HealthGraph, question: string, options: AskOptions = {}): Answer {
  const asOf = options.asOf ?? graph.stats.spanEnd;
  const intent = detectIntent(question);
  const resolution = resolveEntities(graph, question);
  const primary = resolution.primary;
  const entityKeys = resolution.entities.map((e) => e.key);

  const plan: string[] = [];
  const blocks: AnswerBlock[] = [];
  const limitations: string[] = [
    'Extraction reads text, not intent: a statement can be misread even when the span is correct.',
    'Absence of documentation is not absence of an event. Most of what happens to a person is never written down.',
    "Reference ranges labelled illustrative are typical published ranges; the performing laboratory's own range takes precedence.",
  ];

  plan.push(`Interpreted the question as: ${intent.replace(/_/g, ' ')}.`);
  plan.push(resolution.method);
  plan.push(`Evaluated the record as of ${formatDate(asOf)} (${graph.stats.documents} documents imported).`);

  switch (intent) {
    case 'conflict': {
      plan.push('Ran every contradiction rule over the graph, then filtered to the matched concepts.');
      blocks.push(...contradictionBlocks(graph, entityKeys, asOf));
      break;
    }
    case 'change': {
      plan.push('Built two snapshots and diffed them entity by entity.');
      blocks.push(...changeBlocks(graph, asOf, entityKeys));
      if (primary) blocks.push(...entityBlocks(graph, primary, asOf));
      break;
    }
    case 'trend': {
      if (primary) {
        plan.push(
          `Extracted the reading series for ${primary.label}, excluding values restated inside later notes.`,
        );
        blocks.push(...entityBlocks(graph, primary, asOf));
        const series = seriesFacts(graph, primary.key).filter((f) => f.occurredAt <= asOf);
        if (series.length >= 2) {
          const first = series[0];
          const last = series[series.length - 1];
          const sameUnit = first.unit === last.unit;
          const delta = (last.valueNum ?? 0) - (first.valueNum ?? 0);
          blocks.unshift(
            block('text', {
              text: sameUnit
                ? `${primary.label} moved from ${first.valueNum} ${first.unit ?? ''} on ${formatDate(first.occurredAt)} to ${last.valueNum} ${last.unit ?? ''} on ${formatDate(last.occurredAt)} — a change of ${delta > 0 ? '+' : ''}${round(delta, 2)} ${last.unit ?? ''} across ${series.length} readings. The direction is documented; the reason for it is not.`
                : `${primary.label} is reported in different units across documents (${first.unit ?? 'none'} vs ${last.unit ?? 'none'}), so no trend was computed.`,
            }),
          );
        }
      } else {
        blocks.push(
          block('text', {
            text: 'I could not identify which measurement you meant. Try naming the test, for example "LDL cholesterol".',
          }),
        );
      }
      break;
    }
    case 'timeline': {
      if (primary) {
        plan.push(`Collected every statement about ${primary.label} in chronological order.`);
        blocks.push(...entityBlocks(graph, primary, asOf));
      } else {
        plan.push('No specific concept was named, so the full document timeline was returned.');
        const snapshot = snapshotAt(graph, asOf);
        blocks.push(
          block('timeline', {
            title: 'Documents in the record',
            items: snapshot.documents.map((d) => ({
              label: formatDate(d.date),
              value: d.title,
              sub: `${d.kind.replace(/_/g, ' ')}${d.facility ? ` · ${d.facility}` : ''}`,
              docIds: [d.id],
            })),
          }),
        );
      }
      break;
    }

    case 'medication_review': {
      plan.push('Folded medication statuses forward to the evaluation date, then ran the contradiction rules.');
      blocks.push(...medicationReviewBlocks(graph, asOf));
      break;
    }
    case 'lab_explanation': {
      if (primary) {
        plan.push(
          `Separated what ${primary.label} measures (external) from what your documents record (personal).`,
        );
        blocks.push(...entityBlocks(graph, primary, asOf));
        blocks.push(...externalBlocks([primary.key]));
      } else {
        blocks.push(...externalBlocks(entityKeys));
      }
      break;
    }
    case 'external_education': {
      plan.push('Restricted the answer to public reference material and kept it separate from your records.');
      const keys = entityKeys.length
        ? entityKeys
        : graph.entities.filter((e) => e.kind !== 'person').map((e) => e.key).slice(0, 40);
      blocks.push(...externalBlocks(keys));
      if (primary) {
        const facts = factsFor(graph, primary.key).filter((f) => f.occurredAt <= asOf);
        blocks.push(
          block('provenance', {
            title: 'Where this appears in your own record',
            text:
              facts.length === 0
                ? `${primary.label} does not appear in your imported documents.`
                : `${primary.label} appears in your record ${facts.length} time${facts.length === 1 ? '' : 's'}, first on ${formatDate(facts[0].occurredAt)}. That is a fact about your documents, not a statement about your health.`,
            factIds: facts.slice(0, 5).map((f) => f.id),
            entityKeys: [primary.key],
          }),
        );
      }
      break;
    }
    case 'coverage': {
      plan.push('Reported exactly which documents back this system.');
      blocks.push(
        block('table', {
          title: 'Documents in the graph',
          columns: ['Date', 'Title', 'Type', 'Quality'],
          rows: [...graph.documents]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((d) => [
              formatDate(d.date),
              d.title,
              d.kind.replace(/_/g, ' '),
              d.quality.toFixed(2),
            ]),
          docIds: graph.documents.map((d) => d.id),
        }),
      );
      break;
    }
    case 'summary': {
      plan.push('Composed a summary from the snapshot, the change detector and the contradiction engine.');
      blocks.push(...summaryBlocks(graph, asOf));
      break;
    }
    default: {
      if (primary) {
        plan.push(`Treated the question as a request for everything about ${primary.label}.`);
        blocks.push(...entityBlocks(graph, primary, asOf));
        blocks.push(...contradictionBlocks(graph, [primary.key], asOf, 3));
        blocks.push(...externalBlocks([primary.key]));
      } else {
        plan.push('No concept matched, so a record summary was returned instead.');
        blocks.push(...summaryBlocks(graph, asOf));
      }
    }
  }

  return finalize(graph, question, intent, plan, blocks, resolution, asOf, limitations);
}


function finalize(
  graph: HealthGraph,
  question: string,
  intent: QueryIntent,
  plan: string[],
  blocks: AnswerBlock[],
  resolution: EntityResolution,
  asOf: ISODate,
  limitations: string[],
): Answer {
  const factIds = Array.from(new Set(blocks.flatMap((b) => b.factIds ?? [])));
  const citedFacts = factIds
    .map((id) => graph.facts.find((f) => f.id === id))
    .filter((f): f is Fact => Boolean(f));

  const citations: Citation[] = citedFacts.map((f) => citationFor(graph, f));
  const externalCount = Array.from(new Set(blocks.flatMap((b) => b.evidenceIds ?? []))).length;

  if (citedFacts.length === 0 && externalCount > 0) {
    limitations.push(
      'This answer contains no statements from your own documents; every item is external reference material.',
    );
  }
  if (resolution.entities.length === 0) {
    limitations.push(
      'No specific concept was identified in the question, so the answer is broader than it may appear.',
    );
  }
  if (citedFacts.some((f) => f.confidence < 0.6)) {
    limitations.push(
      'At least one cited statement has a low extraction confidence — open the evidence to read the original line.',
    );
  }

  const personalFacts = citedFacts.length;
  const separationNote =
    personalFacts > 0 && externalCount > 0
      ? 'This answer mixes two kinds of information. Statements drawn from your own documents are cited with a document, a date and a quoted line. External reference material is labelled and linked to its public source. The two are never blended into one sentence.'
      : personalFacts > 0
        ? 'Every statement above comes from your own imported documents and is cited to a specific line.'
        : externalCount > 0
          ? 'Nothing above comes from your documents. This is general reference material only.'
          : 'No sources were used.';

  const meanConfidence =
    citedFacts.length > 0
      ? round(citedFacts.reduce((sum, f) => sum + f.confidence, 0) / citedFacts.length, 2)
      : externalCount > 0
        ? 0.5
        : 0.2;

  return {
    id: `ans_${Math.round(meanConfidence * 100)}_${blocks.length}`,
    question,
    intent,
    plan,
    blocks,
    citations,
    separation: {
      personalFacts,
      externalEvidence: externalCount,
      note: separationNote,
    },
    coverage: {
      documentsSearched: graph.stats.documents,
      dateRange: graph.documents.length ? [graph.stats.spanStart, asOf] : null,
      entitiesMatched: resolution.entities.map((e) => e.label),
    },
    confidence: meanConfidence,
    limitations,
    generatedAt: new Date().toISOString().slice(0, 16),
  };
}

/** A handful of questions that show what the system can actually do. */
export const SUGGESTED_QUESTIONS: string[] = [
  'Show me everything in my records related to cholesterol',
  'Are there any conflicts in my medication list?',
  'What changed in my records over the last year?',
  'What is my A1c trend?',
  'What does the potassium test measure?',
  'What records do you have?',
  'Give me a summary of my health record',
  'When was atorvastatin stopped?',
];

export { citationsFor };

