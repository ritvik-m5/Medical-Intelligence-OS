import type { Fact, HealthGraph, ISODate } from '../types';
import type { Derivation, EvidenceGrade, QualityDimension, QualityReport } from '../derive/types';
import { AUTHORITY_NOTE, SOURCE_AUTHORITY } from '../derive/grade';
import { CONDITION_MONITORING } from '../relations';
import { codingCoverage } from './codes';
import { daysBetween, formatDate } from '../text/normalize';
import { round } from '../ids';

/* ------------------------------------------------------------------ */
/* Record quality scorecard                                            */
/*                                                                    */
/* Every dimension here is a statement about the *record*, not the      */
/* patient. A low score means the documents are hard to reason over,    */
/* which is a different and equally important finding. Each dimension   */
/* names the facts that produced it.                                    */
/* ------------------------------------------------------------------ */

function score(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface QualityInput {
  graph: HealthGraph;
  derivations: Derivation[];
  asOf: ISODate;
}

export function assessQuality(input: QualityInput): QualityReport {
  const { graph, derivations, asOf } = input;
  const dimensions: QualityDimension[] = [];

  /* 1. Provenance integrity — the invariant everything else rests on. */
  let anchored = 0;
  for (const fact of graph.facts) {
    const doc = graph.documents.find((d) => d.id === fact.docId);
    if (!doc) continue;
    const slice = doc.text.slice(fact.span[0], fact.span[1]);
    if (slice.length > 0 && fact.quote.includes(slice)) anchored += 1;
  }
  const anchoredShare = graph.facts.length === 0 ? 0 : anchored / graph.facts.length;
  dimensions.push({
    id: 'provenance',
    label: 'Provenance integrity',
    score: score(anchoredShare * 100),
    detail: `${anchored} of ${graph.facts.length} facts resolve to a character span that appears inside their own quoted line.`,
    evidenceFactIds: [],
  });

  /* 2. Extraction confidence. */
  const confidences = graph.facts.map((f) => f.confidence);
  const meanConfidence =
    confidences.length === 0 ? 0 : confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const lowConfidence = graph.facts.filter((f) => f.confidence < 0.6);
  dimensions.push({
    id: 'confidence',
    label: 'Extraction confidence',
    score: score(
      meanConfidence * 100 - (lowConfidence.length / Math.max(1, graph.facts.length)) * 40,
    ),
    detail: `Mean extraction confidence ${round(meanConfidence, 2)}; ${lowConfidence.length} fact${lowConfidence.length === 1 ? '' : 's'} below 0.60.`,
    evidenceFactIds: lowConfidence.slice(0, 20).map((f) => f.id),
  });

  /* 3. Source authority — are these documents strong evidence? */
  const authorities = graph.facts.map((f) => SOURCE_AUTHORITY[f.docKind] ?? 0.5);
  const meanAuthority =
    authorities.length === 0 ? 0 : authorities.reduce((a, b) => a + b, 0) / authorities.length;
  const kinds = Array.from(new Set(graph.documents.map((d) => d.kind)));
  dimensions.push({
    id: 'authority',
    label: 'Source authority',
    score: score(meanAuthority * 100),
    detail: `Mean source authority ${round(meanAuthority, 2)} across ${kinds.length} document type${kinds.length === 1 ? '' : 's'}: ${kinds
      .map((k) => AUTHORITY_NOTE[k])
      .slice(0, 4)
      .join(', ')}.`,
    evidenceFactIds: [],
  });

  /* 4. Documentation continuity — the largest hole in the record. */
  const dates = graph.documents.map((d) => d.date).sort();
  let largestGap = 0;
  let gapAfter = dates[0];
  for (let i = 1; i < dates.length; i++) {
    const gap = daysBetween(dates[i - 1], dates[i]);
    if (gap > largestGap) {
      largestGap = gap;
      gapAfter = dates[i - 1];
    }
  }
  const span = dates.length > 1 ? daysBetween(dates[0], dates[dates.length - 1]) : 0;
  const continuity = span === 0 ? 100 : clamp01(1 - largestGap / Math.max(365, span)) * 100;
  dimensions.push({
    id: 'continuity',
    label: 'Documentation continuity',
    score: score(continuity),
    detail:
      dates.length < 2
        ? 'Only one document, so continuity cannot be assessed.'
        : `Largest gap between documents is ${largestGap} days, after ${formatDate(gapAfter)}. The record spans ${span} days.`,
    evidenceFactIds: [],
  });

  /* 5. Freshness. */
  const staleness = dates.length === 0 ? 9999 : daysBetween(dates[dates.length - 1], asOf);
  dimensions.push({
    id: 'freshness',
    label: 'Record freshness',
    score: score(clamp01(1 - staleness / 365) * 100),
    detail:
      dates.length === 0
        ? 'No documents imported.'
        : `Most recent document is ${staleness} day${staleness === 1 ? '' : 's'} before the evaluation date (${formatDate(dates[dates.length - 1])}).`,
    evidenceFactIds: [],
  });

  /* 6. Internal consistency — findings per hundred facts. */
  const findingDensity = (derivations.length / Math.max(1, graph.facts.length)) * 100;
  dimensions.push({
    id: 'consistency',
    label: 'Internal consistency',
    score: score(clamp01(1 - findingDensity / 25) * 100),
    detail: `${derivations.length} derivation${derivations.length === 1 ? '' : 's'} across ${graph.facts.length} facts — ${round(findingDensity, 1)} findings per 100 facts.`,
    evidenceFactIds: derivations.slice(0, 15).flatMap((d) => d.factIds).slice(0, 20),
  });

  /* 7. Unit consistency. */
  const measurementEntities = graph.entities.filter(
    (e) => e.kind === 'measurement' || e.kind === 'vital',
  );
  const withValues = measurementEntities.filter((e) =>
    e.factIds.some((id) => graph.facts.find((f) => f.id === id)?.valueNum !== undefined),
  );
  const mixedUnits = withValues.filter((entity) => {
    const units = new Set(
      entity.factIds
        .map((id) => graph.facts.find((f) => f.id === id))
        .filter((f): f is Fact => f !== undefined && f.valueNum !== undefined)
        .map((f) => f.unit ?? 'none'),
    );
    return units.size > 1;
  });
  dimensions.push({
    id: 'units',
    label: 'Unit consistency',
    score: score(
      withValues.length === 0 ? 100 : clamp01(1 - mixedUnits.length / withValues.length) * 100,
    ),
    detail:
      withValues.length === 0
        ? 'No numeric measurements in the record.'
        : `${mixedUnits.length} of ${withValues.length} measurement concepts are reported in more than one unit.`,
    evidenceFactIds: mixedUnits.slice(0, 10).flatMap((e) => e.factIds).slice(0, 20),
  });

  /* 8. Terminology coding coverage. */
  const coverage = codingCoverage(
    graph.entities.filter((e) => e.kind !== 'person').map((e) => e.key),
  );
  dimensions.push({
    id: 'coding',
    label: 'Terminology coverage',
    score: score(coverage.total === 0 ? 100 : (coverage.coded / coverage.total) * 100),
    detail: `${coverage.coded} of ${coverage.total} concepts carry a standard code${
      Object.keys(coverage.bySystem).length > 0
        ? ` (${Object.entries(coverage.bySystem)
            .map(([s, n]) => `${s}: ${n}`)
            .join(', ')})`
        : ''
    }. Unmapped concepts export as text.`,
    evidenceFactIds: [],
  });

  /* 9. Monitoring completeness for open conditions. */
  const openConditions = graph.entities.filter(
    (e) =>
      e.kind === 'condition' &&
      e.factIds.some((id) => graph.facts.find((f) => f.id === id)?.status === 'active'),
  );
  let expected = 0;
  let present = 0;
  for (const condition of openConditions) {
    const short = condition.key.split(':')[1] ?? '';
    const labs = CONDITION_MONITORING[short] ?? [];
    for (const lab of labs) {
      expected += 1;
      const hit = graph.facts.some(
        (f) =>
          (f.entityKey === `measurement:${lab}` || f.entityKey === `vital:${lab}`) &&
          f.occurredAt >= graph.stats.spanStart &&
          f.occurredAt <= asOf,
      );
      if (hit) present += 1;
    }
  }
  dimensions.push({
    id: 'monitoring',
    label: 'Monitoring completeness',
    score: score(expected === 0 ? 100 : (present / expected) * 100),
    detail:
      expected === 0
        ? 'No open condition has a declared monitoring map.'
        : `${present} of ${expected} expected monitoring measurements for open conditions appear anywhere in the record.`,
    evidenceFactIds: [],
  });

  const weights: Record<string, number> = {
    provenance: 2,
    confidence: 1.4,
    authority: 1,
    continuity: 1.2,
    freshness: 0.8,
    consistency: 1.4,
    units: 1,
    coding: 0.8,
    monitoring: 1.2,
  };
  const weightSum = dimensions.reduce((sum, d) => sum + (weights[d.id] ?? 1), 0);
  const overall = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * (weights[d.id] ?? 1), 0) / weightSum,
  );

  const grade: EvidenceGrade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 50 ? 'C' : 'D';

  return { overall, grade, dimensions, generatedAt: asOf };
}

/** A one-line reading of the scorecard, used in the sidebar and the overview. */
/** A one-line reading of the scorecard, used in the sidebar and the overview. */
export function qualityHeadline(report: QualityReport): string {
  const worst = [...report.dimensions].sort((a, b) => a.score - b.score)[0];
  if (!worst) return 'No quality assessment available.';
  return `Record quality ${report.overall}/100 (grade ${report.grade}). Weakest dimension: ${worst.label.toLowerCase()} at ${worst.score}.`;
}

