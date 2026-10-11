import type {
  Contradiction,
  ContradictionKind,
  Fact,
  HealthGraph,
  Severity,
} from './types';
import { getDocument, getFactMap } from './access';
import { ALLERGY_CROSS_REACTIVITY } from './relations';
import { daysBetween } from './text/normalize';

/** One raw engine finding, before it is turned into a Derivation. */
export interface Draft {
  kind: ContradictionKind;
  severity: Severity;
  title: string;
  detail: string;
  entityKey?: string;
  facts: Fact[];
  question: string;
  notConcluded: string;
  satisfiableBy?: string;
}

function shortKey(entityKey: string): string {
  return entityKey.split(':')[1] ?? entityKey;
}

function cite(fact: Fact, graph: HealthGraph): string {
  const doc = getDocument(graph, fact.docId);
  return `${doc?.title ?? 'document'} (${fact.occurredAt}): "${fact.quote}"`;
}

/**
 * R1/R2 — a medication documented as stopped, then documented again afterwards.
 *
 * This is the highest-value rule in the engine: it is the exact pattern that
 * makes a medication list dangerous. The engine never decides which statement is
 * correct; it surfaces all of them and asks the one question that resolves it.
 */
function medicationStatusConflicts(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  for (const entity of graph.entities) {
    if (entity.kind !== 'medication') continue;
    const facts = entity.factIds
      .map((id) => factMap.get(id))
      .filter((f): f is Fact => Boolean(f))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const stops = facts.filter((f) => f.status === 'discontinued');
    if (stops.length === 0) continue;
    const firstStop = stops[0];
    const later = facts.filter((f) => f.occurredAt > firstStop.occurredAt && f.id !== firstStop.id);
    const laterActive = later.filter((f) => f.status === 'active');
    const laterListed = later.filter((f) => f.sectionKind === 'current_medications');

    if (laterActive.length > 0) {
      const evidence = [firstStop, ...laterActive];
      out.push({
        kind: 'medication_status_conflict',
        severity: 'high',
        title: `${entity.label} is documented as stopped and later as active`,
        detail: [
          `The record contains a statement that ${entity.label} was discontinued, and a later statement that it is active.`,
          ...evidence.map((f) => `• ${cite(f, graph)}`),
        ].join('\n'),
        entityKey: entity.key,
        facts: evidence,
        question: `Is ${entity.label} currently being taken, and was it restarted?`,
        notConcluded:
          'The engine does not decide which statement is current. Both are shown with their dates and sources.',
      });
    } else if (laterListed.length > 0) {
      const evidence = [firstStop, ...laterListed];
      out.push({
        kind: 'medication_listed_after_stop',
        severity: 'high',
        title: `${entity.label} still appears on a later "current medications" list`,
        detail: [
          `${entity.label} is documented as discontinued, yet a later medication list presented as current still includes it.`,
          ...evidence.map((f) => `• ${cite(f, graph)}`),
        ].join('\n'),
        entityKey: entity.key,
        facts: evidence,
        question: `Should ${entity.label} still be listed as an active medication?`,
        notConcluded:
          'A medication list can be copied forward without review. The engine reports the discrepancy, not the reason for it.',
      });
    }
  }
  return out;
}

/** R3 — the same measurement, the same day, two different values. */
function measurementValueConflicts(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  for (const entity of graph.entities) {
    if (entity.kind !== 'measurement' && entity.kind !== 'vital') continue;
    const facts = entity.factIds
      .map((id) => factMap.get(id))
      .filter((f): f is Fact => f !== undefined && f.valueNum !== undefined);
    const byDate = new Map<string, Fact[]>();
    for (const fact of facts) {
      const key = `${fact.occurredAt}|${fact.unit ?? 'none'}`;
      const list = byDate.get(key);
      if (list) list.push(fact);
      else byDate.set(key, [fact]);
    }
    for (const [, group] of byDate) {
      if (group.length < 2) continue;
      const values = new Set(group.map((f) => f.valueNum));
      if (values.size < 2) continue;
      const docs = new Set(group.map((f) => f.docId));
      out.push({
        kind: 'measurement_value_conflict',
        severity: docs.size > 1 ? 'high' : 'medium',
        title: `${entity.label} has two different values for ${group[0].occurredAt}`,
        detail: [
          `Documents disagree about ${entity.label} on the same date.`,
          ...group.map((f) => `• ${f.valueNum} ${f.unit ?? ''} — ${cite(f, graph)}`),
        ].join('\n'),
        entityKey: entity.key,
        facts: group,
        question: `Which ${entity.label} result is correct for ${group[0].occurredAt}?`,
        notConcluded:
          'Duplicate results from different laboratories are not automatically wrong. The engine does not pick a winner.',
      });
    }
  }
  return out;
}

