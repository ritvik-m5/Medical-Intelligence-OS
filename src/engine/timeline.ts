import type {
  ChangeEvent,
  Entity,
  EntityKind,
  EntityState,
  Fact,
  FactStatus,
  HealthGraph,
  ISODate,
  MeasurementState,
  Snapshot,
} from './types';
import { getFactMap } from './access';

const STATUS_RANK: Record<FactStatus, number> = {
  discontinued: 6,
  resolved: 5,
  historical: 4,
  completed: 3,
  ordered: 2,
  scheduled: 2,
  active: 1,
  unknown: 0,
};

/** Facts at or before a date, chronological. */
export function factsAsOf(graph: HealthGraph, asOf: ISODate): Fact[] {
  return graph.facts
    .filter((f) => f.occurredAt <= asOf)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.span[0] - b.span[0]);
}

/**
 * Fold an entity's facts into the status it had at a point in time.
 *
 * The rule is deliberately simple and auditable: the most recent *explicit*
 * status wins, and 'unknown' never overwrites a known status. The full trail is
 * kept so the UI can show exactly which sentence produced the state.
 */
export function foldEntityState(entity: Entity, facts: Fact[]): EntityState | null {
  if (facts.length === 0) return null;
  const sorted = [...facts].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.span[0] - b.span[0],
  );
  const explicit = sorted.filter((f) => f.status !== 'unknown');
  const last = explicit.length > 0 ? explicit[explicit.length - 1] : sorted[sorted.length - 1];

  // Walk backwards while the status is unchanged to find when this run began.
  let since = last.occurredAt;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === last.status || sorted[i].status === 'unknown') {
      since = sorted[i].occurredAt;
    } else {
      break;
    }
  }

  const confidence = sorted.reduce((sum, f) => sum + f.confidence, 0) / sorted.length;
  const doseSource = [...sorted].reverse().find((f) => f.attrs.dose && f.attrs.dose !== 'not stated');
  const latestDose = doseSource
    ? `${doseSource.attrs.dose} ${doseSource.attrs.doseUnit ?? ''} ${doseSource.attrs.frequency ?? ''}`
        .replace(/\s+/g, ' ')
        .trim()
    : undefined;
  return {
    entityKey: entity.key,
    entityId: entity.id,
    kind: entity.kind,
    label: entity.label,
    status: last.status,
    since,
    lastDocumented: sorted[sorted.length - 1].occurredAt,
    factIds: sorted.map((f) => f.id),
    docIds: Array.from(new Set(sorted.map((f) => f.docId))),
    confidence: Math.round(confidence * 100) / 100,
    statusTrail: sorted.map((f) => ({
      date: f.occurredAt,
      status: f.status,
      docId: f.docId,
      factId: f.id,
    })),
    latestDose,
    category: entity.category,
  };
}

function measurementState(entity: Entity, facts: Fact[]): MeasurementState | null {
  const withValues = facts.filter((f) => f.valueNum !== undefined);
  if (withValues.length === 0) return null;
  // Values restated inside later narrative notes ("A1c 6.4 in June") are real
  // documentation but not new readings, so they never define the latest value
  // or the trend.
  const primary = withValues.filter((f) => f.attrs.restated !== true);
  const series = (primary.length > 0 ? primary : withValues).sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
  const first = series[0];
  const latest = series[series.length - 1];
  // Only compare values expressed in the same unit; mixing units silently would
  // fabricate trends.
  const sameUnit = first.unit === latest.unit;
  const changePct =
    sameUnit && first.valueNum && latest.valueNum
      ? Math.round(((latest.valueNum - first.valueNum) / first.valueNum) * 1000) / 10
      : null;

  let trend: MeasurementState['trend'] = 'insufficient';
  if (series.length >= 2 && sameUnit) {
    const delta = (latest.valueNum ?? 0) - (first.valueNum ?? 0);
    const tolerance = Math.abs((first.valueNum ?? 1) * 0.02);
    trend = Math.abs(delta) <= tolerance ? 'flat' : delta > 0 ? 'up' : 'down';
  }

  const ref = latest.referenceRange ?? first.referenceRange;
  let inRange: boolean | null = null;
  if (latest.valueNum !== undefined && ref) {
    if (ref.low !== undefined && latest.valueNum < ref.low) inRange = false;
    else if (ref.high !== undefined && latest.valueNum > ref.high) inRange = false;
    else inRange = true;
  }

  return {
    entityKey: entity.key,
    entityId: entity.id,
    label: entity.label,
    unit: latest.unit,
    latest,
    first,
    readings: series.length,
    changePct,
    trend,
    referenceRange: ref,
    inRange,
  };
}

const SNAPSHOT_KINDS: EntityKind[] = [
  'condition',
  'medication',
  'allergy',
  'immunization',
  'procedure',
  'measurement',
  'vital',
];

/**
 * The Time Machine's core: what the record actually documented as of a date.
 * Nothing from after `asOf` is visible, which is what makes it a time machine
 * rather than a filtered list.
 */
