import { describe, expect, it } from 'vitest';
import { buildSampleGraph } from '../../data/sampleCorpus';
import { derive } from '../derive/engine';
import { summarizeDocument, DOCUMENT_STATUS_LABEL } from './summarize';

/*
 * The document summary is the "every uploaded record must become
 * understandable" rule. It must be deterministic and, above all, it must only
 * ever say things the engine actually extracted — the whole test is about
 * proving it cannot invent.
 */

const graph = buildSampleGraph();
const asOf = graph.stats.spanEnd;
const derivations = derive(graph, asOf);

// The panel that contains the decimal-shift potassium typo (Potassium "45").
const implausibleFact = graph.facts.find((f) => f.flags.includes('implausible_value'))!;
const flaggedDocId = implausibleFact.docId;

// A clean lab panel, for the plain-language checks.
const cleanDocId = graph.documents.find((d) => d.title === 'Lipid panel and comprehensive metabolic panel')!.id;

describe('summarizeDocument', () => {
  it('is deterministic', () => {
    expect(summarizeDocument(graph, cleanDocId, derivations)).toEqual(
      summarizeDocument(graph, cleanDocId, derivations),
    );
  });

  it('summarises only what the engine actually extracted', () => {
    const summary = summarizeDocument(graph, cleanDocId, derivations);

    expect(summary.factCount).toBeGreaterThan(0);
    expect(summary.plainLanguage).toContain('measurement');
    // The labels shown in the summary are all real extracted facts.
    for (const fact of summary.measurements.slice(0, 4)) {
      expect(summary.plainLanguage).toContain(fact.label);
    }
  });

  it('flags the implausible value rather than silently trusting it', () => {
    const summary = summarizeDocument(graph, flaggedDocId, derivations);

    expect(summary.status).toBe('verified-with-flags');
    expect(DOCUMENT_STATUS_LABEL[summary.status]).toBe('Verified with flags');
    expect(summary.flagged.some((fact) => fact.flags.includes('implausible_value'))).toBe(true);
    expect(summary.limitations.some((line) => line.includes('flagged for review'))).toBe(true);
  });

  it('states what a single document cannot establish', () => {
    const summary = summarizeDocument(graph, cleanDocId, derivations);
    expect(summary.limitations.some((line) => line.includes('does not establish'))).toBe(true);
  });

  it('counts the derivations a document contributes to', () => {
    const summary = summarizeDocument(graph, flaggedDocId, derivations);
    expect(summary.findings.length).toBeGreaterThan(0);
    expect(summary.findings.every((d) => d.docIds.includes(flaggedDocId))).toBe(true);
  });
});
