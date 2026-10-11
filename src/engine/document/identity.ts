import { sha256 } from '../hash';

/* ------------------------------------------------------------------ */
/* Document identity                                                   */
/*                                                                    */
/* A deterministic identity layer for answering one question precisely: */
/* are two records the same record, versions of the same record, or      */
/* genuinely different records?                                          */
/*                                                                    */
/* The rule this module exists to enforce:                              */
/*                                                                    */
/*     Normalization must never erase medically meaningful content.     */
/*                                                                    */
/* `normalizeContent` touches only line endings, whitespace and Unicode  */
/* form. It never touches numbers, units, dates, doses, medication names,*/
/* negations, or section headings — so two medically different documents */
/* can never collapse to the same normalized hash.                       */
/* ------------------------------------------------------------------ */

/** A minimal document shape: anything with identity-relevant metadata and text. */
export interface DocumentShape {
  title: string;
  kind: string;
  date: string;
  facility?: string;
  text: string;
}

export interface DocumentIdentity {
  contentHash: string;
  normalizedHash: string;
  structuralHash: string;
  metadataFingerprint: string;
}

export type DuplicateType = 'exact' | 'normalized' | 'likely-same' | 'related' | 'distinct';

export interface DuplicateAssessment {
  type: DuplicateType;
  /** 0..1, deterministic. */
  score: number;
  reasons: string[];
  matchingFields: string[];
  differingFields: string[];
}

const MATCHABLE_FIELDS: Array<keyof Pick<DocumentShape, 'title' | 'kind' | 'date' | 'facility'>> = [
  'title',
  'kind',
  'date',
  'facility',
];

/**
 * Normalize for identity comparison only.
 *
 * Touches whitespace, line endings and Unicode form. Deliberately does NOT
 * touch anything medically meaningful: numbers, units, dates, doses, names,
 * negations and headings all survive byte-for-byte.
 */
export function normalizeContent(text: string): string {
  const unicodeNormalized = text.normalize('NFC');
  const lines = unicodeNormalized.split(/\r\n|\r|\n/);
  const out: string[] = [];
  for (const rawLine of lines) {
    // Collapse runs of horizontal whitespace to a single space; trim the line.
    const line = rawLine.replace(/[ \t]+/g, ' ').trim();
    out.push(line);
  }
  // Drop leading/trailing blank lines and collapse runs of blank lines to one.
  const trimmed = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return trimmed;
}

/**
 * A structural skeleton that ignores digit *values* but keeps words and shape.
 *
 * "LDL 132 mg/dL" and "LDL 128 mg/dL" share a skeleton ("ldl ### mg/dl"), but
 * "LDL 132" vs "HDL 46" do not. This is how a value change stays "likely the
 * same record" while a genuinely different panel does not.
 */
