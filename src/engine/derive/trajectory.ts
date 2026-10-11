import type { Fact, HealthGraph, ISODate } from '../types';
import type { Trajectory, TrajectoryPoint } from './types';
import { combineConfidence } from './grade';
import { addDays, daysBetween } from '../text/normalize';

/* ------------------------------------------------------------------ */
/* Trajectory analysis                                                 */
/*                                                                    */
/* "First reading vs last reading" is not a trend — it is two numbers.  */
/* This module fits a line, reports how well the line actually fits,    */
/* and only then talks about direction. When the fit is poor the        */
/* platform says so instead of drawing a confident arrow.               */
/* ------------------------------------------------------------------ */

export interface FitResult {
  slopePerDay: number;
  intercept: number;
  r2: number;
  n: number;
  spanDays: number;
}

/** Ordinary least squares on (days since first reading, value). */
export function fitLine(points: Array<{ day: number; value: number }>): FitResult | null {
  const n = points.length;
  if (n < 2) return null;
  const meanX = points.reduce((a, p) => a + p.day, 0) / n;
  const meanY = points.reduce((a, p) => a + p.value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.day - meanX) ** 2;
    sxy += (p.day - meanX) * (p.value - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const predicted = slope * p.day + intercept;
    ssTot += (p.value - meanY) ** 2;
    ssRes += (p.value - predicted) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const spanDays = Math.max(...points.map((p) => p.day)) - Math.min(...points.map((p) => p.day));
  return { slopePerDay: slope, intercept, r2, n, spanDays };
}

/**
 * Days until a fitted line reaches a threshold.
 *
 * Returns null unless the current value is on the approaching side *and* the
 * slope points toward it. A projection is never returned as a fact — the caller
 * labels it as extrapolation.
 */
export function daysToThreshold(
  fit: FitResult,
  currentDay: number,
  currentValue: number,
  threshold: number,
): number | null {
  if (fit.slopePerDay === 0) return null;
  const approaching =
    (threshold > currentValue && fit.slopePerDay > 0) ||
    (threshold < currentValue && fit.slopePerDay < 0);
  if (!approaching) return null;
  const dayAtThreshold = (threshold - fit.intercept) / fit.slopePerDay;
  const days = dayAtThreshold - currentDay;
  if (days < 0 || !Number.isFinite(days) || days > 3650) return null;
  return Math.round(days);
}

const MIN_POINTS = 3;
const STABLE_BAND = 0.02;

export interface TrajectoryOptions {
  /** A threshold to test against, e.g. the diagnostic cut-off for A1c. */
  threshold?: { value: number; label: string; direction: 'above' | 'below' };
  asOf?: ISODate;
}

/**
 * Build a trajectory for one measurement concept.
 *
 * Restated values are excluded: a number quoted inside a later narrative is
 * documentation of an earlier event, and including it would bend the line.
 */
export function buildTrajectory(
  graph: HealthGraph,
  entityKey: string,
  options: TrajectoryOptions = {},
): Trajectory | null {
  const entity = graph.entities.find((e) => e.key === entityKey);
  if (!entity) return null;

  const facts = (graph.factsByEntity[entityKey] ?? [])
    .map((id) => graph.facts.find((f) => f.id === id))
    .filter((f): f is Fact => Boolean(f))
    .filter((f) => f.valueNum !== undefined && f.attrs.restated !== true)
    .filter((f) => (options.asOf ? f.occurredAt <= options.asOf : true))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  if (facts.length === 0) return null;

  // Only pool readings expressed in one unit. Mixing them would fabricate a trend.
  const units = new Set(facts.map((f) => f.unit ?? 'none'));
  const usableUnit = units.size === 1 ? facts[0].unit : undefined;
  const pool = units.size === 1 ? facts : facts.filter((f) => f.unit === usableUnit);
  if (pool.length === 0) return null;

  const origin = pool[0].occurredAt;
  const points: TrajectoryPoint[] = pool.map((fact) => ({
    date: fact.occurredAt,
    value: fact.valueNum as number,
    factId: fact.id,
    docId: fact.docId,
    flagged: fact.flags.includes('implausible_value'),
  }));

  const fit = fitLine(
    pool.map((fact) => ({
      day: daysBetween(origin, fact.occurredAt),
      value: fact.valueNum as number,
    })),
  );

  const confidence = combineConfidence(
    pool.map((f) => f.confidence),
    'mean',
    0.98,
  );

  const latest = pool[pool.length - 1];
  const latestValue = latest.valueNum as number;
  const spanDays = pool.length > 1 ? daysBetween(origin, latest.occurredAt) : 0;

  if (!fit || pool.length < MIN_POINTS) {
    return {
      entityKey,
      label: entity.label,
      unit: usableUnit,
      points,
      n: pool.length,
      slopePerYear: 0,
      intercept: latestValue,
      r2: 0,
      direction: 'insufficient',
      confidence,
      spanDays,
    };
  }

  const slopePerYear = Math.round(fit.slopePerDay * 365.25 * 1000) / 1000;
  const relative =
    latestValue === 0 ? 0 : Math.abs(fit.slopePerDay * fit.spanDays) / Math.abs(latestValue);
  const direction = relative < STABLE_BAND ? 'stable' : fit.slopePerDay > 0 ? 'rising' : 'falling';

  const refHigh = latest.referenceRange?.high;
  const refLow = latest.referenceRange?.low;
  const candidate =
    options.threshold ??
    (refHigh !== undefined
      ? { value: refHigh, label: `upper reference limit ${refHigh}`, direction: 'above' as const }
      : undefined) ??
    (refLow !== undefined
      ? { value: refLow, label: `lower reference limit ${refLow}`, direction: 'below' as const }
      : undefined);

  let threshold: Trajectory['threshold'];
  if (candidate) {
    const alreadyBeyond =
      candidate.direction === 'above' ? latestValue > candidate.value : latestValue < candidate.value;
    const days = alreadyBeyond
      ? null
      : daysToThreshold(fit, fit.spanDays, latestValue, candidate.value);
    threshold = {
      value: candidate.value,
      label: candidate.label,
      direction: candidate.direction,
      crossedOn: alreadyBeyond ? latest.occurredAt : days !== null ? addDays(latest.occurredAt, days) : undefined,
      daysToCrossing: days ?? undefined,
      extrapolated: days !== null,
    };
  }

  return {
    entityKey,
    label: entity.label,
    unit: usableUnit,
    points,
    n: pool.length,
    slopePerYear,
    intercept: Math.round(fit.intercept * 1000) / 1000,
    r2: Math.round(fit.r2 * 1000) / 1000,
    direction,
    confidence,
    spanDays,
    threshold,
  };
}

export function buildAllTrajectories(graph: HealthGraph, asOf?: ISODate): Trajectory[] {
  return graph.entities
    .filter((e) => e.kind === 'measurement' || e.kind === 'vital')
    .map((entity) => buildTrajectory(graph, entity.key, { asOf }))
    .filter((t): t is Trajectory => Boolean(t))
    .filter((t) => t.n >= 2)
    .sort((a, b) => b.n - a.n);
}

