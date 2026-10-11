import type { Fact, HealthGraph, SourceDocument } from '../types';
import {
  INTERPRETATION,
  OBSERVATION_STATUS,
  UCUM,
  codingFor,
  provenanceExtensions,
  type FhirResource,
} from './fhirExport';

export function observationFor(
  fact: Fact,
  doc: SourceDocument | undefined,
  graph: HealthGraph,
): FhirResource {
  const interpretation = fact.flags.find((flag) => INTERPRETATION[flag]);
  return {
    resourceType: 'Observation',
    id: fact.id,
    status: OBSERVATION_STATUS[fact.status] ?? 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: fact.type === 'vital' ? 'vital-signs' : 'laboratory',
            display: fact.type === 'vital' ? 'Vital Signs' : 'Laboratory',
          },
        ],
      },
    ],
    code: codingFor(fact.entityKey, fact.label),
    subject: { reference: `Patient/${graph.patient.id}` },
    effectiveDateTime: fact.occurredAt,
    issued: doc ? `${doc.date}T09:00:00Z` : undefined,
    valueQuantity:
      fact.valueNum !== undefined
        ? { value: fact.valueNum, unit: fact.unit, system: UCUM, code: fact.unit }
        : undefined,
    valueString:
      fact.valueNum === undefined
        ? String(fact.attrs.valueText ?? fact.valueText ?? fact.status)
        : undefined,
    interpretation: interpretation
      ? [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                code: INTERPRETATION[interpretation].code,
                display: INTERPRETATION[interpretation].display,
              },
            ],
          },
        ]
      : undefined,
    referenceRange: fact.referenceRange
      ? [
          {
            low:
              fact.referenceRange.low !== undefined
                ? { value: fact.referenceRange.low, unit: fact.unit }
                : undefined,
            high:
              fact.referenceRange.high !== undefined
                ? { value: fact.referenceRange.high, unit: fact.unit }
                : undefined,
            text: fact.referenceRange.text,
          },
        ]
      : undefined,
    note: [{ text: fact.quote }],
    extension: provenanceExtensions(fact, doc),
  };
}

export function conditionFor(
  fact: Fact,
  doc: SourceDocument | undefined,
  graph: HealthGraph,
): FhirResource {
  const clinicalStatus =
    fact.status === 'resolved'
      ? { code: 'resolved', display: 'Resolved' }
      : fact.status === 'discontinued'
        ? { code: 'inactive', display: 'Inactive' }
        : { code: 'active', display: 'Active' };
  return {
    resourceType: 'Condition',
    id: fact.id,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: clinicalStatus.code,
          display: clinicalStatus.display,
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: 'unconfirmed',
          display: 'Unconfirmed',
        },
      ],
    },
    code: codingFor(fact.entityKey, fact.label),
    subject: { reference: `Patient/${graph.patient.id}` },
    onsetDateTime: fact.occurredAt,
    recordedDate: doc?.date ?? fact.occurredAt,
    note: [{ text: fact.quote }],
    extension: provenanceExtensions(fact, doc),
  };
}

export function medicationFor(
  fact: Fact,
  doc: SourceDocument | undefined,
  graph: HealthGraph,
): FhirResource {
  const status =
    fact.status === 'discontinued'
      ? 'stopped'
      : fact.status === 'historical'
        ? 'completed'
        : fact.status === 'active'
          ? 'active'
          : 'intended';
  const dose = fact.attrs.dose;
  return {
    resourceType: 'MedicationStatement',
    id: fact.id,
    status,
    medicationCodeableConcept: codingFor(fact.entityKey, fact.label),
    subject: { reference: `Patient/${graph.patient.id}` },
    effectiveDateTime: fact.occurredAt,
    dateAsserted: doc?.date ?? fact.occurredAt,
    dosage: [
      {
        text: String(fact.attrs.doseText ?? fact.quote),
        doseAndRate:
          dose !== undefined && dose !== 'not stated'
            ? [
                {
                  doseQuantity: {
                    value: Number(dose),
                    unit: String(fact.attrs.doseUnit ?? ''),
                    system: UCUM,
                  },
                },
              ]
            : undefined,
      },
    ],
    note: [{ text: fact.quote }],
    extension: provenanceExtensions(fact, doc),
  };
}

export function allergyFor(
  fact: Fact,
  doc: SourceDocument | undefined,
  graph: HealthGraph,
): FhirResource {
  return {
    resourceType: 'AllergyIntolerance',
    id: fact.id,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    type: 'allergy',
    category: ['medication'],
    code: codingFor(fact.entityKey, fact.label),
    patient: { reference: `Patient/${graph.patient.id}` },
    recordedDate: doc?.date ?? fact.occurredAt,
    reaction: [{ manifestation: [{ text: String(fact.attrs.reaction ?? 'not documented') }] }],
    note: [{ text: fact.quote }],
    extension: provenanceExtensions(fact, doc),
  };
}

export function procedureFor(
  fact: Fact,
  doc: SourceDocument | undefined,
  graph: HealthGraph,
): FhirResource {
  return {
    resourceType: 'Procedure',
    id: fact.id,
    status: fact.status === 'scheduled' || fact.status === 'ordered' ? 'preparation' : 'completed',
    code: codingFor(fact.entityKey, fact.label),
    subject: { reference: `Patient/${graph.patient.id}` },
    performedDateTime: fact.occurredAt,
    note: [{ text: fact.quote }],
    extension: provenanceExtensions(fact, doc),
  };
}

export function immunizationFor(
  fact: Fact,
  doc: SourceDocument | undefined,
  graph: HealthGraph,
): FhirResource {
  return {
    resourceType: 'Immunization',
    id: fact.id,
    status: 'completed',
    vaccineCode: codingFor(fact.entityKey, fact.label),
    patient: { reference: `Patient/${graph.patient.id}` },
    occurrenceDateTime: fact.occurredAt,
    recorded: doc?.date ?? fact.occurredAt,
    note: [{ text: fact.quote }],
    extension: provenanceExtensions(fact, doc),
  };
}

export function documentReferenceFor(doc: SourceDocument, graph: HealthGraph): FhirResource {
  return {
    resourceType: 'DocumentReference',
    id: doc.id,
    status: 'current',
    type: {
      text: doc.kind.replace(/_/g, ' '),
      coding: [
        {
          system: 'http://loinc.org',
          code: '11488-4',
          display: 'Consult note',
        },
      ],
    },
    subject: { reference: `Patient/${graph.patient.id}` },
    date: `${doc.date}T09:00:00Z`,
    description: doc.title,
    content: [
      {
        attachment: {
          contentType: 'text/plain',
          title: doc.title,
          data: btoa(unescape(encodeURIComponent(doc.text))),
          size: doc.text.length,
          creation: doc.date,
        },
      },
    ],
    extension: [
      {
        url: 'http://medical-memory.local/StructureDefinition/document-origin',
        valueString: `origin=${doc.origin}; quality=${doc.quality}; facility=${doc.facility ?? 'not stated'}; author=${doc.author ?? 'not stated'}`,
      },
    ],
  };
}

/** Encode text as base64 without depending on the Buffer polyfill. */
function btoa(input: string): string {
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(input);
  // Node fallback for tests and server-side use.
  return globalThis.Buffer.from(input, 'binary').toString('base64');
}

function unescape(input: string): string {
  return input.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

