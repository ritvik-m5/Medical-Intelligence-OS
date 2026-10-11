import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Suspense, lazy } from 'react';
import { LocalBuildBackend, reproduceArtifact } from '../builder/backend';
import type { ComparableRun } from '../engine/compare';
import { DEFAULT_SCENARIO, PROMPT_SUGGESTIONS } from '../builder/scenarios';
import {
  readAttachments,
  retypeAttachment,
  type AcceptedAttachment,
  type RejectedAttachment,
} from '../builder/attachments';
import { useBuild } from '../builder/useBuild';
import { scrollToElement } from '../builder/scroll';
import { isBuilding } from '../builder/types';
import type { BuildArtifact, BuildRequest } from '../builder/types';
import { shortAddress } from '../engine/platform/artifactStore';
import type { DocKind } from '../engine/types';
import { engineStatus } from '../lib/engineStatus';

import { RULE_REGISTRY } from '../engine/derive/engine';
import { useStore } from '../state/store';
import { BuilderHero } from '../components/builder/BuilderHero';
import { EngineStatusPill } from '../components/EngineStatusPill';
import { ArtifactInspector } from '../components/ArtifactInspector';

import { CapabilityStrip } from '../components/builder/CapabilityStrip';
import { InfrastructureSection } from '../components/builder/InfrastructureSection';
import { ExampleGallery } from '../components/builder/ExampleGallery';
import { BuildCTA } from '../components/builder/BuildCTA';

/*
 * The explainer sits below the fold, so it is loaded on demand. The front door
 * has to paint with the composer and the preview; the chat can arrive a moment
 * later, and it brings its own engine with it.
 */
const ExplainChat = lazy(() =>
  import('../components/builder/ExplainChat').then((module) => ({ default: module.ExplainChat })),
);

/*
 * The pipeline section is below the fold and carries its own derivation module,
 * so it is loaded on demand for the same reason.
 */
const Scrollytelling = lazy(() =>
  import('../components/builder/Scrollytelling').then((module) => ({
    default: module.Scrollytelling,
  })),
);

/* Comparing runs is a research surface, below the fold like the rest. */
const RunCompare = lazy(() =>
  import('../components/builder/RunCompare').then((module) => ({ default: module.RunCompare })),
);

/* The durable registry and the branch surface, both below the fold. */
const RunsPanel = lazy(() =>
  import('../components/builder/RunsPanel').then((module) => ({ default: module.RunsPanel })),
);

const BranchPanel = lazy(() =>
  import('../components/builder/BranchPanel').then((module) => ({ default: module.BranchPanel })),
);

interface BuilderViewProps {
  /** Leave the builder and open the full workspace. */
  onEnterWorkspace: () => void;
}

/**
 * The builder.
 *
 * This is the front door: a composer, a live preview of what the build actually
 * produced, and the reasoning behind it. The build itself is the real engine —
 * see `src/builder/backend.ts`. The backend is an interface, so a server-side
 * generator can replace it without anything here changing.
 */
