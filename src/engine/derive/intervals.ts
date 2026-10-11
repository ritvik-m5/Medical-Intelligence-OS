import type { Fact, HealthGraph, ISODate } from '../types';
import type { ConditionSpan, Interval, IntervalRelation, MedicationCourse } from './types';
import { combineConfidence } from './grade';
import { daysBetween } from '../text/normalize';

/* ------------------------------------------------------------------ */
/* Allen interval algebra                                              */
/*                                                                    */
/* Comparing dates answers "did A happen before B". Comparing intervals */
/* answers "was A true while B was true" — which is the question the    */
/* clinical rules actually need. Everything temporal in this platform   */
/* runs through these relations.                                        */
/* ------------------------------------------------------------------ */

const OPEN_END = '9999-12-31';

function endOf(interval: Interval): string {
  return interval.end ?? OPEN_END;
}

export function intervalsEqual(a: Interval, b: Interval): boolean {
  return a.start === b.start && endOf(a) === endOf(b);
}

export function relate(a: Interval, b: Interval): IntervalRelation {
  const aEnd = endOf(a);
  const bEnd = endOf(b);

  if (intervalsEqual(a, b)) return 'equals';
  if (aEnd < b.start) return 'before';
  if (aEnd === b.start) return 'meets';
  if (a.start > bEnd) return 'after';
  if (a.start === bEnd) return 'met-by';

  if (a.start === b.start) return aEnd < bEnd ? 'starts' : 'started-by';
  if (aEnd === bEnd) return a.start > b.start ? 'finishes' : 'finished-by';
  if (a.start < b.start && aEnd > bEnd) return 'contains';
  if (a.start > b.start && aEnd < bEnd) return 'during';
  return a.start < b.start ? 'overlaps' : 'overlapped-by';
}

/** True when the two intervals share at least one day. */
export function intersects(a: Interval, b: Interval): boolean {
  const relation = relate(a, b);
  return !['before', 'after', 'meets', 'met-by'].includes(relation);
}

export function overlapDays(a: Interval, b: Interval, today: ISODate): number {
  if (!intersects(a, b)) return 0;
  const start = a.start > b.start ? a.start : b.start;
  const rawEnd = endOf(a) < endOf(b) ? endOf(a) : endOf(b);
  const end = rawEnd === OPEN_END ? today : rawEnd;
  return Math.max(0, daysBetween(start, end));
}

export function intervalContains(interval: Interval, date: ISODate): boolean {
  return date >= interval.start && date <= endOf(interval);
}

export function describeRelation(relation: IntervalRelation): string {
  const map: Record<IntervalRelation, string> = {
    before: 'ended before the other began',
    meets: 'ended exactly when the other began',
    overlaps: 'overlaps the other',
    'finished-by': 'finishes before the other ends',
    contains: 'fully contains the other',
    starts: 'starts with the other but ends earlier',
    equals: 'is identical to the other',
    'started-by': 'starts with the other and continues beyond it',
    during: 'falls entirely inside the other',
    finishes: 'ends with the other but starts later',
    'overlapped-by': 'is overlapped by the other',
    'met-by': 'began exactly when the other ended',
    after: 'began after the other ended',
  };
  return map[relation];
}

/* ------------------------------------------------------------------ */
/* Course reconstruction                                               */
/* ------------------------------------------------------------------ */

const CLOSING_STATUSES = new Set(['discontinued', 'resolved', 'completed']);

/**
 * Sections where a medication statement implies a course has begun.
 *
 * A drug named in a plan ("Start amoxicillin-clavulanate 875 mg twice daily") is
 * a prescription, even though no status cue word appears in the sentence. Without
 * this, courses would only ever open from lists and the interval rules would miss
 * every acute prescription.
 */
const COURSE_START_SECTIONS = new Set([
  'plan',
  'current_medications',
  'medication_history',
  'instructions',
]);

/**
 * Reconstruct medication courses from facts.
 *
 * A course opens at the first statement that the drug was being taken and closes
 * at the first later statement that it was stopped. Re-opening after a close
 * starts a *new* course, which is what makes a stop-then-restart visible as two
 * intervals rather than one confusing blur.
 *
 * A course that never closes is marked `open`, and that word is chosen carefully:
 * it means the documents do not close it, not that the patient is still taking it.
 */