/** R4 — an active medication that a recorded allergy says to avoid. */
function allergyMedicationConflicts(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  const activeDrugs = new Map<string, Fact[]>();
  const activeAllergies = new Map<string, Fact[]>();

  for (const entity of graph.entities) {
    const facts = entity.factIds.map((id) => factMap.get(id)).filter((f): f is Fact => Boolean(f));
    if (entity.kind === 'medication') activeDrugs.set(shortKey(entity.key), facts);
    if (entity.kind === 'allergy') activeAllergies.set(shortKey(entity.key), facts);
  }

  for (const [allergyKey, cross] of Object.entries(ALLERGY_CROSS_REACTIVITY)) {
    const allergyFacts = activeAllergies.get(allergyKey);
    if (!allergyFacts || allergyFacts.length === 0) continue;
    // The reference point is when the allergy was *first* documented, not the
    // most recent restatement of it: a 2022 allergy constrains a 2024 script.
    const firstAllergy = allergyFacts[0];
    const lastAllergy = allergyFacts[allergyFacts.length - 1];
    for (const drugKey of cross.drugs) {
      const drugFacts = activeDrugs.get(drugKey);
      if (!drugFacts || drugFacts.length === 0) continue;

      const prescribed = drugFacts.filter(
        (f) => f.occurredAt >= firstAllergy.occurredAt && (f.status === 'active' || f.status === 'unknown'),
      );
      if (prescribed.length === 0) continue;

      out.push({
        kind: 'medication_allergy_conflict',
        severity: 'high',
        title: `${prescribed[0].label} documented while a ${firstAllergy.label} allergy is on file`,
        detail: [
          'A recorded allergy and a later prescription for a related medication appear in the same record.',
          `• Allergy first documented: ${cite(firstAllergy, graph)}`,
          ...(lastAllergy.id !== firstAllergy.id
            ? [`• Allergy still on file: ${cite(lastAllergy, graph)}`]
            : []),
          ...prescribed.map((f) => `• Prescribed: ${cite(f, graph)}`),
          `Relationship used: ${cross.rationale}`,
        ].join('\n'),
        entityKey: `medication:${drugKey}`,
        facts: [firstAllergy, ...prescribed],
        question: `Was ${prescribed[0].label} intentionally prescribed despite the recorded ${firstAllergy.label} allergy?`,
        notConcluded:
          'The engine does not conclude that this was an error. Allergies are frequently outdated, mislabelled, or intentionally overridden. It reports the pairing and the source of each statement.',
      });
    }
  }
  return out;
}

/** R5 — a condition documented as resolved, then documented as present again. */
function conditionResolutionConflicts(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  for (const entity of graph.entities) {
    if (entity.kind !== 'condition') continue;
    const facts = entity.factIds
      .map((id) => factMap.get(id))
      .filter((f): f is Fact => Boolean(f))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const resolved = facts.filter((f) => f.status === 'resolved');
    if (resolved.length === 0) continue;
    const lastResolved = resolved[resolved.length - 1];
    const after = facts.filter(
      (f) =>
        f.occurredAt > lastResolved.occurredAt && (f.status === 'active' || f.status === 'unknown'),
    );
    if (after.length === 0) continue;
    out.push({
      kind: 'condition_resolution_conflict',
      severity: 'medium',
      title: `${entity.label} is documented as resolved and later as present`,
      detail: [
        `${entity.label} was recorded as resolved, then appears again in later documents.`,
        `• ${cite(lastResolved, graph)}`,
        ...after.map((f) => `• ${cite(f, graph)}`),
      ].join('\n'),
      entityKey: entity.key,
      facts: [lastResolved, ...after],
      question: `Is ${entity.label} still considered active, or was the earlier resolution documented in error?`,
      notConcluded:
        'Recurrence, coding differences and copied-forward problem lists all produce this pattern.',
    });
  }
  return out;
}


