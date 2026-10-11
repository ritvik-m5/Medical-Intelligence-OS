import type {
  ConditionSpan,
  Derivation,
  MedicationCourse,
  QualityReport,
} from '../engine/derive/types';
import type { DerivationSummary } from '../engine/derive/engine';
import type { Fact, HealthGraph, Patient, SourceDocument } from '../engine/types';
import type { DocumentInput } from '../engine/ingest';
import type { ArtifactIdentity } from '../engine/identity';
import type { BranchOperation } from '../engine/platform/artifactStore';

/* ------------------------------------------------------------------ */
/* Builder state model                                                 */
/*                                                                    */
/* This file and everything beside it is deliberately independent of    */
/* React and of the DOM. The build is expressed as a request, a plan,   */
/* a stream of steps and an artifact — which is exactly the contract a  */
/* real generation backend would implement.                             */
/*                                                                    */
/* The current implementation runs the real engine in the browser. It   */
/* is a genuine build, not a loading animation: every number shown in   */
/* the preview is read out of the artifact this pipeline produced.      */
/* ------------------------------------------------------------------ */

export type BuildStage =
  | 'idle'
  | 'planning'
  | 'ingesting'
  | 'linking'
  | 'inferring'
  | 'packaging'
  | 'ready'
  | 'error';

export const STAGE_LABEL: Record<BuildStage, string> = {
  idle: 'Ready',
  planning: 'Planning',
  ingesting: 'Reading documents',
  linking: 'Building the graph',
  inferring: 'Applying rules',
  packaging: 'Packaging',
  ready: 'Ready',
  error: 'Failed',
};

export const STAGE_ORDER: BuildStage[] = [
  'planning',
  'ingesting',
  'linking',
  'inferring',
  'packaging',
  'ready',
];

/** What the user asked for. */
export interface BuildRequest {
  /** The free-text description typed into the composer. */
  prompt: string;
  /** Documents the user attached directly, if any. */
  attachments?: DocumentInput[];
  /** Restrict the build to these rule ids. */
  onlyRules?: string[];
  /**
   * Rules to withhold.
   *
   * The difference from `onlyRules` is the difference between narrowing and
   * ablating. Withholding one rule answers "what did this rule contribute?",
   * which is the question a branch is usually asking.
   */
  suppressRules?: string[];
  /**
   * Document titles to exclude from this run.
   *
   * The second half of ablation. Withholding a rule answers "what did this rule
   * contribute?"; withholding a document answers "what did this document
   * contribute?" — and that is the question a reader asks when they doubt a
   * source.
   */
  withholdDocuments?: string[];
  /**
   * Evaluate as of this date rather than the end of the record.
   *
   * Set by a date branch: the same corpus, the same rules, a different moment.
   * Anything the record did not yet support at that date must not appear.
   */
  asOf?: string;
  /**
   * Where this run came from, when it is a branch of another.
   *
   * Recorded rather than inferred, so the lineage survives being saved, reloaded
   * and compared across sessions.
   */
  branch?: { parentId: string; operation: BranchOperation; reason: string };
  /**
   * Milliseconds between steps, so the interface can paint.
   *
   * Omitted uses the backend's default. The first build on a cold page passes
   * zero: there is no reason to make someone watch a progress bar for a record
   * they did not ask about. Builds they *do* ask for are paced so the pipeline
   * can be read as it runs.
   */
  pace?: number;
}

/** What the builder decided to do, before doing it. */
export interface BuildPlan {
  scenarioId: string;
  scenarioLabel: string;
  /** Why this scenario was chosen, shown to the user. */
  matchedBy: 'keywords' | 'attachment' | 'fallback';
  matchedOn: string[];
  documentCount: number;
  documentKinds: string[];
  extractors: string[];
  ruleCount: number;
  /** What the preview will lead with. */
  focus: ScenarioFocus;
  caveats: string[];
}

export type ScenarioFocus = 'findings' | 'timeline' | 'measurements' | 'quality' | 'interop';

/** One observable step of the build. */
export interface BuildStep {
  id: string;
  stage: BuildStage;
  label: string;
  detail: string;
  /** 0 to 1 across the whole build. */
  progress: number;
  /** Numbers that came out of real work, not decoration. */
  metrics?: Record<string, number | string>;
}

/** Everything the build produced. */
export interface BuildArtifact {
  scenarioId: string;
  scenarioLabel: string;
  focus: ScenarioFocus;
  patient: Patient;
  documents: SourceDocument[];
  facts: Fact[];
  graph: HealthGraph;
  derivations: Derivation[];
  courses: MedicationCourse[];
  spans: ConditionSpan[];
  quality: QualityReport;
  summary: DerivationSummary;
  interop: {
    resourceCount: number;
    codedConcepts: number;
    totalConcepts: number;
  };
  /**
   * What produced this artifact, kept so it can be reproduced.
   *
   * Without these the artifact is a result with no way back to its inputs, and
   * "reproduce this exact result" would be an aspiration rather than a feature.
   */
  inputs: DocumentInput[];
  offset: number;
  /** The name of this result, computed from its inputs and its output. */
  identity: ArtifactIdentity;
  /** Rules deliberately withheld. Empty for a normal build. */
  suppressedRules: string[];
  /** Document titles deliberately excluded. Empty for a normal build. */
  withheldDocuments: string[];
  /** The date the rules were evaluated as of. */
  asOf: string;
  /** Where this came from, when it is a branch. */
  branch: { parentId: string; operation: BranchOperation; reason: string } | null;
  elapsedMs: number;
}

/**
 * The contract a real generation backend implements.
 *
 * Swapping in a server-side implementation means writing one object. Nothing in
 * the interface, and nothing in the presentation layer, has to change.
 */
export interface BuildBackend {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  plan(request: BuildRequest): BuildPlan;
  run(request: BuildRequest, onStep: (step: BuildStep) => void): Promise<BuildArtifact>;
}

export interface BuildState {
  stage: BuildStage;
  progress: number;
  steps: BuildStep[];
  plan: BuildPlan | null;
  artifact: BuildArtifact | null;
  error: string | null;
  startedAt: number | null;
}

export const EMPTY_BUILD_STATE: BuildState = {
  stage: 'idle',
  progress: 0,
  steps: [],
  plan: null,
  artifact: null,
  error: null,
  startedAt: null,
};

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

/**
 * A scenario is a real slice of a real record.
 *
 * Nothing here is invented for the landing page: each scenario names a subset of
 * the synthetic corpus that ships with the product, and the build genuinely runs
 * over those documents.
 */
export interface Scenario {
  id: string;
  label: string;
  /** Something a person might plausibly type. */
  prompt: string;
  keywords: string[];
  source: 'primary' | 'monitoring' | 'sparse';
  /** Narrow the documents before building. */
  include?: (doc: DocumentInput) => boolean;
  focus: ScenarioFocus;
  blurb: string;
  /** The headline the preview leads with. */
  headline: string;
}

export function stageIndex(stage: BuildStage): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? 0 : index;
}

export function isBuilding(stage: BuildStage): boolean {
  return stage !== 'idle' && stage !== 'ready' && stage !== 'error';
}
