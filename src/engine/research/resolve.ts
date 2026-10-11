import type { AIContext } from '../../ai/context';
import { validateAIContext } from '../../ai/context';
import type { Derivation } from '../derive/types';
import { buildConditionSpans, buildMedicationCourses } from '../derive/intervals';
import type { Fact, HealthGraph, ISODate, Snapshot } from '../types';
import type { PersonalCounts, PersonalEvidenceItem } from './types';

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length >= 3);
}

function entityMatches(question: string, label: string, key: string): boolean {
  const haystack = `${label} ${key}`.toLowerCase();
  const words = tokens(question);
  if (words.length === 0) return false;
  if (haystack.includes(question.toLowerCase().trim())) return true;
  const labelWords = tokens(label);
  if (labelWords.length > 0 && labelWords.every((word) => words.includes(word))) return true;
  const keyParts = key.toLowerCase().split(/[-:]/);
  return words.some((word) => {
    if (keyParts.includes(word)) return true;
    if (word.length >= 4) return haystack.includes(word) || key.toLowerCase().includes(word);
    return labelWords.includes(word);
  });
}

export function resolveEntityKeys(
  graph: HealthGraph,
  question: string,
  context: AIContext | null,
  derivations: Derivation[],
): { keys: string[]; contextValid: boolean; contextReason?: string } {
  const keys = new Set<string>();

  if (context) {
    const check = validateAIContext(context, graph, derivations);
    if (!check.valid) return { keys: [], contextValid: false, contextReason: check.reason };
    for (const factId of context.factIds) {
      const fact = graph.facts.find((item) => item.id === factId);
      if (fact) keys.add(fact.entityKey);
    }
    for (const derivationId of context.derivationIds) {
      const derivation = derivations.find((item) => item.id === derivationId);
      if (derivation) for (const key of derivation.entityKeys) keys.add(key);
    }
    if (context.kind === 'concept') keys.add(context.id);
  }

  const trimmed = question.trim();
  if (trimmed) {
    for (const entity of graph.entities) {
      if (entityMatches(trimmed, entity.label, entity.key)) keys.add(entity.key);
    }
  }

  return { keys: [...keys].sort(), contextValid: true };
}

export function factsAsOf(graph: HealthGraph, asOf: ISODate): Fact[] {
  return graph.facts.filter((fact) => fact.occurredAt <= asOf);
}

export function documentsAsOf(graph: HealthGraph, asOf: ISODate) {
  return graph.documents.filter((document) => document.date <= asOf);
}

export function edgesAsOf(graph: HealthGraph, asOf: ISODate): number {
  const visible = new Set(
    graph.entities
      .filter((entity) =>
        entity.factIds.some((id) => {
          const fact = graph.facts.find((item) => item.id === id);
          return fact ? fact.occurredAt <= asOf : false;
        }),
      )
      .map((entity) => entity.id),
  );
  return graph.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to)).length;
}

export function intervalsAsOf(graph: HealthGraph, asOf: ISODate): number {
  const courses = buildMedicationCourses(graph).filter((course) => course.interval.start <= asOf);
  const spans = buildConditionSpans(graph).filter((span) => span.interval.start <= asOf);
  return courses.length + spans.length;
}

export function personalCounts(input: {
  snapshot: Snapshot;
  graph: HealthGraph;
  asOf: ISODate;
  derivations: Derivation[];
  questions: number;
  quality: number;
}): PersonalCounts {
  return {
    documents: input.snapshot.totals.documents,
    facts: input.snapshot.totals.facts,
    concepts: input.snapshot.totals.entities,
    intervals: intervalsAsOf(input.graph, input.asOf),
    findings: input.derivations.length,
    questions: input.questions,
    edges: edgesAsOf(input.graph, input.asOf),
    quality: input.quality,
  };
}

export function collectPersonalEvidence(input: {
  graph: HealthGraph;
  asOf: ISODate;
  snapshot: Snapshot;
  derivations: Derivation[];
  questions: Array<{
    id: string;
    question: string;
    evidence: string;
    relatedFactIds: string[];
    relatedDerivationIds: string[];
  }>;
  contradictions: Array<{
    id: string;
    title: string;
    detail: string;
    entityKey?: string;
    factIds: string[];
    docIds: string[];
    window: { end: ISODate };
  }>;
  entityKeys: string[];
}): PersonalEvidenceItem[] {
  const wanted = new Set(input.entityKeys);
  if (wanted.size === 0) return [];
  const items: PersonalEvidenceItem[] = [];

  for (const fact of factsAsOf(input.graph, input.asOf)) {
    if (!wanted.has(fact.entityKey)) continue;
    items.push({
      kind: 'fact',
      id: fact.id,
      statement: fact.valueText
        ? `${fact.label}: ${fact.valueText}`
        : fact.quote || fact.label,
      asOf: input.asOf,
      factIds: [fact.id],
      docIds: [fact.docId],
      entityKeys: [fact.entityKey],
    });
  }

  for (const derivation of input.derivations) {
    if (!derivation.entityKeys.some((key) => wanted.has(key))) continue;
    items.push({
      kind: 'derivation',
      id: derivation.id,
      statement: derivation.statement,
      asOf: input.asOf,
      factIds: derivation.factIds,
      docIds: derivation.docIds,
      entityKeys: derivation.entityKeys,
    });
  }

  for (const question of input.questions) {
    const keys = question.relatedFactIds
      .map((id) => input.graph.facts.find((fact) => fact.id === id)?.entityKey)
      .filter((key): key is string => Boolean(key));
    const titleHit = [...wanted].some((key) => entityMatches(question.question, key, key));
    if (!keys.some((key) => wanted.has(key)) && !titleHit) continue;
    items.push({
      kind: 'question',
      id: question.id,
      statement: question.question,
      asOf: input.asOf,
      factIds: question.relatedFactIds,
      docIds: [],
      entityKeys: keys,
    });
  }

  for (const contradiction of input.contradictions) {
    if (contradiction.window.end > input.asOf) continue;
    const key = contradiction.entityKey;
    if (key && !wanted.has(key)) continue;
    if (!key && !contradiction.factIds.some((id) => {
      const fact = input.graph.facts.find((item) => item.id === id);
      return fact ? wanted.has(fact.entityKey) : false;
    })) continue;
    items.push({
      kind: 'contradiction',
      id: contradiction.id,
      statement: contradiction.title,
      asOf: input.asOf,
      factIds: contradiction.factIds,
      docIds: contradiction.docIds,
      entityKeys: key ? [key] : [],
    });
  }

  return items.sort((a, b) => a.id.localeCompare(b.id));
}
