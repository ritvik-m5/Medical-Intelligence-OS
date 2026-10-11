/**
 * Medical Memory — core data model.
 *
 * The whole product rests on one idea: every derived statement must be traceable
 * back to a character range inside a real source document. Nothing in this file is
 * allowed to exist without provenance.
 *
 * The graph is deliberately layered:
 *   Documents → Facts (provenanced assertions) → Entities (resolved concepts)
 * and the entity layer is what the rest of the system (timeline, contradiction
 * detection, change detection, query planner) reasons over.
 */

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // 'YYYY-MM-DDTHH:mm'

export type DocKind =
  | 'lab_report'
  | 'visit_note'
  | 'medication_list'
  | 'imaging_report'
  | 'discharge_summary'
  | 'vaccination_record'
  | 'wearable_summary'
  | 'questionnaire'
  | 'procedure_note'
  | 'allergy_record'
  | 'pathology_report';

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  lab_report: 'Lab report',
  visit_note: 'Visit note',
  medication_list: 'Medication list',
  imaging_report: 'Imaging report',
  discharge_summary: 'Discharge summary',
  vaccination_record: 'Vaccination record',
  wearable_summary: 'Wearable summary',
  questionnaire: 'Questionnaire',
  procedure_note: 'Procedure note',
  allergy_record: 'Allergy record',
  pathology_report: 'Pathology report',
};

export type FactType =
  | 'measurement'
  | 'medication'
  | 'condition'
  | 'procedure'
  | 'allergy'
  | 'immunization'
  | 'vital'
  | 'encounter'
  | 'symptom'
  | 'social'
  | 'demographic';

export const FACT_TYPE_LABEL: Record<FactType, string> = {
  measurement: 'Measurement',
  medication: 'Medication',
  condition: 'Condition',
  procedure: 'Procedure',
  allergy: 'Allergy',
  immunization: 'Immunization',
  vital: 'Vital sign',
  encounter: 'Encounter',
  symptom: 'Symptom',
  social: 'Social / lifestyle',
  demographic: 'Demographic',
};

export type FactStatus =
  | 'active'
  | 'discontinued'
  | 'completed'
  | 'historical'
  | 'resolved'
  | 'ordered'
  | 'scheduled'
  | 'unknown';

export const STATUS_LABEL: Record<FactStatus, string> = {
  active: 'Active',
  discontinued: 'Discontinued',
  completed: 'Completed',
  historical: 'Historical',
  resolved: 'Resolved',
  ordered: 'Ordered',
  scheduled: 'Scheduled',
  unknown: 'Unstated',
};

/** Non-fatal problems the extractor noticed while reading a fact. */
export type FactFlag =
  | 'outside_reference_range'
  | 'critical_value'
  | 'unit_inferred'
  | 'unit_unusual'
  | 'implausible_value'
  | 'ambiguous_status'
  | 'ambiguous_text'
  | 'negative_finding'
  | 'historical_context'
  | 'low_ocr_quality'
  | 'section_derived_status'
  | 'unresolved_entity';

export const FLAG_LABEL: Record<FactFlag, string> = {
  outside_reference_range: 'Outside reference range',
  critical_value: 'Critical / panic value',
  unit_inferred: 'Unit inferred',
  unit_unusual: 'Unusual unit',
  implausible_value: 'Implausible value',
  ambiguous_status: 'Ambiguous status',
  ambiguous_text: 'Ambiguous wording',
  negative_finding: 'Stated as absent',
  historical_context: 'Historical context',
  low_ocr_quality: 'Low text quality',
  section_derived_status: 'Status from section heading',
  unresolved_entity: 'Entity not resolved',
};

export type SectionKind =
  | 'header'
  | 'current_medications'
  | 'discontinued_medications'
  | 'medication_history'
  | 'allergies'
  | 'problem_list'
  | 'assessment'
  | 'plan'
  | 'results'
  | 'history'
  | 'impression'
  | 'vitals'
  | 'immunizations'
  | 'procedures'
  | 'social_history'
  | 'family_history'
  | 'instructions'
  | 'unknown';

export interface DocSection {
  id: string;
  kind: SectionKind;
  heading: string;
  span: [number, number];
}

/** A raw uploaded document. `text` is immutable — all provenance points here. */
export interface SourceDocument {
  id: string;
  title: string;
  kind: DocKind;
  /** Authoritative clinical date of the document. */
  date: ISODate;
  periodStart?: ISODate;
  periodEnd?: ISODate;
  facility?: string;
  author?: string;
  /** Provenance for the document itself: how did it get into the system? */
  origin: 'import' | 'paste' | 'upload' | 'sample';
  ingestedAt: ISODateTime;
  mimeType?: string;
  fileName?: string;
  text: string;
  sections: DocSection[];
  /** Overall extraction quality signal for this document. */
  quality: number;
}