/** R6 — the same demographic field recorded two different ways. */
function demographicConflicts(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  for (const entity of graph.entities) {
    if (entity.kind !== 'demographic') continue;
    const facts = entity.factIds.map((id) => factMap.get(id)).filter((f): f is Fact => Boolean(f));
    const values = new Map<string, Fact[]>();
    for (const fact of facts) {
      const value = String(fact.attrs.valueText ?? fact.valueText ?? '');
      if (!value) continue;
      const list = values.get(value);
      if (list) list.push(fact);
      else values.set(value, [fact]);
    }
    if (values.size < 2) continue;
    const groups = Array.from(values.entries());
    out.push({
      kind: 'demographic_conflict',
      severity: entity.key.endsWith('blood-type') ? 'high' : 'medium',
      title: `${entity.label} is recorded as ${groups.map(([v]) => v).join(' and ')}`,
      detail: [
        `Different documents give different values for ${entity.label}.`,
        ...groups.flatMap(([value, list]) => list.map((f) => `• ${value} — ${cite(f, graph)}`)),
      ].join('\n'),
      entityKey: entity.key,
      facts: groups.flatMap(([, list]) => list),
      question: `Which ${entity.label.toLowerCase()} is correct?`,
      notConcluded:
        'The engine does not choose between conflicting administrative values; it requires a human to confirm.',
    });
  }
  return out;
}

/** R7 — values the engine refuses to treat as real findings. */
function implausibleMeasurements(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  for (const entity of graph.entities) {
    if (entity.kind !== 'measurement' && entity.kind !== 'vital') continue;
    const flagged = entity.factIds
      .map((id) => factMap.get(id))
      .filter((f): f is Fact => f !== undefined && f.flags.includes('implausible_value'));
    if (flagged.length === 0) continue;
    out.push({
      kind: 'implausible_measurement',
      severity: 'high',
      title: `${entity.label} has a value outside the plausible range`,
      detail: flagged
        .map(
          (f) =>
            `• ${f.valueNum} ${f.unit ?? ''} — ${cite(f, graph)}\n  ${String(f.attrs.plausibilityNote ?? '')}`,
        )
        .join('\n'),
      entityKey: entity.key,
      facts: flagged,
      question: `Is the reported ${entity.label} value correct as written, or is there a decimal or unit error in the source document?`,
      notConcluded:
        'The engine reports the value it read and flags it. It does not correct the number, because silently altering a source value would be worse than flagging it.',
    });
  }
  return out;
}

/** A documented direction flag that disagrees with the numeric value in the
 * same row. The two statements come from the same document, and the engine
 * reports the disagreement without choosing which part is wrong. */
function flagValueMismatches(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);

  for (const entity of graph.entities) {
    if (entity.kind !== 'measurement' && entity.kind !== 'vital') continue;

    for (const id of entity.factIds) {
      const fact = factMap.get(id);
      if (!fact || fact.valueNum === undefined) continue;
      const direction = fact.attrs.documentFlag;
      if (direction !== 'H' && direction !== 'L') continue;
      const referenceRange = fact.referenceRange;
      if (!referenceRange || referenceRange.low === undefined || referenceRange.high === undefined) continue;

      // A 'L' flag is reported as low; a 'H' flag as high. If the number is on
      // the wrong side of the printed reference interval, the two statements do
      // not agree with each other.
      const expectedHigh = direction === 'H';
      const value: number = fact.valueNum;
      const valueAboveLow = value >= referenceRange.low;
      const valueBelowHigh = value <= referenceRange.high;
      const agreesWithFlag = expectedHigh ? valueAboveLow : valueBelowHigh;

      if (agreesWithFlag) continue;

      const doc = getDocument(graph, fact.docId);
      out.push({
        kind: 'quality_flag',
        severity: 'medium',
        title: `The reported flag does not match the reported value for ${entity.label}`,
        detail: [
          `This row reports ${entity.label} ${value} ${fact.unit ?? ''} on ${fact.occurredAt}, which is ${value >= referenceRange.low ? 'above' : 'below'} the printed reference interval ${referenceRange.low}-${referenceRange.high}.`,
          `'${direction}' is the direction marker for a ${direction === 'H' ? 'high' : 'low'} result, so it conflicts with the number as written.`,
          doc ? `Source: ${doc.title} (${fact.occurredAt}) — \"${fact.quote}\"` : `Source: (unknown document) — \"${fact.quote}\"`,
        ].join('\n'),
        entityKey: entity.key,
        facts: [fact],
        question: `Is the reported value or the reported direction flag the transcription error?`,
        notConcluded:
          'The engine reports the conflict between the number and the flag. It does not decide which one is wrong, and it never rewrites the number.',
      });
    }
  }

  return out;
}