export function snapshotAt(graph: HealthGraph, asOf: ISODate): Snapshot {
  const factMap = getFactMap(graph);
  const visible = graph.facts.filter((f) => f.occurredAt <= asOf);
  const visibleIds = new Set(visible.map((f) => f.id));

  const states: Partial<Record<EntityKind, EntityState[]>> = {};
  const measurements: MeasurementState[] = [];

  for (const entity of graph.entities) {
    if (!SNAPSHOT_KINDS.includes(entity.kind)) continue;
    const facts = entity.factIds
      .filter((id) => visibleIds.has(id))
      .map((id) => factMap.get(id))
      .filter((f): f is Fact => Boolean(f));
    if (facts.length === 0) continue;

    if (entity.kind === 'measurement' || entity.kind === 'vital') {
      const state = measurementState(entity, facts);
      if (state) measurements.push(state);
      continue;
    }
    const state = foldEntityState(entity, facts);
    if (!state) continue;
    (states[entity.kind] ||= []).push(state);
  }

  const byLabel = (a: EntityState, b: EntityState) => a.label.localeCompare(b.label);
  const documents = graph.documents
    .filter((d) => d.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    asOf,
    facts: visible,
    conditions: (states.condition ?? []).sort(byLabel),
    medications: (states.medication ?? []).sort(byLabel),
    allergies: (states.allergy ?? []).sort(byLabel),
    immunizations: (states.immunization ?? []).sort(byLabel),
    procedures: (states.procedure ?? []).sort(byLabel),
    measurements: measurements.sort((a, b) => a.label.localeCompare(b.label)),
    documents,
    totals: {
      documents: documents.length,
      facts: visible.length,
      entities:
        Object.values(states).reduce((n, list) => n + (list?.length ?? 0), 0) + measurements.length,
      conditions: states.condition?.length ?? 0,
      medications: states.medication?.length ?? 0,
      measurements: measurements.length,
      procedures: states.procedure?.length ?? 0,
    },
  };
}

export interface SnapshotDiffOptions {
  /** Entity kinds whose absence in the later snapshot is expected and uninformative. */
  ignoreKinds?: EntityKind[];
}

/**
 * Compare two snapshots.
 *
 * The caveats matter more than the deltas. "Medication X was in the January list
 * and is not in the June list" is a documented change in the *record*. It is not
 * evidence that anyone stopped the medication, and the engine says so.
 */
