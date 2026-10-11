import type { DocumentInput } from '../engine/ingest';
import type { Derivation, RuleId } from '../engine/derive/types';
import type { HealthGraph } from '../engine/types';
import { ingestDocument } from '../engine/ingest';
import { buildGraph } from '../engine/graph';
import { derive, derivationSummary, RULE_REGISTRY } from '../engine/derive/engine';
import { buildConditionSpans, buildMedicationCourses } from '../engine/derive/intervals';
import { assessQuality } from '../engine/platform/quality';
import { exportFhir } from '../engine/platform/fhir';
import { SAMPLE_DOCUMENTS, SAMPLE_PATIENT } from '../data/sampleCorpus';
import { SUBJECT_B_DOCUMENTS, SUBJECT_B_PATIENT, SUBJECT_C_PATIENT } from '../data/cohortCorpus';
import { SUBJECT_C_DOCUMENTS } from '../data/cohortCorpus2';
import { DEFAULT_SCENARIO, matchScenario } from './scenarios';
import {
  artifactIdentity,
  compareIdentities,
  type ReproductionReport,
} from '../engine/identity';
import type { BuildArtifact, BuildBackend, BuildPlan, BuildRequest, BuildStep } from './types';

/* ------------------------------------------------------------------ */
/* Source resolution                                                   */
/* ------------------------------------------------------------------ */

interface SourceSlice {
  patient: typeof SAMPLE_PATIENT;
  documents: DocumentInput[];
  offset: number;
}

const SOURCES: Record<'primary' | 'monitoring' | 'sparse', SourceSlice> = {
  primary: { patient: SAMPLE_PATIENT, documents: SAMPLE_DOCUMENTS, offset: 0 },
  monitoring: { patient: SUBJECT_B_PATIENT, documents: SUBJECT_B_DOCUMENTS, offset: 500 },
  sparse: { patient: SUBJECT_C_PATIENT, documents: SUBJECT_C_DOCUMENTS, offset: 900 },
};

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

/**
 * Decide what to build, and say why.
 *
 * The reason is part of the plan because a user is entitled to know whether the
 * system understood their request or fell back to a default.
 */
export function planBuild(request: BuildRequest): BuildPlan {
  const attachments = request.attachments ?? [];
  const ruleCount = effectiveRuleIds(request).length;

  if (attachments.length > 0) {
    const kinds = Array.from(new Set(attachments.map((doc) => doc.kind)));
    return {
      scenarioId: 'attached',
      scenarioLabel: 'Attached documents',
      matchedBy: 'attachment',
      matchedOn: attachments.map((doc) => doc.title).slice(0, 6),
      documentCount: attachments.length,
      documentKinds: kinds,
      extractors: extractorsFor(kinds),
      ruleCount,
      focus: 'findings',
      caveats: [
        'Attached documents are read with the same extractors as the built-in corpus.',
        'Nothing in the attachments is sent anywhere: the build runs in this browser.',
      ],
    };
  }

  const match = matchScenario(request.prompt);
  const scenario = match.scenario;
  const slice = SOURCES[scenario.source];
  const documents = scenario.include ? slice.documents.filter(scenario.include) : slice.documents;
  const kinds = Array.from(new Set(documents.map((doc) => doc.kind)));

  const caveats: string[] = [
    match.matchedBy === 'keywords'
      ? 'Matched on keywords in your description.'
      : 'Nothing specific matched, so the default record was used.',
    'Every finding below is a derivation over real documents, not a canned result.',
  ];
  if (scenario.include && documents.length < slice.documents.length) {
    caveats.push(
      `This scenario narrows the record from ${slice.documents.length} documents to ${documents.length}.`,
    );
  }

  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    matchedBy: match.matchedBy,
    matchedOn: match.matchedOn,
    documentCount: documents.length,
    documentKinds: kinds,
    extractors: extractorsFor(kinds),
    ruleCount,
    focus: scenario.focus,
    caveats,
  };
}

function extractorsFor(kinds: string[]): string[] {
  const base = ['dates', 'measurements', 'medications', 'conditions', 'allergies'];
  if (kinds.includes('lab_report')) base.push('reference ranges');
  if (kinds.includes('immunization_record')) base.push('immunizations');
  if (kinds.includes('wearable_summary')) base.push('device series');
  if (kinds.includes('discharge_summary')) base.push('section headings');
  return base;
}