/** Data-quality flags live outside the contradiction list: they are warnings
 * about the record, not claims that two documents disagree. */
export function qualityFlags(graph: HealthGraph): Draft[] {
  return [...implausibleMeasurements(graph), ...flagValueMismatches(graph)];
}

/** Quality flags as Contradictions, so derivation rules can cite them with the
 * same helpers as cross-document disagreements. They are computed from the same
 * drafts the interface shows under a separate data-quality heading. */
export function qualityFlagContradictions(graph: HealthGraph): Contradiction[] {
  const drafts = qualityFlags(graph);
  const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return drafts
    .map((draft, index) => {
      const dates = draft.facts.map((f) => f.occurredAt).sort();
      return {
        id: `qf_${draft.kind}_${index}`,
        kind: draft.kind,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
        entityKey: draft.entityKey,
        factIds: draft.facts.map((f) => f.id),
        docIds: Array.from(new Set(draft.facts.map((f) => f.docId))),
        window: { start: dates[0], end: dates[dates.length - 1] },
        questionForClinician: draft.question,
        notConcluded: draft.notConcluded,
        ...(draft.satisfiableBy ? { satisfiableBy: draft.satisfiableBy } : {}),
      };
    })
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.window.end.localeCompare(a.window.end),
    );
}

/** R8 — the same event with two different dates. */
function duplicateConflictingDetails(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  for (const entity of graph.entities) {
    if (entity.kind !== 'procedure' && entity.kind !== 'immunization') continue;
    const facts = entity.factIds.map((id) => factMap.get(id)).filter((f): f is Fact => Boolean(f));
    const byDoc = new Map<string, Fact>();
    for (const fact of facts) {
      const existing = byDoc.get(fact.docId);
      if (!existing || fact.confidence > existing.confidence) byDoc.set(fact.docId, fact);
    }
    const distinct = Array.from(byDoc.values()).sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    );
    if (distinct.length < 2) continue;
    const spread = daysBetween(distinct[0].occurredAt, distinct[distinct.length - 1].occurredAt);
    const windowDays = entity.kind === 'immunization' ? 120 : 30;
    if (spread === 0 || spread > windowDays) continue;
    out.push({
      kind: 'duplicate_conflicting_detail',
      severity: 'low',
      title: `${entity.label} is recorded on ${distinct.length} different dates within ${spread} days`,
      detail: [
        `The same event is documented more than once with different dates.`,
        ...distinct.map((f) => `• ${cite(f, graph)}`),
      ].join('\n'),
      entityKey: entity.key,
      facts: distinct,
      question: `Which date is correct for ${entity.label}?`,
      notConcluded:
        'Repeated documentation of one event across visits is normal. The engine only reports that the dates disagree.',
    });
  }
  return out;
}


/**
 * A real dose difference between two documents for the same medication, where at
 * least one document states the discrepancy (or the patient's uncertainty) is
 * explicit. Unlike a same-date dose conflict, these are the observations the
 * record itself raises, and the engine records the dates and sources without
 * deciding which dose is correct.
 */
