import type { DocKind, Fact } from '../types';
import type { DerivationStep, EvidenceGrade, RuleId, StepKind } from './types';
import { clamp, hash } from '../ids';

/**
 * Source authority.
 *
 * Not every document deserves the same weight, and pretending otherwise is how
 * systems end up treating a patient's remembered dose with the same confidence as
 * an instrument result. These tiers are the input to every propagated confidence
 * in the platform.
 */
export const SOURCE_AUTHORITY: Record<DocKind, number> = {
  lab_report: 0.96,
  pathology_report: 0.96,
  discharge_summary: 0.9,
  vaccination_record: 0.9,
  allergy_record: 0.88,
  imaging_report: 0.87,
  procedure_note: 0.85,
  medication_list: 0.78,
  visit_note: 0.74,
  questionnaire: 0.58,
  wearable_summary: 0.45,
};

/** How the platform treats a source, in words, for the proof viewer. */
export const AUTHORITY_NOTE: Record<DocKind, string> = {
  lab_report: 'instrument output, transcribed',
  pathology_report: 'instrument output, transcribed',
  discharge_summary: 'clinician-authored summary',
  vaccination_record: 'registry record',
  allergy_record: 'registry record',
  imaging_report: 'clinician-authored report',
  procedure_note: 'clinician-authored note',
  medication_list: 'reconciliation list, frequently copied forward',
  visit_note: 'clinician-authored narrative',
  questionnaire: 'patient-reported',
  wearable_summary: 'device-derived, self-reported',
};

/**
 * Evidence grade for a set of facts.
 *
 * A is a structured primary source; D is a single weak or patient-reported
 * statement. A derived claim inherits the *worst* grade of its premises, because
 * a chain of reasoning is only as strong as its weakest documented link.
 */
export function gradeFor(facts: Fact[]): EvidenceGrade {
  if (facts.length === 0) return 'D';
  const authorities = facts.map((f) => SOURCE_AUTHORITY[f.docKind] ?? 0.5);
  const worst = Math.min(...authorities);
  const mean = authorities.reduce((a, b) => a + b, 0) / authorities.length;
  const score = worst * 0.65 + mean * 0.35;
  if (score >= 0.9) return 'A';
  if (score >= 0.75) return 'B';
  if (score >= 0.55) return 'C';
  return 'D';
}

export function gradeScore(grade: EvidenceGrade): number {
  return { A: 1, B: 0.82, C: 0.6, D: 0.35 }[grade];
}

/**
 * Confidence algebra.
 *
 * `all`  — every premise is required (conjunction). The chain is as strong as its
 *          weakest link, damped by how reliable the rule itself is.
 * `any`  — any single premise suffices (disjunction). Noisy-OR: more independent
 *          supporting statements raise confidence with diminishing returns.
 * `mean` — the premises are pooled observations of one quantity.
 */
export type CombineMode = 'all' | 'any' | 'mean';

export function combineConfidence(
  values: number[],
  mode: CombineMode,
  ruleReliability = 0.95,
): number {
  if (values.length === 0) return 0;
  let base: number;
  if (mode === 'all') base = Math.min(...values);
  else if (mode === 'any') base = 1 - values.reduce((acc, v) => acc * (1 - clamp(v, 0, 1)), 1);
  else base = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(clamp(base * ruleReliability, 0.05, 0.99) * 100) / 100;
}

/** Source authority, damped by how the extractor read the line. */
export function factAuthority(fact: Fact): number {
  const source = SOURCE_AUTHORITY[fact.docKind] ?? 0.5;
  return Math.round(clamp(source * 0.55 + fact.confidence * 0.45, 0.05, 0.99) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Proof construction                                                  */
/* ------------------------------------------------------------------ */

export interface StepDraft {
  kind: StepKind;
  label: string;
  factIds?: string[];
  docIds?: string[];
  ruleId?: RuleId;
  dependsOn?: string[];
  justification: string;
  confidence: number;
}

/**
 * Builds the proof DAG for a derivation.
 *
 * Steps are appended in construction order, which is topological by
 * construction: a step may only depend on steps that already exist. `depthOf`
 * then reports the longest path, which the proof viewer uses to lay the graph
 * out left to right.
 */
export class ProofBuilder {
  private readonly steps: DerivationStep[] = [];
  private readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
  }

  add(draft: StepDraft): string {
    const id = `stp_${hash(`${this.seed}|${this.steps.length}|${draft.label}`)}`;
    this.steps.push({
      id,
      kind: draft.kind,
      label: draft.label,
      factIds: draft.factIds ?? [],
      docIds: draft.docIds ?? [],
      ruleId: draft.ruleId,
      dependsOn: draft.dependsOn ?? [],
      justification: draft.justification,
      confidence: draft.confidence,
    });
    return id;
  }

  /** Premise node: one documented statement. */
  premise(fact: Fact, label?: string, note?: string): string {
    // The span is always stated: a reader must be able to check which exact
    // characters of which document support this premise — not only the quote.
    const spanNote = `Source characters ${fact.span[0]}–${fact.span[1]}`;
    return this.add({
      kind: 'premise',
      label: label ?? `${fact.label} — ${fact.occurredAt}`,
      factIds: [fact.id],
      docIds: [fact.docId],
      justification: note
        ? `${note} ${spanNote}.`
        : `Read from a ${fact.docKind.replace(/_/g, ' ')} as: "${fact.quote}". ${spanNote}. Source authority: ${AUTHORITY_NOTE[fact.docKind] ?? 'unknown'}; extraction confidence ${fact.confidence.toFixed(2)}.`,
      confidence: factAuthority(fact),
    });
  }

  /** Interval node: a period reconstructed from premises. */
  interval(
    label: string,
    dependsOn: string[],
    factIds: string[],
    docIds: string[],
    justification: string,
    confidence: number,
  ): string {
    return this.add({ kind: 'interval', label, factIds, docIds, dependsOn, justification, confidence });
  }

  /** Rule node: the inference step itself. */
  rule(
    ruleId: RuleId,
    label: string,
    dependsOn: string[],
    justification: string,
    confidence: number,
    factIds: string[] = [],
    docIds: string[] = [],
  ): string {
    return this.add({
      kind: 'rule',
      ruleId,
      label,
      factIds,
      docIds,
      dependsOn,
      justification,
      confidence,
    });
  }

  conclusion(
    label: string,
    dependsOn: string[],
    justification: string,
    confidence: number,
    factIds: string[] = [],
    docIds: string[] = [],
  ): string {
    return this.add({
      kind: 'conclusion',
      label,
      factIds,
      docIds,
      dependsOn,
      justification,
      confidence,
    });
  }

  get all(): DerivationStep[] {
    return this.steps;
  }

  /** Longest path from a premise to the given step. */
  depthOf(stepId: string): number {
    const byId = new Map(this.steps.map((s) => [s.id, s]));
    const walk = (id: string, seen: Set<string>): number => {
      if (seen.has(id)) return 0;
      seen.add(id);
      const step = byId.get(id);
      if (!step || step.dependsOn.length === 0) return 1;
      return 1 + Math.max(...step.dependsOn.map((d) => walk(d, seen)));
    };
    return walk(stepId, new Set());
  }
}