export function BuilderView({ onEnterWorkspace }: BuilderViewProps) {
  const backend = useMemo(() => new LocalBuildBackend({ pace: 80 }), []);
  const build = useBuild(backend);
  const { openEvidence, setView } = useStore();
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AcceptedAttachment[]>([]);
  const [rejections, setRejections] = useState<RejectedAttachment[]>([]);
  const autoRan = useRef(false);
  const heroRef = useRef<HTMLDivElement>(null);

  /**
   * Run a build.
   *
   * Attached documents are passed straight through as pipeline input, so from
   * here on they are indistinguishable from the built-in corpus: same extractors,
   * same spans, same rules. The prompt still governs the plan, which is how the
   * interface can say why it chose what it chose.
   */
  const runBuild = useCallback(
    (text: string, atts: AcceptedAttachment[], pace?: number) => {
      void build.run({
        prompt: text,
        attachments: atts.map((attachment) => attachment.input),
        pace,
      });
    },
    [build],
  );

  const startBuild = useCallback(
    (text: string) => {
      setPrompt(text);
      runBuild(text, attachments);
    },
    [attachments, runBuild],
  );

  const handleFiles = useCallback(async (files: File[]) => {
    const result = await readAttachments(files);
    setAttachments((previous) => {
      const seen = new Set(previous.map((attachment) => attachment.filename));
      return [...previous, ...result.accepted.filter((entry) => !seen.has(entry.filename))];
    });
    setRejections((previous) => [...previous, ...result.rejected]);
  }, []);

  const removeAttachment = useCallback((filename: string) => {
    setAttachments((previous) => previous.filter((entry) => entry.filename !== filename));
  }, []);

  const retype = useCallback((filename: string, kind: DocKind) => {
    setAttachments((previous) =>
      previous.map((entry) =>
        entry.filename === filename ? retypeAttachment(entry, kind) : entry,
      ),
    );
  }, []);

  const dismissRejection = useCallback((filename: string) => {
    setRejections((previous) => previous.filter((entry) => entry.filename !== filename));
  }, []);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  /**
   * Build the default record once, at full speed.
   *
   * The page opens with a populated preview rather than an empty one, because
   * "here is what it does" is a better answer than "here is a box". It is not
   * paced: nobody asked for this build, so there is nothing to watch.
   */
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    void build.run({ prompt: DEFAULT_SCENARIO.prompt, pace: 0 });
  }, [build]);

  const scrollToHero = useCallback(() => {
    scrollToElement(heroRef.current, { behavior: 'smooth', block: 'start' });
  }, []);

  /**
   * A run opened from the registry.
   *
   * The panel has already re-derived it from its stored corpus and checked the
   * result against what the run claimed, so this adopts the artifact rather than
   * building it twice. The comparison set is cleared, because the runs in it were
   * built from a different record.
   */
  const openRun = useCallback(
    (opened: BuildArtifact) => {
      build.adopt(opened);
      setRuns([]);
      setCrossSession(false);
      scrollToHero();
    },
    [build, scrollToHero],
  );

  /**
   * Two runs chosen in the registry.
   *
   * Both sides were re-derived from stored corpora, so this comparison is not
   * limited to the current session. The flag records that, because the section
   * heading should say which kind of comparison a reader is looking at.
   */
  const compareStored = useCallback((picked: ComparableRun[]) => {
    setRuns(picked);
    setCrossSession(picked.length === 2);
  }, []);

  /**
   * Run a branch of the current artifact.
   *
   * The request carries the parent's identity, so the lineage is recorded on the
   * artifact and survives being saved — it is not a fact about this session. The
   * `description` is used for the live progress line while the build runs.
   */
  const runBranch = useCallback(
    (request: BuildRequest, description: string) => {
      setBranchNote(description);
      void build.run(request);
    },
    [build],
  );

  const busy = isBuilding(build.stage);
  const artifact = build.artifact;
  const [inspecting, setInspecting] = useState(false);

  /**
   * The status the pill reports.
   *
   * Recomputed from the artifact whenever a build lands, including the provenance
   * verdict. While a build is running there is nothing to verify yet, so the pill
   * keeps showing the previous artifact rather than a half-built one.
   */
  const status = useMemo(() => {
    if (!artifact) return null;
    return engineStatus({
      record: artifact.patient.name,
      origin: 'builder',
      graph: artifact.graph,
      derivations: artifact.derivations,
      documents: artifact.inputs,
      rulesEvaluated: RULE_REGISTRY.length,
      elapsedMs: artifact.elapsedMs,
    });
  }, [artifact]);

  /**
   * The runs made in this session, newest first.
   *
   * Kept so two of them can be compared. Deduplicated by identity, because
   * rebuilding the same record is the same run and comparing it with itself
   * would tell a reader nothing.
   */
  const [runs, setRuns] = useState<ComparableRun[]>([]);
  /** True once the comparison set has come from the registry rather than this session. */
  const [crossSession, setCrossSession] = useState(false);
  /** The branch currently being run, if any, shown above the preview. */
  const [branchNote, setBranchNote] = useState<string | null>(null);

  useEffect(() => {
    if (!artifact) return;
    const entry: ComparableRun = {
      label: `${artifact.scenarioLabel} · ${artifact.patient.name}`,
      identity: artifact.identity,
      derivations: artifact.derivations,
    };
    setRuns((previous) =>
      [entry, ...previous.filter((run) => run.identity.id !== entry.identity.id)].slice(0, 6),
    );
  }, [artifact]);

  /**
   * The diagrams in the pipeline section are derived inside that section, from
   * the same artifact the preview reads.
   */

  return (
    <div className="builder">
      <header className="bnav">
        <div className="bnav-brand">
          <span className="bnav-mark" aria-hidden="true" />
          <span className="bnav-name">Medical Memory</span>
        </div>
        <nav className="bnav-links" aria-label="Builder sections">
          {status && (
            <EngineStatusPill status={status} onOpen={() => setInspecting(true)} compact />
          )}
          <div className="bnav-tabs" role="tablist">
            <button
              type="button"
              className="bnav-link"
              role="tab"
              onClick={() => scrollToElement(document.querySelector('.scrollstory'))}
            >
              Pipeline
            </button>
            <button
              type="button"
              className="bnav-link"
              role="tab"
              onClick={() => setView('guide')}
            >
              How it works
            </button>
            <button
              type="button"
              className="bnav-link"
              role="tab"
              onClick={() => scrollToElement(document.querySelector('.gallery'))}
            >
              Examples
            </button>
          </div>
          <button type="button" className="bnav-cta" onClick={onEnterWorkspace}>
            Open workspace
          </button>
        </nav>
      </header>

      <div ref={heroRef}>
        <BuilderHero
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={() => runBuild(prompt, attachments)}
          onPickSuggestion={startBuild}
          suggestions={PROMPT_SUGGESTIONS}
          state={build}
          busy={busy}
          attachments={attachments}
          rejections={rejections}
          onFiles={(files) => void handleFiles(files)}
          onRemoveAttachment={removeAttachment}
          onRetypeAttachment={retype}
          onDismissRejection={dismissRejection}
          onClearAttachments={clearAttachments}
        />
      </div>

      <Suspense fallback={<div className="scrollstory-fallback" />}>
        <Scrollytelling artifact={artifact} />
      </Suspense>

      <section className="explain-section">
        <div className="explain-section-head">
          <div className="explain-eyebrow">Ask the artifact</div>
          <h2 className="explain-section-title">The AI explains the evidence. The evidence decides the finding.</h2>
          <p className="explain-section-sub">
            An explainer is handed a graph, the findings over it, and a question. It is never handed
            a bare question, and it has no way to add a finding — the shape of an answer here is
            prose about derivations that already exist, with the spans underneath.
          </p>
        </div>

        <Suspense
          fallback={<div className="explain explain-loading">Loading the explainer</div>}
        >
          <ExplainChat
            artifact={artifact}
            onOpenChat={() => setView('chat')}
            onOpenEvidence={(factIds, docIds) => {
              if (factIds.length === 0) return;
              openEvidence({
                title: 'Cited by the explainer',
                subtitle: `${factIds.length} statement${factIds.length === 1 ? '' : 's'}, with their spans`,
                factIds,
                docId: docIds[0],
              });
            }}
          />
        </Suspense>
      </section>

      <section className="explain-section">
        <div className="explain-section-head">
          <div className="explain-eyebrow">Research branches</div>
          <h2 className="explain-section-title">What changed, and which proof caused it</h2>
          <p className="explain-section-sub">
            Duplicate a run with one thing changed — a rule withheld, an earlier evaluation date, one
            more document — and compare it with the original. Every branch offered here is one this
            build can actually execute, and the lineage is recorded on the artifact rather than
            inferred later.
          </p>
        </div>

        <Suspense fallback={<div className="explain explain-loading">Loading branches</div>}>
          <BranchPanel artifact={artifact} onBranch={runBranch} />
        </Suspense>

        {artifact?.branch && (
          <p className="explain-section-note">
            {branchNote ? `${branchNote} — ` : ''}this run is recorded as a branch of{' '}
            <code title={artifact.branch.parentId}>{shortAddress(artifact.branch.parentId)}</code>
            {artifact.branch.reason ? `, ${artifact.branch.reason}` : ''}. The lineage is written on
            the artifact, so it survives being saved.
          </p>
        )}
      </section>

      <section className="explain-section">
        <div className="explain-section-head">
          <div className="explain-eyebrow">Saved runs</div>
          <h2 className="explain-section-title">A registry of results, not of numbers</h2>
          <p className="explain-section-sub">
            A run is stored as its identity, the corpus it read and what it claimed. The graph is
            re-derived when the run is opened, so a saved result cannot drift from its sources — and
            two runs from different days can be compared, which a session-local history could never
            do.
          </p>
        </div>

        <Suspense fallback={<div className="explain explain-loading">Loading the registry</div>}>
          <RunsPanel
            artifact={artifact}
            prompt={prompt}
            onOpen={openRun}
            onCompare={compareStored}
          />
        </Suspense>
      </section>

      <section className="explain-section">
        <div className="explain-section-head">
          <div className="explain-eyebrow">Compare runs</div>
          <h2 className="explain-section-title">Rule evolution, made inspectable</h2>
          <p className="explain-section-sub">
            Two runs, compared at the level of the proof. When a finding moves, both sides are shown
            — the rule that fired, the premises it rested on, the confidence that came out — so a
            difference in a result can be traced to a difference in the reasoning.
          </p>
          {crossSession && (
            <p className="explain-section-note">
              Both runs were re-derived from stored corpora, so this comparison spans sessions rather
              than the runs made on this page.
            </p>
          )}
        </div>

        <Suspense fallback={<div className="explain explain-loading">Loading the comparison</div>}>
          <RunCompare runs={runs} />
        </Suspense>
      </section>

      <CapabilityStrip />

      <ExampleGallery
        disabled={busy}
        onChoose={(text) => {
          startBuild(text);
          scrollToHero();
        }}
      />

      <InfrastructureSection />

      <BuildCTA
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={() => {
          void runBuild(prompt, attachments);
          scrollToHero();
        }}
        onEnterWorkspace={onEnterWorkspace}
        busy={busy}
        summary={
          artifact
            ? {
                documents: artifact.documents.length,
                facts: artifact.facts.length,
                derivations: artifact.derivations.length,
              }
            : null
        }
      />

      {inspecting && status && artifact && (
        <ArtifactInspector
          status={status}
          graph={artifact.graph}
          derivations={artifact.derivations}
          steps={build.steps}
          interop={artifact.interop}
          onReproduce={() => reproduceArtifact(artifact).report}
          onClose={() => setInspecting(false)}
        />
      )}
    </div>
  );
}