export interface ConceptCode {
  system: 'LOINC' | 'RxNorm' | 'SNOMED' | 'ICD-10' | 'CVX' | 'LOCAL';
  code: string;
  display?: string;
}

export interface ReferenceRange {
  low?: number;
  high?: number;
  text?: string;
}

/** One assertion, traceable to one character range of one document. */
export interface Fact {
  id: string;
  type: FactType;
  /** Normalized key, e.g. `measurement:ldl-cholesterol`, `medication:atorvastatin`. */
  entityKey: string;
  /** Raw surface form as written in the document. */
  label: string;
  codes?: ConceptCode[];

  valueNum?: number;
  valueText?: string;
  unit?: string;
  comparator?: '<' | '>' | '<=' | '>=';
  referenceRange?: ReferenceRange;

  status: FactStatus;
  occurredAt: ISODate;
  periodEnd?: ISODate;

  docId: string;
  docKind: DocKind;
  sectionId?: string;
  sectionKind: SectionKind;

  /** Character offsets into `SourceDocument.text`. */
  span: [number, number];
  /** The exact substring the fact was read from. Never paraphrased. */
  quote: string;

  extractor: string;
  confidence: number;
  flags: FactFlag[];
  attrs: Record<string, string | number | boolean>;
}

export type EntityKind =
  | 'person'
  | 'measurement'
  | 'medication'
  | 'condition'
  | 'procedure'
  | 'allergy'
  | 'immunization'
  | 'vital'
  | 'encounter'
  | 'symptom'
  | 'social'
  | 'demographic'
  | 'provider'
  | 'facility';

export interface Entity {
  id: string;
  key: string;
  kind: EntityKind;
  label: string;
  aliases: string[];
  /** Panel / drug class / body system. Used by the graph layout + query planner. */
  category?: string;
  codes?: ConceptCode[];
  factIds: string[];
  docIds: string[];
  firstSeen: ISODate;
  lastSeen: ISODate;
  factCount: number;
  confidence: number;
}

export type EdgeKind =
  | 'about'
  | 'from_document'
  | 'document_of'
  | 'co_occurs'
  | 'monitors'
  | 'treats'
  | 'class_of'
  | 'contradicts'
  | 'changed_from';

export interface Edge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  weight: number;
  /** Fact ids that justify this edge. */
  evidence: string[];
  /** True when the edge was inferred by the engine rather than stated. */
  inferred: boolean;
}

export interface Patient {
  id: string;
  name: string;
  dateOfBirth?: ISODate;
  sex?: string;
  synthetic: boolean;
}

export interface GraphStats {
  documents: number;
  facts: number;
  entities: number;
  edges: number;
  spanStart: ISODate;
  spanEnd: ISODate;
  meanConfidence: number;
  factsByType: Record<string, number>;
  flaggedFacts: number;
}