export function buildMedicationCourses(graph: HealthGraph, asOf?: ISODate): MedicationCourse[] {
  const courses: MedicationCourse[] = [];

  for (const entity of graph.entities) {
    if (entity.kind !== 'medication') continue;
    const facts = (graph.factsByEntity[entity.key] ?? [])
      .map((id) => graph.facts.find((f) => f.id === id))
      .filter((f): f is Fact => Boolean(f))
      .filter((f) => !asOf || f.occurredAt <= asOf)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.span[0] - b.span[0]);

    let current: MedicationCourse | null = null;

    for (const fact of facts) {
      const isStart =
        fact.status === 'active' ||
        (fact.status === 'unknown' && COURSE_START_SECTIONS.has(fact.sectionKind));
      const isStop = CLOSING_STATUSES.has(fact.status);

      if (isStart && !current) {
        const dose =
          fact.attrs.dose && fact.attrs.dose !== 'not stated'
            ? `${fact.attrs.dose} ${fact.attrs.doseUnit ?? ''} ${fact.attrs.frequency ?? ''}`.trim()
            : undefined;
        current = {
          entityKey: entity.key,
          label: entity.label,
          interval: { start: fact.occurredAt },
          startFactId: fact.id,
          state: 'open',
          dose,
          drugClass: String(fact.attrs.drugClass ?? entity.category ?? '') || undefined,
          closedByList: false,
          // A course opened from an implied prescription is weaker evidence than
          // one opened by an explicit "currently taking" statement.
          confidence:
            fact.status === 'active'
              ? fact.confidence
              : Math.round(fact.confidence * 0.85 * 100) / 100,
        };
        continue;
      }

      if (isStop && current) {
        current.interval.end = fact.occurredAt;
        current.endFactId = fact.id;
        current.state = 'closed';
        current.closedByList =
          fact.sectionKind === 'discontinued_medications' ||
          fact.sectionKind === 'current_medications';
        current.confidence = combineConfidence([current.confidence, fact.confidence], 'all', 0.97);
        courses.push(current);
        current = null;
        continue;
      }

      if (current && isStart) {
        current.confidence = combineConfidence([current.confidence, fact.confidence], 'mean', 0.97);
      }
    }

    if (current) courses.push(current);
  }

  return courses.sort((a, b) => a.interval.start.localeCompare(b.interval.start));
}

export function coursesFor(courses: MedicationCourse[], entityKey: string): MedicationCourse[] {
  return courses.filter((c) => c.entityKey === entityKey);
}

/** The course in force on a given date, if the documents support one. */
export function activeOn(
  courses: MedicationCourse[],
  entityKey: string,
  date: ISODate,
): MedicationCourse | null {
  return (
    coursesFor(courses, entityKey).find(
      (course) => date >= course.interval.start && date <= endOf(course.interval),
    ) ?? null
  );
}

export function buildConditionSpans(graph: HealthGraph, asOf?: ISODate): ConditionSpan[] {
  const spans: ConditionSpan[] = [];
  for (const entity of graph.entities) {
    if (entity.kind !== 'condition') continue;
    const facts = (graph.factsByEntity[entity.key] ?? [])
      .map((id) => graph.facts.find((f) => f.id === id))
      .filter((f): f is Fact => Boolean(f))
      .filter((f) => !asOf || f.occurredAt <= asOf)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    let current: ConditionSpan | null = null;
    for (const fact of facts) {
      const isActive = fact.status === 'active';
      const isResolved = fact.status === 'resolved' || fact.status === 'discontinued';
      if (isActive && !current) {
        current = {
          entityKey: entity.key,
          label: entity.label,
          interval: { start: fact.occurredAt },
          startFactId: fact.id,
          state: 'open',
          confidence: fact.confidence,
        };
      } else if (isResolved && current) {
        current.interval.end = fact.occurredAt;
        current.endFactId = fact.id;
        current.state = 'closed';
        current.confidence = combineConfidence([current.confidence, fact.confidence], 'all', 0.95);
        spans.push(current);
        current = null;
      } else if (current && isActive) {
        current.confidence = combineConfidence([current.confidence, fact.confidence], 'mean', 0.95);
      }
    }
    if (current) spans.push(current);
  }
  return spans.sort((a, b) => a.interval.start.localeCompare(b.interval.start));
}

export function spansFor(spans: ConditionSpan[], entityKey: string): ConditionSpan[] {
  return spans.filter((s) => s.entityKey === entityKey);
}

/** Interval of a fact as documented, used for facts that are not courses. */
export function factInterval(fact: Fact): Interval {
  return { start: fact.occurredAt, end: fact.periodEnd ?? fact.occurredAt };
}