export function diffSnapshots(
  from: Snapshot,
  to: Snapshot,
  options: SnapshotDiffOptions = {},
): ChangeEvent[] {
  const ignore = new Set(options.ignoreKinds ?? []);
  const events: ChangeEvent[] = [];

  const groups: Array<{ kind: ChangeEvent['factType']; from: EntityState[]; to: EntityState[] }> = [
    { kind: 'medication', from: from.medications, to: to.medications },
    { kind: 'condition', from: from.conditions, to: to.conditions },
    { kind: 'allergy', from: from.allergies, to: to.allergies },
    { kind: 'procedure', from: from.procedures, to: to.procedures },
    { kind: 'immunization', from: from.immunizations, to: to.immunizations },
  ];

  for (const group of groups) {
    if (ignore.has(group.kind as EntityKind)) continue;
    const fromMap = new Map(group.from.map((s) => [s.entityKey, s]));
    const toMap = new Map(group.to.map((s) => [s.entityKey, s]));

    for (const [key, state] of toMap) {
      const before = fromMap.get(key);
      if (!before) {
        events.push({
          id: `chg_add_${key}_${to.asOf}`,
          kind: 'added',
          factType: group.kind,
          entityKey: key,
          entityLabel: state.label,
          fromDate: from.asOf,
          toDate: state.since,
          toFactId: state.factIds[state.factIds.length - 1],
          toValue: state.status,
          deltaText: `${state.label} appears in the record for the first time on ${state.since}.`,
          confidence: state.confidence,
          caveat:
            'First appearance in the imported documents. The underlying condition or prescription may predate this record.',
          docIds: state.docIds,
        });
        continue;
      }
      if (before.status !== state.status) {
        events.push({
          id: `chg_status_${key}_${to.asOf}`,
          kind: 'status_changed',
          factType: group.kind,
          entityKey: key,
          entityLabel: state.label,
          fromDate: before.lastDocumented,
          toDate: state.lastDocumented,
          fromFactId: before.factIds[before.factIds.length - 1],
          toFactId: state.factIds[state.factIds.length - 1],
          fromValue: before.status,
          toValue: state.status,
          deltaText: `${state.label}: ${before.status} → ${state.status}.`,
          confidence: state.confidence,
          caveat:
            'Status changes are read from wording in the documents. Confirm the intended status against the source record.',
          docIds: Array.from(new Set([...before.docIds, ...state.docIds])),
        });
      } else if (
        group.kind === 'medication' &&
        before.latestDose &&
        state.latestDose &&
        before.latestDose !== state.latestDose
      ) {
        events.push({
          id: `chg_dose_${key}_${to.asOf}`,
          kind: 'value_changed',
          factType: 'medication',
          entityKey: key,
          entityLabel: state.label,
          fromDate: before.lastDocumented,
          toDate: state.lastDocumented,
          fromFactId: before.factIds[before.factIds.length - 1],
          toFactId: state.factIds[state.factIds.length - 1],
          fromValue: before.latestDose,
          toValue: state.latestDose,
          deltaText: `${state.label} dose changed: ${before.latestDose} → ${state.latestDose}.`,
          confidence: state.confidence,
          caveat:
            'The engine compares the last documented strength in each period. It does not conclude that the change was intentional or that the earlier strength is invalid.',
          docIds: Array.from(new Set([...before.docIds, ...state.docIds])),
        });
      }
    }

    for (const [key, state] of fromMap) {
      if (toMap.has(key)) continue;
      events.push({
        id: `chg_remove_${key}_${to.asOf}`,
        kind: 'removed',
        factType: group.kind,
        entityKey: key,
        entityLabel: state.label,
        fromDate: state.lastDocumented,
        toDate: to.asOf,
        fromFactId: state.factIds[state.factIds.length - 1],
        fromValue: state.status,
        deltaText: `${state.label} was documented as of ${state.lastDocumented} but does not appear in the record at ${to.asOf}.`,
        confidence: state.confidence,
        caveat:
          'The available documents do not establish why it is no longer listed. Absence from a summary is not the same as a discontinuation.',
        docIds: state.docIds,
      });
    }
  }


  // Measurement changes.
  const toMeasurements = new Map(to.measurements.map((m) => [m.entityKey, m]));
  for (const before of from.measurements) {
    const after = toMeasurements.get(before.entityKey);
    if (!after) continue;
    if (after.latest.id === before.latest.id) continue;
    if (after.latest.unit !== before.latest.unit) {
      events.push({
        id: `chg_unit_${before.entityKey}_${to.asOf}`,
        kind: 'value_changed',
        factType: 'measurement',
        entityKey: before.entityKey,
        entityLabel: before.label,
        fromDate: before.latest.occurredAt,
        toDate: after.latest.occurredAt,
        fromFactId: before.latest.id,
        toFactId: after.latest.id,
        fromValue: `${before.latest.valueNum} ${before.latest.unit ?? ''}`.trim(),
        toValue: `${after.latest.valueNum} ${after.latest.unit ?? ''}`.trim(),
        deltaText: `${before.label} is reported in different units between documents (${before.latest.unit ?? 'none'} vs ${after.latest.unit ?? 'none'}); no conversion was assumed.`,
        confidence: Math.min(before.latest.confidence, after.latest.confidence),
        caveat: 'Values in different units were deliberately not compared. Confirm which unit applies.',
        docIds: [before.latest.docId, after.latest.docId],
      });
      continue;
    }
    const fromValue = before.latest.valueNum;
    const toValue = after.latest.valueNum;
    if (fromValue === undefined || toValue === undefined || fromValue === toValue) continue;
    const delta = Math.round((toValue - fromValue) * 100) / 100;
    const pct = fromValue !== 0 ? Math.round((delta / fromValue) * 1000) / 10 : null;
    events.push({
      id: `chg_value_${before.entityKey}_${to.asOf}`,
      kind: 'value_changed',
      factType: 'measurement',
      entityKey: before.entityKey,
      entityLabel: before.label,
      fromDate: before.latest.occurredAt,
      toDate: after.latest.occurredAt,
      fromFactId: before.latest.id,
      toFactId: after.latest.id,
      fromValue: `${fromValue} ${before.latest.unit ?? ''}`.trim(),
      toValue: `${toValue} ${after.latest.unit ?? ''}`.trim(),
      deltaText: `${before.label} ${fromValue} → ${toValue} ${after.latest.unit ?? ''} (${delta > 0 ? '+' : ''}${delta}${pct !== null ? `, ${pct > 0 ? '+' : ''}${pct}%` : ''}).`,
      confidence: Math.min(before.latest.confidence, after.latest.confidence),
      caveat:
        'Two readings do not make a trend. Interpretation needs the full series and clinical context.',
      docIds: [before.latest.docId, after.latest.docId],
    });
  }

  for (const doc of to.documents) {
    if (from.documents.some((d) => d.id === doc.id)) continue;
    events.push({
      id: `chg_doc_${doc.id}`,
      kind: 'new_document',
      factType: 'encounter',
      entityKey: `document:${doc.id}`,
      entityLabel: doc.title,
      fromDate: from.asOf,
      toDate: doc.date,
      deltaText: `New document: ${doc.title} (${doc.kind.replace(/_/g, ' ')}).`,
      confidence: doc.quality,
      caveat: 'Newly imported document. It may describe events that happened before its own date.',
      docIds: [doc.id],
    });
  }

  const rank = (e: ChangeEvent) => {
    const kindWeight =
      e.kind === 'status_changed' ? 0 : e.kind === 'added' ? 1 : e.kind === 'removed' ? 2 : 3;
    return kindWeight * 1000 + STATUS_RANK[(e.toValue as FactStatus) ?? 'unknown'] * 10;
  };
  return events.sort((a, b) => rank(a) - rank(b) || a.toDate.localeCompare(b.toDate));
}