/** Resolve the documents a request will actually read. */
export function resolveSlice(request: BuildRequest): SourceSlice {
  const withheld = new Set(request.withholdDocuments ?? []);
  const exclude = (documents: DocumentInput[]) =>
    withheld.size === 0 ? documents : documents.filter((doc) => !withheld.has(doc.title));

  if (request.attachments?.length) {
    return { patient: SAMPLE_PATIENT, documents: exclude(request.attachments), offset: 0 };
  }
  const scenario = matchScenario(request.prompt).scenario ?? DEFAULT_SCENARIO;
  const source = SOURCES[scenario.source];
  const included = scenario.include
    ? source.documents.filter(scenario.include)
    : source.documents;
  return { ...source, documents: exclude(included) };
}

/**
 * The rule ids a request will actually run.
 *
 * Withheld rules are subtracted from the registry, and the result is recorded on
 * the artifact's identity. A branch that ablates a rule therefore has a different
 * rule set version from its parent, which is what lets a comparison say "the rule
 * set differs" instead of quietly reporting different findings.
 */
export function effectiveRuleIds(request: BuildRequest): RuleId[] {
  const suppressed = new Set(request.suppressRules ?? []);
  const base = request.onlyRules
    ? RULE_REGISTRY.filter((entry) => request.onlyRules!.includes(entry.id))
    : RULE_REGISTRY;
  return base.filter((entry) => !suppressed.has(entry.id)).map((entry) => entry.id);
}

/* ------------------------------------------------------------------ */
/* The local backend                                                   */
/* ------------------------------------------------------------------ */

export interface LocalBackendOptions {
  /** Milliseconds between steps, so the interface can paint. Zero in tests. */
  pace?: number;
}

const wait = (ms: number) =>
  ms <= 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A genuine build, executed in the browser.
 *
 * The delays exist only so the interface can paint between steps. The work
 * itself is the real pipeline: ingest, graph, derive, assess, export. Every
 * figure the preview shows is read back out of the artifact this produced.
 */
export class LocalBuildBackend implements BuildBackend {
  readonly id = 'local';
  readonly label = 'In-browser engine';
  readonly note =
    'The real extraction and inference pipeline, running locally. No document leaves this tab.';

  private readonly pace: number;

  constructor(options: LocalBackendOptions = {}) {
    this.pace = options.pace ?? 70;
  }

  plan(request: BuildRequest): BuildPlan {
    return planBuild(request);
  }