function crossRecordDoseDiscrepancy(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);

  const explicitUncertainty = /\b(unsure|uncertain)|(do not match|does not match|may not match|does not reflect|may not reflect|lists do not match|doses may not match|list does not match|patient unsure)\b/i;

  for (const entity of graph.entities) {
    if (entity.kind !== 'medication') continue;
    const facts = entity.factIds
      .map((id) => factMap.get(id))
      .filter((f): f is Fact => Boolean(f));

    // Same-date, same-drug comparisons are handled by `doseConflicts`. This rule
    // only looks across documents, and only at facts that are actively dosed.
    const activeDoseFacts = facts.filter((f) => f.status === 'active' && f.attrs.dose && f.attrs.dose !== 'not stated');

    const entityUncertainty = (doc: ReturnType<typeof getDocument>, otherDoc: ReturnType<typeof getDocument>): boolean => {
      // Uncertainty must be documented against one of the two records actually
      // compared — the fact's own line or a line in its source document that
      // names *this* medication or states both documents' doses. A document-wide
      // cue is otherwise attributed to the wrong drug.
      const factCues = (fact: Fact): boolean => explicitUncertainty.test(String(fact.quote ?? ''));
      if (activeDoseFacts.some((f) => (f.docId === doc?.id || f.docId === otherDoc?.id) && factCues(f))) return true;
      if (!doc && !otherDoc) return false;

      const label = entity.label.toLowerCase();
      const check = (candidate: ReturnType<typeof getDocument>): boolean => {
        if (!candidate) return false;
        const lines = candidate.text.split(/\n/);
        return lines.some((line) => {
          if (!explicitUncertainty.test(line)) return false;
          return line.toLowerCase().includes(label);
        });
      };
      return check(doc) || check(otherDoc);
    };

    for (let i = 0; i < activeDoseFacts.length; i += 1) {
      for (let j = i + 1; j < activeDoseFacts.length; j += 1) {
        const a = activeDoseFacts[i];
        const b = activeDoseFacts[j];
        if (a.docId === b.docId) continue;
        if (String(a.attrs.dose) === String(b.attrs.dose)) continue;

        const docA = getDocument(graph, a.docId);
        const docB = getDocument(graph, b.docId);
        if (!entityUncertainty(docA, docB)) continue;

        const [earlier, later] = a.occurredAt <= b.occurredAt ? [a, b] : [b, a];
        out.push({
          kind: 'cross_record_dose_discrepancy',
          severity: 'medium',
          title: `${entity.label} is documented at two different doses in the record`,
          detail: [
            `The record documents ${entity.label} at ${earlier.attrs.dose} ${earlier.attrs.doseUnit ?? ''} on ${earlier.occurredAt} and at ${later.attrs.dose} ${later.attrs.doseUnit ?? ''} on ${later.occurredAt}.`,
            earlier.docId !== later.docId
              ? `Earlier source: ${docA?.title ?? 'document'} (${earlier.occurredAt}) — \"${earlier.quote}\".`
              : `Earlier source: ${docA?.title ?? 'document'} (${earlier.occurredAt}) — \"${earlier.quote}\".`,
            later.docId !== earlier.docId
              ? `Later source: ${docB?.title ?? 'document'} (${later.occurredAt}) — \"${later.quote}\".`
              : `Later source: ${docB?.title ?? 'document'} (${later.occurredAt}) — \"${later.quote}\".`,
            `The cross-document uncertainty is named against ${entity.label} itself — one of the two documents states the patient is unsure which dose is correct.`,
          ].filter(Boolean).join('\n'),
          entityKey: entity.key,
          facts: [earlier, later],
          question: `Which ${entity.label} dose is currently correct, and why do the two records disagree?`,
          notConcluded:
            'The engine does not decide which dose is correct. Both documented doses are shown with their dates, sources and the uncertainty stated in the record.',
          satisfiableBy: `A clarifying ${entity.label.toLowerCase()} reconciliation after ${later.occurredAt}.`,
        });
      }
    }
  }

  return out;
}

