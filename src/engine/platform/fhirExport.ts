import type { Fact, SourceDocument } from '../types';
import { codesFor } from './codes';

/* ------------------------------------------------------------------ */
/* FHIR R4 export                                                      */
/*                                                                    */
/* Every resource carries a provenance extension naming the source      */
/* document and the character span the value was read from. That is the */
/* difference between an export that can be audited and one that cannot */
/* — and it is why something downstream can trust this export.          */
/* ------------------------------------------------------------------ */

export const PROVENANCE_URL = 'http://medical-memory.local/StructureDefinition/source-span';
export const CONFIDENCE_URL = 'http://medical-memory.local/StructureDefinition/extraction-confidence';
export const QUOTE_URL = 'http://medical-memory.local/StructureDefinition/source-quote';
export const FLAG_URL = 'http://medical-memory.local/StructureDefinition/extraction-flag';

export interface FhirExtension {
  url: string;
  valueString?: string;
  valueInteger?: number;
  valueDecimal?: number;
}

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}

export interface FhirBundle {
  resourceType: 'Bundle';
  id: string;
  type: 'collection';
  timestamp: string;
  total: number;
  entry: Array<{ fullUrl: string; resource: FhirResource }>;
  meta: { extension: FhirExtension[] };
}

const SYSTEM_URI: Record<string, string> = {
  LOINC: 'http://loinc.org',
  RxNorm: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  SNOMED: 'http://snomed.info/sct',
  'ICD-10': 'http://hl7.org/fhir/sid/icd-10-cm',
  CVX: 'http://hl7.org/fhir/sid/cvx',
  LOCAL: 'http://medical-memory.local/CodeSystem/local',
};

export const UCUM = 'http://unitsofmeasure.org';

export function codingFor(
  entityKey: string,
  fallbackText: string,
): { text: string; coding?: FhirCoding[] } {
  const codes = codesFor(entityKey);
  if (codes.length === 0) return { text: fallbackText };
  return {
    text: fallbackText,
    coding: codes.map((code) => ({
      system: SYSTEM_URI[code.system] ?? SYSTEM_URI.LOCAL,
      code: code.code,
      display: code.display ?? fallbackText,
    })),
  };
}

export function provenanceExtensions(fact: Fact, doc: SourceDocument | undefined): FhirExtension[] {
  const extensions: FhirExtension[] = [
    {
      url: PROVENANCE_URL,
      valueString: `document=${doc?.title ?? 'unknown'}; date=${doc?.date ?? fact.occurredAt}; kind=${fact.docKind}; span=[${fact.span[0]},${fact.span[1]}]; extractor=${fact.extractor}; section=${fact.sectionKind}`,
    },
    { url: CONFIDENCE_URL, valueDecimal: fact.confidence },
    { url: QUOTE_URL, valueString: fact.quote },
  ];
  if (fact.flags.length > 0) {
    extensions.push({ url: FLAG_URL, valueString: fact.flags.join('|') });
  }
  return extensions;
}

const INTERPRETATION: Record<string, { code: string; display: string }> = {
  outside_reference_range: { code: 'A', display: 'Abnormal' },
  critical_value: { code: 'AA', display: 'Critical abnormal' },
};

const OBSERVATION_STATUS: Record<string, string> = {
  active: 'final',
  completed: 'final',
  historical: 'final',
  unknown: 'final',
  ordered: 'registered',
  scheduled: 'registered',
  discontinued: 'cancelled',
  resolved: 'final',
};

export { INTERPRETATION, OBSERVATION_STATUS };
