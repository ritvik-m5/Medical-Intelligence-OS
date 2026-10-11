import type { Derivation } from '../derive/types';
import { DOC_KIND_LABEL, FACT_TYPE_LABEL, type Fact, type FactType, type HealthGraph, type ISODate } from '../types';
import { factsForDocument } from '../access';

/* ------------------------------------------------------------------ */
/* Document summary                                                    */
/*                                                                    */
/* Turns one uploaded document into a plain-language account of what it */
/* contains — assembled entirely from the facts the engine already       */
/* extracted. Nothing here invents a claim: the vocabulary is the set of */
/* facts for that document, and every sentence is a count or a quoted     */
/* label the extractor actually produced.                                */
/*                                                                    */
/* This is the "every uploaded record must become understandable" rule,  */
/* stated in code. It is deterministic and needs no model.               */
/* ------------------------------------------------------------------ */

export type DocumentStatus = 'verified' | 'verified-with-flags' | 'needs-review';

export interface DocumentSummary {
  docId: string;
  title: string;
  kind: string;
  date: ISODate;
  facility?: string;
  factCount: number;
  /** Counts per fact type, only the types actually present. */
  byType: Record<string, number>;
  measurements: Fact[];
  medications: Fact[];
  conditions: Fact[];
  allergies: Fact[];
  flagged: Fact[];
  findings: Derivation[];
  intervalCount: number;
  plainLanguage: string;
  limitations: string[];
  status: DocumentStatus;
}

const valueText = (fact: Fact): string => {
  const parts: string[] = [fact.label];
  if (fact.valueNum !== undefined) {
    parts.push(`${fact.valueNum}${fact.unit ? ` ${fact.unit}` : ''}`);
  } else if (fact.valueText) {
    parts.push(fact.valueText);
  }
  return parts.join(' ');
};

/** Unique labels, preserving first-seen order. */
function uniqueLabels(facts: Fact[]): string[] {
  return Array.from(new Set(facts.map((fact) => fact.label)));
}

export function summarizeDocument(
  graph: HealthGraph,
  docId: string,
  derivations: Derivation[],
): DocumentSummary {
  const document = graph.documents.find((doc) => doc.id === docId);
  const facts = factsForDocument(graph, docId);

  const byType: Record<string, number> = {};
  for (const fact of facts) byType[fact.type] = (byType[fact.type] ?? 0) + 1;

  const of = (type: FactType) => facts.filter((fact) => fact.type === type);
  const measurements = of('measurement').filter((fact) => fact.valueNum !== undefined);
  const medications = of('medication');
  const conditions = of('condition');
  const allergies = of('allergy');
  const flagged = facts.filter((fact) => fact.flags.length > 0);

  const findings = derivations.filter((derivation) => derivation.docIds.includes(docId));

  // Every medication or condition in this document seeds an interval.
  const intervalCount = new Set(
    [...medications, ...conditions].map((fact) => fact.entityKey),
  ).size;

  const sentences: string[] = [];
  const kindLabel = document ? DOC_KIND_LABEL[document.kind] : 'document';
  const where = document?.facility ? ` from ${document.facility}` : '';
  sentences.push(
    `This ${kindLabel.toLowerCase()}${where} documents ${facts.length} fact${facts.length === 1 ? '' : 's'}.`,
  );

  if (measurements.length > 0) {
    const shown = measurements.slice(0, 4).map(valueText);
    sentences.push(
      `It records ${measurements.length} measurement${measurements.length === 1 ? '' : 's'}, including ${shown.join(', ')}${measurements.length > 4 ? ', and more' : ''}.`,
    );
  }
  if (medications.length > 0) {
    sentences.push(
      `It documents ${medications.length} medication${medications.length === 1 ? '' : 's'}: ${uniqueLabels(medications).slice(0, 6).join(', ')}.`,
    );
  }
  if (conditions.length > 0) {
    sentences.push(
      `It documents ${conditions.length} condition${conditions.length === 1 ? '' : 's'}: ${uniqueLabels(conditions).slice(0, 6).join(', ')}.`,
    );
  }
  if (allergies.length > 0) {
    sentences.push(
      `It records ${allergies.length} allerg${allergies.length === 1 ? 'y' : 'ies'}: ${uniqueLabels(allergies).join(', ')}.`,
    );
  }

  const limitations: string[] = [];
  if (measurements.length === 0) limitations.push('It records no measurements.');
  if (medications.length === 0) limitations.push('It documents no medications.');
  if (conditions.length === 0) limitations.push('It documents no conditions.');
  if (flagged.length > 0) {
    limitations.push(`${flagged.length} value${flagged.length === 1 ? ' was' : 's were'} flagged for review and not silently corrected.`);
  }
  limitations.push(
    'This is one document. It alone does not establish a timeline, a diagnosis, or a treatment plan.',
  );

  const status: DocumentStatus =
    facts.length === 0
      ? 'needs-review'
      : flagged.length > 0
        ? 'verified-with-flags'
        : 'verified';

  return {
    docId,
    title: document?.title ?? docId,
    kind: document?.kind ?? 'visit_note',
    date: document?.date ?? '',
    facility: document?.facility,
    factCount: facts.length,
    byType,
    measurements,
    medications,
    conditions,
    allergies,
    flagged,
    findings,
    intervalCount,
    plainLanguage: sentences.join(' '),
    limitations,
    status,
  };
}

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  verified: 'Verified',
  'verified-with-flags': 'Verified with flags',
  'needs-review': 'Needs review',
};

export function documentImpact(summary: DocumentSummary): string {
  return `${summary.factCount} facts · ${summary.intervalCount} intervals · ${summary.findings.length} findings`;
}

export { FACT_TYPE_LABEL };