  async run(request: BuildRequest, onStep: (step: BuildStep) => void): Promise<BuildArtifact> {
    const started = Date.now();
    const plan = this.plan(request);
    const slice = resolveSlice(request);
    const documents = slice.documents;
    const pace = request.pace ?? this.pace;

    onStep({
      id: 'plan',
      stage: 'planning',
      label: 'Reading your description',
      detail:
        plan.matchedBy === 'keywords'
          ? `Matched “${plan.scenarioLabel}” on: ${plan.matchedOn.join(', ')}.`
          : plan.matchedBy === 'attachment'
            ? `${documents.length} attached document(s) will be read directly.`
            : 'Nothing specific matched, so the full record was used.',
      progress: 0.04,
      metrics: { documents: documents.length, rules: plan.ruleCount },
    });
    await wait(pace);

    const results = [];
    for (let index = 0; index < documents.length; index += 1) {
      results.push(ingestDocument(documents[index], slice.offset + index));
      const done = index + 1;
      onStep({
        id: `ingest-${done}`,
        stage: 'ingesting',
        label: 'Extracting facts',
        detail: results[done - 1].document.title,
        progress: 0.06 + 0.3 * (done / Math.max(documents.length, 1)),
        metrics: {
          documents: done,
          facts: results.reduce((sum, r) => sum + r.facts.length, 0),
        },
      });
      await wait(pace);
    }

    const factCount = results.reduce((sum, r) => sum + r.facts.length, 0);

    onStep({
      id: 'graph',
      stage: 'linking',
      label: 'Resolving entities and linking facts',
      detail: 'Grouping the same concept across documents and recording what justified each edge.',
      progress: 0.44,
      metrics: { facts: factCount },
    });
    await wait(pace);

    const graph = buildGraph(slice.patient, results);
    onStep({
      id: 'graph-done',
      stage: 'linking',
      label: 'Graph built',
      detail: `${graph.entities.length} entities across ${graph.documents.length} documents.`,
      progress: 0.56,
      metrics: {
        entities: graph.entities.length,
        edges: graph.edges.length,
        inferred: graph.edges.filter((edge) => edge.inferred).length,
      },
    });
    await wait(pace);

    const asOf = request.asOf ?? graph.stats.spanEnd;
    const ruleIds = effectiveRuleIds(request);
    onStep({
      id: 'rules',
      stage: 'inferring',
      label: 'Applying rules',
      detail:
        ruleIds.length === RULE_REGISTRY.length
          ? `${ruleIds.length} rules, each required to state what it cannot conclude.`
          : `${ruleIds.length} of ${RULE_REGISTRY.length} rules. ${RULE_REGISTRY.length - ruleIds.length} withheld for this branch.`,
      progress: 0.62,
      metrics: { rules: ruleIds.length, withheld: RULE_REGISTRY.length - ruleIds.length },
    });
    await wait(pace);

    const derivations = derive(graph, asOf, { only: ruleIds });
    const summary = derivationSummary(derivations);

    onStep({
      id: 'rules-done',
      stage: 'inferring',
      label: 'Inference complete',
      detail: `${derivations.length} derivations, ${summary.bySeverity.high} of them high severity.`,
      progress: 0.78,
      metrics: {
        derivations: derivations.length,
        high: summary.bySeverity.high,
        categories: Object.keys(summary.byCategory).length,
      },
    });
    await wait(pace);

    const courses = buildMedicationCourses(graph);
    const spans = buildConditionSpans(graph);

    onStep({
      id: 'package',
      stage: 'packaging',
      label: 'Scoring quality and building the export',
      detail: 'Nine quality dimensions, plus a FHIR bundle with provenance on every resource.',
      progress: 0.86,
    });
    await wait(pace);

    const quality = assessQuality({ graph, derivations, asOf });
    const fhir = exportFhir(graph);
    const resourceCount = Object.values(fhir.manifest.resourceCounts).reduce((a, b) => a + b, 0);

    onStep({
      id: 'package-done',
      stage: 'packaging',
      label: 'Package ready',
      detail: `${fhir.manifest.coding.coded} of ${fhir.manifest.coding.total} concepts carry a standard code.`,
      progress: 0.96,
      metrics: {
        resources: resourceCount,
        coded: fhir.manifest.coding.coded,
        total: fhir.manifest.coding.total,
      },
    });
    await wait(pace);

    const artifact: BuildArtifact = {
      scenarioId: plan.scenarioId,
      scenarioLabel: plan.scenarioLabel,
      focus: plan.focus,
      patient: slice.patient,
      documents: graph.documents,
      facts: graph.facts,
      graph,
      derivations,
      courses,
      spans,
      quality,
      summary,
      interop: {
        resourceCount,
        codedConcepts: fhir.manifest.coding.coded,
        totalConcepts: fhir.manifest.coding.total,
      },
      inputs: documents,
      offset: slice.offset,
      identity: artifactIdentity({ graph, derivations, documents, ruleIds }),
      suppressedRules: request.suppressRules ?? [],
      withheldDocuments: request.withholdDocuments ?? [],
      asOf,
      branch: request.branch ?? null,
      elapsedMs: Date.now() - started,
    };

    onStep({
      id: 'ready',
      stage: 'ready',
      label: 'Ready',
      detail: 'The preview below is built from this result.',
      progress: 1,
    });

    return artifact;
  }
}

/* ------------------------------------------------------------------ */
/* Reproduction                                                        */
/* ------------------------------------------------------------------ */

export interface ReproductionOutcome {
  report: ReproductionReport;
  /** The re-derived graph, so a caller can show it rather than just describe it. */
  graph: HealthGraph;
  derivations: Derivation[];
}

/**
 * Re-run an artifact from its own inputs and compare the result.
 *
 * This is the honest test of reproducibility: the inputs are re-ingested from
 * scratch, the graph is rebuilt, the rules run again, and the output is hashed
 * and compared finding by finding. Nothing is reused from the original artifact
 * except the record of what it read and what it claimed.
 *
 * Synchronous, because at this size the whole pipeline is a few milliseconds and
 * a spinner would be theatre.
 */
export function reproduceArtifact(artifact: BuildArtifact): ReproductionOutcome {
  const results = artifact.inputs.map((input, index) =>
    ingestDocument(input, artifact.offset + index),
  );
  const graph = buildGraph(artifact.patient, results);
  const ruleIds = effectiveRuleIds({
    prompt: artifact.scenarioLabel,
    suppressRules: artifact.suppressedRules,
  });
  // The branch's own evaluation date, not the record's end: reproducing a run
  // evaluated at an earlier date under a later one would compare two different
  // questions and call the difference a failure.
  const derivations = derive(graph, artifact.asOf, { only: ruleIds });
  const actual = artifactIdentity({
    graph,
    derivations,
    documents: artifact.inputs,
    ruleIds,
  });

  return {
    report: compareIdentities(artifact.identity, actual, artifact.derivations, derivations),
    graph,
    derivations,
  };
}
