import type { HealthGraph, Patient } from '../types';
import { codingCoverage } from './codes';
import { buildMedicationCourses } from '../derive/intervals';
import {
  allergyFor,
  conditionFor,
  documentReferenceFor,
  immunizationFor,
  medicationFor,
  observationFor,
  procedureFor,
} from './fhirResources';
import type { FhirBundle, FhirExtension, FhirResource } from './fhirExport';

/* ------------------------------------------------------------------ */
/* FHIR R4 bundle assembly                                             */
/* ------------------------------------------------------------------ */

const SCHEMA_VERSION = 'medical-memory.fhir/v1';

export interface FhirExportResult {
  bundle: FhirBundle;
  json: string;
  manifest: {
    schema: string;
    generatedAt: string;
    resourceCounts: Record<string, number>;
    coding: ReturnType<typeof codingCoverage>;
    provenanceNote: string;
    cautions: string[];
  };
}

function patientFor(patient: Patient, graph: HealthGraph): FhirResource {
  return {
    resourceType: 'Patient',
    id: patient.id,
    active: true,
    name: [{ text: patient.name }],
    birthDate: patient.dateOfBirth,
    gender: patient.sex === 'male' ? 'male' : patient.sex === 'female' ? 'female' : 'unknown',
    extension: [
      {
        url: 'http://medical-memory.local/StructureDefinition/synthetic',
        valueString: patient.synthetic ? 'true' : 'false',
      },
      {
        url: 'http://medical-memory.local/StructureDefinition/graph-span',
        valueString: `${graph.stats.spanStart}..${graph.stats.spanEnd}; documents=${graph.documents.length}; facts=${graph.facts.length}`,
      },
    ],
  };
}

/**
 * Export the graph as a FHIR R4 collection bundle.
 *
 * Two things make this export unusual. First, every clinical resource carries the
 * document and character span it was read from, so a receiving system can trace
 * any value back to its source line. Second, the manifest reports coding coverage
 * and residual cautions, so a consumer can see what is and is not asserted by the
 * export instead of discovering it later.
 */
export function exportFhir(graph: HealthGraph): FhirExportResult {
  const entries: Array<{ fullUrl: string; resource: FhirResource }> = [];
  const resourceCounts: Record<string, number> = {};

  const push = (resource: FhirResource) => {
    entries.push({ fullUrl: `urn:uuid:${resource.id}`, resource });
    resourceCounts[resource.resourceType] = (resourceCounts[resource.resourceType] ?? 0) + 1;
  };

  push(patientFor(graph.patient, graph));

  const docById = new Map(graph.documents.map((d) => [d.id, d]));

  for (const fact of graph.facts) {
    const doc = docById.get(fact.docId);
    switch (fact.type) {
      case 'measurement':
      case 'vital':
        push(observationFor(fact, doc, graph));
        break;
      case 'condition':
        push(conditionFor(fact, doc, graph));
        break;
      case 'medication':
        push(medicationFor(fact, doc, graph));
        break;
      case 'allergy':
        push(allergyFor(fact, doc, graph));
        break;
      case 'procedure':
        push(procedureFor(fact, doc, graph));
        break;
      case 'immunization':
        push(immunizationFor(fact, doc, graph));
        break;
      default:
        // Symptoms, social history and demographics have no clean R4 home in a
        // collection bundle. They are counted in the manifest rather than forced
        // into a resource that would misrepresent them.
        resourceCounts['Unmapped'] = (resourceCounts['Unmapped'] ?? 0) + 1;
        break;
    }
  }

  for (const doc of graph.documents) push(documentReferenceFor(doc, graph));

  const courses = buildMedicationCourses(graph);
  const openCourses = courses.filter((c) => c.state === 'open').length;

  const meta: FhirExtension[] = [
    { url: 'http://medical-memory.local/StructureDefinition/schema', valueString: SCHEMA_VERSION },
    {
      url: 'http://medical-memory.local/StructureDefinition/provenance-invariant',
      valueString:
        'Every clinical resource carries a source-span extension naming the document, date, character span, extractor and section that produced it.',
    },
    {
      url: 'http://medical-memory.local/StructureDefinition/medication-courses',
      valueString: `reconstructed=${courses.length}; open=${openCourses}`,
    },
  ];

  const bundle: FhirBundle = {
    resourceType: 'Bundle',
    id: `mm-bundle-${graph.patient.id}`,
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries,
    meta: { extension: meta },
  };

  const entityKeys = graph.entities.filter((e) => e.kind !== 'person').map((e) => e.key);
  const cautions: string[] = [
    'The Patient resource carries a synthetic flag. If that flag reads false, the record is a real one and the export must be handled accordingly.',
    'Condition resources are marked verificationStatus "unconfirmed" because the platform reads statements rather than adjudicating diagnoses.',
    'Unmapped fact types (symptoms, social history, demographics) are counted in this manifest and not forced into an R4 resource.',
  ];
  if (graph.stats.facts === 0) {
    cautions.push('The graph contains no facts, so this bundle carries only the patient and the documents.');
  }

  return {
    bundle,
    json: JSON.stringify(bundle, null, 2),
    manifest: {
      schema: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      resourceCounts,
      coding: codingCoverage(entityKeys),
      provenanceNote:
        'Each resource carries source-span, source-quote, extraction-confidence and, where applicable, extraction-flag extensions.',
      cautions,
    },
  };
}