export interface HealthGraph {
  patient: Patient;
  documents: SourceDocument[];
  facts: Fact[];
  entities: Entity[];
  edges: Edge[];
  stats: GraphStats;
  /** entityKey → entity id */
  entityKeyIndex: Record<string, string>;
  /** docId → fact ids, in document order */
  factsByDocument: Record<string, string[]>;
  /** entityKey → fact ids, chronological */
  factsByEntity: Record<string, string[]>;
  builtAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Derived, read-only views produced by the temporal layer             */
/* ------------------------------------------------------------------ */

export interface EntityState {
  entityKey: string;
  entityId: string;
  kind: EntityKind;
  label: string;
  status: FactStatus;
  since: ISODate;
  lastDocumented: ISODate;
  factIds: string[];
  docIds: string[];
  confidence: number;
  /** Human-readable trail of how the status was reached. */
  statusTrail: Array<{ date: ISODate; status: FactStatus; docId: string; factId: string }>;
  /** For medications: the most recent documented dose, e.g. "20 mg once daily". */
  latestDose?: string;
  category?: string;
}

export interface MeasurementState {
  entityKey: string;
  entityId: string;
  label: string;
  unit?: string;
  latest: Fact;
  first: Fact;
  readings: number;
  /** % change between first and latest. */
  changePct: number | null;
  trend: 'up' | 'down' | 'flat' | 'insufficient';
  referenceRange?: ReferenceRange;
  inRange: boolean | null;
}

export interface Snapshot {
  asOf: ISODate;
  facts: Fact[];
  conditions: EntityState[];
  medications: EntityState[];
  allergies: EntityState[];
  immunizations: EntityState[];
  procedures: EntityState[];
  measurements: MeasurementState[];
  documents: SourceDocument[];
  totals: {
    documents: number;
    facts: number;
    entities: number;
    conditions: number;
    medications: number;
    measurements: number;
    procedures: number;
  };
}

export type ChangeKind =
  | 'added'
  | 'removed'
  | 'status_changed'
  | 'value_changed'
  | 'reappeared'
  | 'new_document';

export interface ChangeEvent {
  id: string;
  kind: ChangeKind;
  factType: FactType;
  entityKey: string;
  entityLabel: string;
  fromDate: ISODate;
  toDate: ISODate;
  fromFactId?: string;
  toFactId?: string;
  fromValue?: string;
  toValue?: string;
  deltaText: string;
  confidence: number;
  /** What the documents do *not* say. This is the honest part. */
  caveat: string;
  docIds: string[];
}


export type ContradictionKind =
  | 'medication_status_conflict'
  | 'medication_listed_after_stop'
  | 'measurement_value_conflict'
  | 'medication_allergy_conflict'
  | 'condition_resolution_conflict'
  | 'demographic_conflict'
  | 'implausible_measurement'
  | 'quality_flag'
  | 'duplicate_conflicting_detail'
  | 'dose_conflict'
  | 'cross_record_dose_discrepancy'
  | 'documentation_gap';

export const CONTRADICTION_LABEL: Record<ContradictionKind, string> = {
  medication_status_conflict: 'Medication status conflict',
  medication_listed_after_stop: 'Medication listed after documented stop',
  measurement_value_conflict: 'Conflicting values for the same measurement',
  medication_allergy_conflict: 'Active medication vs recorded allergy',
  condition_resolution_conflict: 'Condition resolved then re-documented',
  demographic_conflict: 'Conflicting demographic detail',
  implausible_measurement: 'Implausible or unit-suspect measurement',
  quality_flag: 'Data-quality flag',
  duplicate_conflicting_detail: 'Same event, conflicting details',
  dose_conflict: 'Conflicting dose on the same date',
  cross_record_dose_discrepancy: 'Cross-record dose discrepancy',
  documentation_gap: 'Likely documentation gap',
};

export type Severity = 'high' | 'medium' | 'low';

export interface Contradiction {
  id: string;
  kind: ContradictionKind;
  severity: Severity;
  title: string;
  detail: string;
  entityKey?: string;
  factIds: string[];
  docIds: string[];
  window: { start: ISODate; end: ISODate };
  /** The single most useful thing a human could ask to resolve this. */
  questionForClinician: string;
  /** What the engine refuses to conclude. */
  notConcluded: string;
}

/* ------------------------------------------------------------------ */
/* External evidence (deliberately separated from the personal graph)  */
/* ------------------------------------------------------------------ */

export type EvidenceSource =
  | 'FDA label search'
  | 'MedlinePlus (NIH)'
  | 'NIH / NCBI'
  | 'CDC'
  | 'USPSTF'
  | 'ClinicalTrials.gov'
  | 'Professional guideline';

export interface ExternalEvidence {
  id: string;
  title: string;
  source: EvidenceSource;
  url: string;
  summary: string;
  /** Entity keys this evidence is relevant to. */
  topics: string[];
  kind: 'drug' | 'lab' | 'condition' | 'guideline' | 'trial';
  retrieved: ISODate;
}


/* ------------------------------------------------------------------ */
/* Query / answer layer                                                */
/* ------------------------------------------------------------------ */

export type QueryIntent =
  | 'summary'
  | 'entity_profile'
  | 'timeline'
  | 'trend'
  | 'change'
  | 'conflict'
  | 'medication_review'
  | 'lab_explanation'
  | 'external_education'
  | 'coverage'
  | 'unknown';

export type AnswerBlockKind =
  | 'text'
  | 'metric'
  | 'list'
  | 'timeline'
  | 'table'
  | 'warning'
  | 'chart'
  | 'evidence'
  | 'provenance';

export interface AnswerBlock {
  id: string;
  kind: AnswerBlockKind;
  title?: string;
  text?: string;
  items?: Array<{ label: string; value?: string; sub?: string; tone?: string; factId?: string }>;
  metrics?: Array<{ label: string; value: string; sub?: string; tone?: string }>;
  columns?: string[];
  rows?: string[][];
  factIds?: string[];
  docIds?: string[];
  entityKeys?: string[];
  evidenceIds?: string[];
}

export interface Citation {
  id: string;
  label: string;
  docId: string;
  docTitle: string;
  docDate: ISODate;
  docKind: DocKind;
  span: [number, number];
  quote: string;
  factId?: string;
  confidence: number;
}

export interface Answer {
  id: string;
  question: string;
  intent: QueryIntent;
  /** How the engine planned to answer. Shown in the UI. Not hidden. */
  plan: string[];
  blocks: AnswerBlock[];
  citations: Citation[];
  /** Explicit boundary between the user's own records and outside knowledge. */
  separation: {
    personalFacts: number;
    externalEvidence: number;
    note: string;
  };
  coverage: {
    documentsSearched: number;
    dateRange: [ISODate, ISODate] | null;
    entitiesMatched: string[];
  };
  confidence: number;
  limitations: string[];
  generatedAt: ISODateTime;
}