/** R9 — the same medication at two doses on the same date. */
function doseConflicts(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  for (const entity of graph.entities) {
    if (entity.kind !== 'medication') continue;
    const facts = entity.factIds.map((id) => factMap.get(id)).filter((f): f is Fact => Boolean(f));
    const byDate = new Map<string, Fact[]>();
    for (const fact of facts) {
      if (fact.attrs.dose === 'not stated' || fact.attrs.dose === undefined) continue;
      const list = byDate.get(fact.occurredAt);
      if (list) list.push(fact);
      else byDate.set(fact.occurredAt, [fact]);
    }
    for (const [date, group] of byDate) {
      // Only entries documented as active can conflict about the active dose.
      // An entry listed under DISCONTINUED (or otherwise not active) is the
      // historical record, not a competing same-day claim — and its row usually
      // names an explicit earlier event date, not the reconciling document date.
      const active = group.filter((f) => f.status === 'active');
      const doses = new Set(active.map((f) => `${f.attrs.dose}${f.attrs.doseUnit}`));
      if (doses.size < 2) continue;
      out.push({
        kind: 'dose_conflict',
        severity: 'medium',
        title: `${entity.label} has two different active doses documented on ${date}`,
        detail: [
          `Two active listings give different strengths for ${entity.label} on the same date.`,
          ...active.map((f) => `• ${f.attrs.dose} ${f.attrs.doseUnit} — ${cite(f, graph)}`),
        ].join('\n'),
        entityKey: entity.key,
        facts: active,
        question: `What is the correct current dose of ${entity.label}?`,
        notConcluded:
          'A dose change can legitimately be documented twice in one day. The engine reports the disagreement only.',
        satisfiableBy: `A single clarifying ${entity.label.toLowerCase()} statement for ${date}.`,
      });
    }
  }
  return out;
}

/**
 * R10 — likely documentation gaps.
 *
 * Two patterns are worth surfacing: a medication that is still marked active but
 * has not been documented for a long time, and an active condition whose usual
 * monitoring measurements never appear anywhere in the record.
 */
function documentationGaps(graph: HealthGraph): Draft[] {
  const out: Draft[] = [];
  const factMap = getFactMap(graph);
  const latestDocumentDate = graph.stats.spanEnd;

  for (const entity of graph.entities) {
    if (entity.kind === 'medication') {
      const facts = entity.factIds.map((id) => factMap.get(id)).filter((f): f is Fact => Boolean(f));
      const active = facts.filter((f) => f.status === 'active');
      if (active.length === 0) continue;
      const lastActive = active[active.length - 1];
      const silence = daysBetween(lastActive.occurredAt, latestDocumentDate);
      if (silence < 540) continue;
      out.push({
        kind: 'documentation_gap',
        severity: 'low',
        title: `${entity.label} is still marked active but last appears ${Math.round(silence / 30)} months ago`,
        detail: [
          `${entity.label} was last documented as active on ${lastActive.occurredAt}, and no later document mentions it.`,
          `• ${cite(lastActive, graph)}`,
        ].join('\n'),
        entityKey: entity.key,
        facts: [lastActive],
        question: `Is ${entity.label} still being taken, and if so why is it absent from later records?`,
        notConcluded:
          'Silence in a document is not a clinical event. The engine flags the gap in documentation, nothing more.',
      });
    }
  }
  return out;
}

/**
 * The Contradiction Engine.
 *
 * Every rule produces the same shape: the conflicting statements, their sources,
 * the single question that would resolve it, and an explicit statement of what
 * the engine refuses to conclude. That last field is the difference between a
 * medical debugger and a chatbot.
 */
export function findContradictions(graph: HealthGraph): Contradiction[] {
  const drafts: Draft[] = [
    ...medicationStatusConflicts(graph),
    ...allergyMedicationConflicts(graph),
    ...measurementValueConflicts(graph),
    ...demographicConflicts(graph),
    ...conditionResolutionConflicts(graph),
    ...doseConflicts(graph),
    ...duplicateConflictingDetails(graph),
    ...documentationGaps(graph),
    ...crossRecordDoseDiscrepancy(graph),
  ];

  const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return drafts
    .map((draft, index) => {
      const dates = draft.facts.map((f) => f.occurredAt).sort();
      return {
        id: `con_${draft.kind}_${index}`,
        kind: draft.kind,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
        entityKey: draft.entityKey,
        factIds: draft.facts.map((f) => f.id),
        docIds: Array.from(new Set(draft.facts.map((f) => f.docId))),
        window: { start: dates[0], end: dates[dates.length - 1] },
        questionForClinician: draft.question,
        notConcluded: draft.notConcluded,
      };
    })
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.window.end.localeCompare(a.window.end),
    );
}

export function contradictionSummary(contradictions: Contradiction[]): Record<Severity, number> {
  return {
    high: contradictions.filter((c) => c.severity === 'high').length,
    medium: contradictions.filter((c) => c.severity === 'medium').length,
    low: contradictions.filter((c) => c.severity === 'low').length,
  };
}

export function contradictionTitle(kind: ContradictionKind): string {
  return kind.replace(/_/g, ' ');
}

