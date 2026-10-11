import { describe, expect, it } from 'vitest';
import { buildPrimaryGraph } from '../../data/cohortIndex';
import { exportFhir, importFhir } from './fhir';
import { codingCoverage, codesFor } from './codes';

const graph = buildPrimaryGraph();

describe('terminology coding', () => {
  it('maps well-known concepts and leaves the rest as text', () => {
    expect(codesFor('measurement:hemoglobin-a1c')[0]?.code).toBe('4548-4');
    expect(codesFor('measurement:potassium')[0]?.code).toBe('2823-3');
    expect(codesFor('medication:atorvastatin')[0]?.code).toBe('83367');
    expect(codesFor('condition:hypertension').length).toBeGreaterThanOrEqual(2);
  });

  it('reports coverage honestly rather than assuming it', () => {
    const coverage = codingCoverage(graph.entities.map((e) => e.key));
    expect(coverage.total).toBeGreaterThan(0);
    expect(coverage.coded).toBeGreaterThan(0);
    expect(coverage.uncodedKeys.length).toBe(coverage.total - coverage.coded);
    expect(coverage.note).toContain('partial');
  });
});

describe('FHIR export', () => {
  const result = exportFhir(graph);

  it('produces a collection bundle with a patient', () => {
    expect(result.bundle.resourceType).toBe('Bundle');
    expect(result.bundle.type).toBe('collection');
    expect(result.bundle.entry.some((e) => e.resource.resourceType === 'Patient')).toBe(true);
  });

  it('carries provenance on every clinical resource', () => {
    const clinical = result.bundle.entry.filter((e) =>
      [
        'Observation',
        'Condition',
        'MedicationStatement',
        'AllergyIntolerance',
        'Procedure',
        'Immunization',
      ].includes(e.resource.resourceType),
    );
    expect(clinical.length).toBeGreaterThan(20);
    for (const entry of clinical) {
      const extensions = entry.resource.extension as Array<{ url: string; valueString?: string }>;
      const span = extensions.find((x) => x.url.endsWith('source-span'));
      expect(span?.valueString).toContain('span=[');
      const quote = extensions.find((x) => x.url.endsWith('source-quote'));
      expect((quote?.valueString ?? '').length).toBeGreaterThan(0);
    }
  });

  it('states its own cautions and coding coverage', () => {
    expect(result.manifest.cautions.length).toBeGreaterThan(0);
    expect(result.manifest.coding.note).toBeTruthy();
    expect(result.manifest.provenanceNote).toContain('source-span');
  });

  it('round-trips through the reader', () => {
    const imported = importFhir(result.json);
    expect(imported.documentText).toContain('FHIR RESOURCE');
    expect(imported.summary.length).toBeGreaterThan(0);
    expect(imported.warnings).toEqual([]);
  });

  it('names unmapped resource types instead of dropping them', () => {
    const imported = importFhir(
      JSON.stringify({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: { resourceType: 'NutritionOrder', id: 'x' } }],
      }),
    );
    expect(imported.warnings.some((w) => w.includes('NutritionOrder'))).toBe(true);
  });

  it('rejects invalid JSON with an explanatory error', () => {
    expect(() => importFhir('{ not json')).toThrow(/not valid JSON/);
  });
});