export interface FhirImportSummary {
  resourceType: string;
  count: number;
  notes: string[];
}

export interface FhirImportResult {
  /** A document whose text is the formatted bundle, so provenance still holds. */
  documentText: string;
  title: string;
  summary: FhirImportSummary[];
  warnings: string[];
}

const MAPPED_RESOURCES = new Set([
  'Patient',
  'Observation',
  'Condition',
  'MedicationStatement',
  'MedicationRequest',
  'AllergyIntolerance',
  'Procedure',
  'Immunization',
  'DocumentReference',
  'DiagnosticReport',
]);

/**
 * Read a FHIR bundle into the platform.
 *
 * The bundle becomes one source document whose text is the formatted JSON, with
 * every resource written as its own labelled block. That keeps the provenance
 * invariant intact — every fact still points at characters in a document — while
 * letting the existing reader pull clinical content out of the resource fields.
 *
 * Nothing is dropped silently: unrecognised resource types are named in the
 * warnings rather than quietly ignored.
 */
export function importFhir(json: string): FhirImportResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `The supplied FHIR payload is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const bundle = parsed as {
    resourceType?: string;
    entry?: Array<{ resource?: { resourceType?: string } }>;
  };
  if (bundle.resourceType !== 'Bundle') {
    warnings.push(
      `Top-level resourceType is "${bundle.resourceType ?? 'missing'}", not "Bundle". Import continues, but this is not a collection bundle.`,
    );
  }

  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  if (entries.length === 0) {
    warnings.push('The bundle contains no entries, so nothing will be imported.');
  }

  const counts = new Map<string, number>();
  for (const entry of entries) {
    const type = entry.resource?.resourceType ?? 'unknown';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const summary: FhirImportSummary[] = [];
  for (const [resourceType, count] of counts) {
    const notes: string[] = [];
    if (!MAPPED_RESOURCES.has(resourceType)) {
      notes.push(
        'Resource type is not mapped by the reader; its text is preserved but no facts are extracted from it.',
      );
      warnings.push(`Unmapped FHIR resource type: ${resourceType} (${count}).`);
    }
    summary.push({ resourceType, count, notes });
  }

  const patient = entries.find((e) => e.resource?.resourceType === 'Patient')?.resource as
    | { name?: Array<{ text?: string; family?: string; given?: string[] }> }
    | undefined;
  const name =
    patient?.name?.[0]?.text ??
    [patient?.name?.[0]?.given?.join(' '), patient?.name?.[0]?.family].filter(Boolean).join(' ') ??
    'FHIR import';

  const documentText = entries
    .map((entry, index) => {
      const resource = entry.resource ?? {};
      return [
        `--- FHIR RESOURCE ${index + 1} of ${entries.length}: ${resource.resourceType ?? 'unknown'} ---`,
        JSON.stringify(resource, null, 2),
      ].join('\n');
    })
    .join('\n\n');

  return {
    documentText,
    title: `FHIR bundle — ${name || 'unnamed'}`,
    summary: summary.sort((a, b) => b.count - a.count),
    warnings,
  };
}

export type { FhirBundle, FhirResource } from './fhirExport';