export function structuralShape(text: string): string {
  return normalizeContent(text)
    .split('\n')
    .map((line) =>
      line
        .toLowerCase()
        .replace(/[0-9]+/g, '#')
        .replace(/[^a-z0-9#]+/g, ' ')
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join('\n');
}

export function contentHash(text: string): string {
  return sha256(text);
}

export function normalizedHash(text: string): string {
  return sha256(normalizeContent(text));
}

export function structuralHash(text: string): string {
  return sha256(structuralShape(text));
}

export function metadataFingerprint(doc: DocumentShape): string {
  return sha256([doc.kind, doc.date, doc.facility ?? '', doc.title].join('|'));
}

export function documentIdentity(doc: DocumentShape): DocumentIdentity {
  return {
    contentHash: contentHash(doc.text),
    normalizedHash: normalizedHash(doc.text),
    structuralHash: structuralHash(doc.text),
    metadataFingerprint: metadataFingerprint(doc),
  };
}


/**
 * Classify the relationship between two documents, with the evidence laid out
 * rather than reduced to a single fuzzy score.
 *
 * "Exact" means the same record: identical content AND identical identifying
 * fields. Identical text dated differently is not "the same record" — it is
 * reported as related, with the differing fields named.
 */
export function assessDuplicate(a: DocumentShape, b: DocumentShape): DuplicateAssessment {
  const idA = documentIdentity(a);
  const idB = documentIdentity(b);

  const matchingFields = MATCHABLE_FIELDS.filter((field) => a[field] === b[field]);
  const differingFields = MATCHABLE_FIELDS.filter((field) => a[field] !== b[field]);

  const contentExact = idA.contentHash === idB.contentHash;
  const contentNormalized = idA.normalizedHash === idB.normalizedHash;
  const metadataMatch = idA.metadataFingerprint === idB.metadataFingerprint;
  const structuralMatch = idA.structuralHash === idB.structuralHash;

  if (contentExact && metadataMatch) {
    return {
      type: 'exact',
      score: 1,
      reasons: ['The content is byte-for-byte identical and the identifying fields match.'],
      matchingFields,
      differingFields,
    };
  }

  if (contentExact) {
    return {
      type: 'related',
      score: 0.7,
      reasons: [
        'The content is identical, but the identifying fields differ.',
        ...differingFields.map((field) => `${field} differs`),
      ],
      matchingFields,
      differingFields,
    };
  }

  if (contentNormalized && metadataMatch) {
    return {
      type: 'normalized',
      score: 0.99,
      reasons: ['The content differs only in whitespace, line endings, or formatting.'],
      matchingFields,
      differingFields,
    };
  }

  if (metadataMatch && structuralMatch) {
    return {
      type: 'likely-same',
      score: 0.9,
      reasons: [
        'The document type, date, facility and title match.',
        'The structure is identical, but some values differ.',
      ],
      matchingFields,
      differingFields,
    };
  }

  const sameKindFacility = a.kind === b.kind && (a.facility ?? '') === (b.facility ?? '');
  if (sameKindFacility) {
    return {
      type: 'related',
      score: 0.7,
      reasons: [
        'The document type and facility match.',
        'The content or identifying fields differ, so these are related rather than identical.',
      ],
      matchingFields,
      differingFields,
    };
  }

  return {
    type: 'distinct',
    score: 0,
    reasons: ['The documents differ in content and in at least one identifying field.'],
    matchingFields,
    differingFields,
  };
}

export const DUPLICATE_TYPE_LABEL: Record<DuplicateType, string> = {
  exact: 'Duplicate',
  normalized: 'Duplicate',
  'likely-same': 'Likely duplicate',
  related: 'Related record',
  distinct: 'Distinct',
};

/** A fact-level diff between two documents, for the comparison view. */
export interface FactDiff {
  same: number;
  added: number;
  removed: number;
  changed: number;
}

export interface ComparableFact {
  entityKey: string;
  valueNum?: number;
  valueText?: string;
  unit?: string;
  status?: string;
}

function factSignature(fact: ComparableFact): string {
  return [fact.entityKey, fact.status ?? ''].join('|');
}

/**
 * Compare the facts of two documents by entity key. A key present in both but
 * with a different value is "changed"; present in only one is added/removed.
 */
export function compareFacts(a: ComparableFact[], b: ComparableFact[]): FactDiff {
  const aKeys = new Set(a.map(factSignature));
  const bKeys = new Set(b.map(factSignature));

  let same = 0;
  let changed = 0;
  const added = b.filter((fact) => !aKeys.has(factSignature(fact))).length;
  const removed = a.filter((fact) => !bKeys.has(factSignature(fact))).length;

  const shared = new Set([...aKeys].filter((key) => bKeys.has(key)));
  for (const key of shared) {
    const aValues = a
      .filter((f) => factSignature(f) === key)
      .map((f) => `${f.valueNum ?? ''}|${f.valueText ?? ''}|${f.unit ?? ''}`)
      .sort()
      .join(',');
    const bValues = b
      .filter((f) => factSignature(f) === key)
      .map((f) => `${f.valueNum ?? ''}|${f.valueText ?? ''}|${f.unit ?? ''}`)
      .sort()
      .join(',');
    if (aValues === bValues) {
      same += a.filter((f) => factSignature(f) === key).length;
    } else {
      changed += Math.max(
        a.filter((f) => factSignature(f) === key).length,
        b.filter((f) => factSignature(f) === key).length,
      );
    }
  }

  return { same, added, removed, changed };
}

/** A fact present in both documents whose value, unit, or status changed. */
export interface ChangedFact {
  entityKey: string;
  label: string;
  oldValue?: number;
  oldText?: string;
  oldUnit?: string;
  newValue?: number;
  newText?: string;
  newUnit?: string;
}

/**
 * The concrete "old → new" pairs behind `compareFacts`'s `changed` count.
 * Two facts match when they share an entity key but assert different values.
 */
export function changedFacts(a: ComparableFact[], b: ComparableFact[]): ChangedFact[] {
  const byKey = new Map<string, { old: ComparableFact[]; next: ComparableFact[] }>();
  for (const fact of a) {
    if (!byKey.has(fact.entityKey)) byKey.set(fact.entityKey, { old: [], next: [] });
    byKey.get(fact.entityKey)!.old.push(fact);
  }
  for (const fact of b) {
    if (!byKey.has(fact.entityKey)) byKey.set(fact.entityKey, { old: [], next: [] });
    byKey.get(fact.entityKey)!.next.push(fact);
  }

  const changed: ChangedFact[] = [];
  for (const [key, group] of byKey) {
    if (group.old.length === 0 || group.next.length === 0) continue;
    const o = group.old[0];
    const n = group.next[0];
    const sameValue =
      o.valueNum === n.valueNum && o.valueText === n.valueText && o.unit === n.unit && o.status === n.status;
    if (sameValue) continue;
    changed.push({
      entityKey: key,
      label: (o as { label?: string }).label ?? key,
      oldValue: o.valueNum,
      oldText: o.valueText,
      oldUnit: o.unit,
      newValue: n.valueNum,
      newText: n.valueText,
      newUnit: n.unit,
    });
  }
  return changed;
}

