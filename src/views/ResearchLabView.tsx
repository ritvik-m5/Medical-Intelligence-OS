import { useCallback, useEffect, useMemo, useState } from 'react';
import { LocalBuildBackend, reproduceArtifact } from '../builder/backend';
import { branchOptions, firedRules, requestFromRun } from '../builder/runs';
import type { BuildArtifact } from '../builder/types';
import {
  LocalArtifactStore,
  OPERATION_LABEL,
  type BranchOperation,
  type LineageGraph,
  type StoredRun,
} from '../engine/platform/artifactStore';
import { counterfactual, type CounterfactualResult } from '../engine/analysis/counterfactual';
import { stabilityReport, type BranchRun } from '../engine/analysis/stability';
import { verifyProvenance } from '../engine/verify';
import {
  BaselinePanel,
  BranchesPanel,
  DiffPanel,
  ImpactPanel,
  LineagePanel,
  QuestionsPanel,
  StabilityPanel,
} from '../components/lab/LabPanels';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';

/* ------------------------------------------------------------------ */
/* The Research Lab                                                    */
/*                                                                    */
/* One durable artifact, opened, and everything that can be asked of it */
/* without leaving the page: its branches, the proof-level differences  */
/* between them, what depends on what, how stable each finding is, and  */
/* the questions the artifact can answer.                               */
/*                                                                    */
/* Nothing here computes a number the engine did not produce. The view  */
/* orchestrates: it builds, it re-derives, and it hands the results to   */
/* the analysis modules, which are all pure.                            */
/* ------------------------------------------------------------------ */

type LabTab = 'baseline' | 'branches' | 'diff' | 'impact' | 'stability' | 'questions' | 'lineage';

const TABS: Array<{ id: LabTab; label: string }> = [
  { id: 'baseline', label: 'Baseline' },
  { id: 'branches', label: 'Branches' },
  { id: 'diff', label: 'Proof Diff' },
  { id: 'impact', label: 'Impact' },
  { id: 'stability', label: 'Stability' },
  { id: 'questions', label: 'Questions' },
  { id: 'lineage', label: 'Lineage' },
];

/** A branch that has actually been built, kept beside its stored record. */
interface LiveBranch {
  run: StoredRun;
  artifact: BuildArtifact;
  operation: BranchOperation;
  reason: string;
}

export function ResearchLabView() {
  const { setView } = useStore();
  const store = useMemo(() => new LocalArtifactStore(), []);
  const backend = useMemo(() => new LocalBuildBackend({ pace: 0 }), []);

  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [status, setStatus] = useState('Loading the registry.');
  const [baseline, setBaseline] = useState<{ run: StoredRun; artifact: BuildArtifact } | null>(null);
  const [branches, setBranches] = useState<LiveBranch[]>([]);
  const [lineage, setLineage] = useState<LineageGraph | null>(null);
  const [tab, setTab] = useState<LabTab>('baseline');
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const listing = await store.list();
    setRuns(listing.runs);
    setStatus(listing.message);
    setLineage(await store.lineage());
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Open a stored artifact.
   *
   * Re-derived from its own corpus, then checked against what it claimed. The
   * verdict is shown rather than assumed, because the whole point of a stored run
   * is that the claim is testable.
   */
  const open = useCallback(
    async (run: StoredRun) => {
      setBusy(true);
      setMessage(null);
      try {
        const rebuilt = await backend.run(requestFromRun(run), () => {});
        const { report } = reproduceArtifact(rebuilt);
        setBaseline({ run, artifact: rebuilt });
        setBranches([]);
        setFocus(null);
        setTab('baseline');
        setVerdict(
          report.status === 'identical'
            ? `${run.identity.id} re-derived from its own documents and reproduces exactly.`
            : `${run.identity.id} re-derived, but does not match the saved result: ${report.notes[0] ?? report.status}`,
        );
      } catch (error) {
        setMessage(`Could not open ${run.identity.id}: ${String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [backend],
  );

  /**
   * Run a branch.
   *
   * The request carries the parent's content address and the operation, so the
   * lineage is written on the artifact rather than remembered by this component.
   */
  const runBranch = useCallback(
    async (operation: BranchOperation, change: Record<string, unknown>, reason: string) => {
      if (!baseline) return;
      setBusy(true);
      setMessage(null);
      try {
        const built = await backend.run(
          {
            prompt: baseline.artifact.scenarioLabel,
            attachments: baseline.artifact.inputs,
            suppressRules: baseline.artifact.suppressedRules,
            withholdDocuments: baseline.artifact.withheldDocuments,
            asOf: baseline.artifact.asOf,
            ...change,
            branch: { parentId: baseline.run.artifactId, operation, reason },
          },
          () => {},
        );

        const stored = await store.save({
          ...baseline.run,
          artifactId: built.identity.artifactId,
          identity: built.identity,
          createdAt: new Date().toISOString(),
          label: `${baseline.run.label} · ${OPERATION_LABEL[operation]}`,
          suppressedRules: built.suppressedRules,
          withheldDocuments: built.withheldDocuments,
          asOf: built.asOf,
          findings: built.derivations.map((derivation) => ({
            id: derivation.id,
            ruleId: derivation.ruleId,
            title: derivation.title,
            severity: derivation.severity,
            confidence: derivation.confidence,
          })),
          branch: { parentId: baseline.run.artifactId, operation, reason },
        });

        setBranches((previous) => [
          ...previous.filter((entry) => entry.run.artifactId !== built.identity.artifactId),
          { run: { ...baseline.run, artifactId: built.identity.artifactId, identity: built.identity }, artifact: built, operation, reason },
        ]);
        setMessage(
          stored.ok
            ? `${reason}. ${built.derivations.length} findings, recorded as a branch of ${baseline.run.identity.id}.`
            : stored.message,
        );
        await refresh();
      } catch (error) {
        setMessage(`The branch could not be run: ${String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [baseline, backend, refresh, store],
  );

  const rerunStored = useCallback(
    async (run: StoredRun) => {
      if (!baseline) return;
      setBusy(true);
      try {
        const built = await backend.run(requestFromRun(run), () => {});
        setBranches((previous) => [
          ...previous.filter((entry) => entry.run.artifactId !== run.artifactId),
          {
            run,
            artifact: built,
            operation: run.branch.operation,
            reason: run.branch.reason ?? run.label,
          },
        ]);
        setMessage(`${run.identity.id} opened as a branch of ${baseline.run.identity.id}.`);
      } finally {
        setBusy(false);
      }
    },
    [baseline, backend],
  );

  /* ------------------------------------------------------------------ */
  /* Derived state                                                       */
  /* ------------------------------------------------------------------ */

  const artifact = baseline?.artifact ?? null;

  const verification = useMemo(
    () => (artifact ? verifyProvenance(artifact.graph, artifact.derivations) : null),
    [artifact],
  );

  /** Branch runs in the shape the stability profiler wants. */
  const branchRuns: BranchRun[] = useMemo(
    () =>
      branches.map((entry) => ({
        label: entry.run.identity.id,
        operation: entry.operation,
        derivations: entry.artifact.derivations,
      })),
    [branches],
  );

  const stability = useMemo(
    () => (artifact ? stabilityReport(artifact.derivations, artifact.graph, branchRuns) : null),
    [artifact, branchRuns],
  );

  const chosen = useMemo(
    () => branches.find((entry) => entry.run.artifactId === focus) ?? branches[0] ?? null,
    [branches, focus],
  );

  /**
   * The counterfactual for the chosen branch.
   *
   * Always labelled, always carrying what the engine declines to claim, and only
   * ever built from a branch that was really run.
   */
  const counterfactuals: CounterfactualResult[] = useMemo(() => {
    if (!artifact || branches.length === 0) return [];
    return branches.map((entry) => {
      const intervention =
        entry.operation === 'withhold-rule'
          ? { kind: 'withhold-rule' as const, ruleId: entry.artifact.suppressedRules[0] ?? '' }
          : entry.operation === 'withhold-document'
            ? {
                kind: 'withhold-document' as const,
                docId:
                  artifact.graph.documents.find((doc) =>
                    entry.artifact.withheldDocuments.includes(doc.title),
                  )?.id ?? '',
              }
            : entry.operation === 'as-of'
              ? { kind: 'as-of' as const, date: entry.artifact.asOf }
              : { kind: 'add-document' as const, title: entry.reason };

      return counterfactual(
        intervention,
        { identity: artifact.identity.id, graph: artifact.graph, derivations: artifact.derivations },
        {
          identity: entry.artifact.identity.id,
          graph: entry.artifact.graph,
          derivations: entry.artifact.derivations,
        },
        { courses: artifact.courses, spans: artifact.spans },
      );
    });
  }, [artifact, branches]);

  const optionList = useMemo(() => (artifact ? branchOptions(artifact) : []), [artifact]);
  const rules = useMemo(() => (artifact ? firedRules(artifact) : []), [artifact]);

  if (!artifact) {
    return (
      <div className="lab">
        <header className="lab-head">
          <div>
            <div className="lab-eyebrow">Research Lab</div>
            <h1 className="lab-title">Open an artifact</h1>
            <p className="lab-sub">
              A branch, a diff or a counterfactual needs something to branch from. Save a run in the
              builder and it will appear here.
            </p>
          </div>
        </header>

        <div className="lab-empty">
          <p>{status}</p>
          <button type="button" className="lab-btn" onClick={() => setView('builder')}>
            <Icon.Build size={13} />
            Go to the builder
          </button>
        </div>

        <ul className="lab-picker">
          {runs.map((run) => (
            <li key={run.artifactId}>
              <button type="button" className="lab-pick" onClick={() => void open(run)} disabled={busy}>
                <span className="lab-pick-label">{run.label}</span>
                <code>{run.identity.id}</code>
                <span className="lab-pick-meta">
                  {run.findings.length} findings · {run.documents.length} documents · engine{' '}
                  {run.identity.engineVersion}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="lab">
      <header className="lab-head">
        <div className="lab-head-main">
          <div className="lab-eyebrow">Research Lab</div>
          <h1 className="lab-title">
            <code>{artifact.identity.id}</code>
            <span className="lab-title-note">{baseline!.run.label}</span>
          </h1>
          <div className="lab-strip">
            <span className="lab-chip">
              engine <code>{artifact.identity.engineVersion}</code>
            </span>
            <span className="lab-chip">
              {artifact.identity.ruleCount} rules{' '}
              <code className="lab-chip-hash" title={artifact.identity.rulesetVersion}>
                {artifact.identity.rulesetVersion.slice(0, 10)}
              </code>
            </span>
            <span className="lab-chip">
              corpus{' '}
              <code title={artifact.identity.corpusHash}>
                {artifact.identity.corpusHash.slice(0, 10)}
              </code>
            </span>
            {verification && (
              <span className={`lab-chip is-${verification.clean ? 'ok' : 'warn'}`}>
                verification {verification.score}/100
                {verification.clean ? ' · clean' : ' · problems'}
              </span>
            )}
          </div>
          <div className="lab-address" title={artifact.identity.artifactId}>
            content address <code>{artifact.identity.artifactId}</code>
          </div>
        </div>

        <div className="lab-head-side">
          <button type="button" className="lab-btn is-quiet" onClick={() => setBaseline(null)}>
            <Icon.Records size={13} />
            Another artifact
          </button>
          <button type="button" className="lab-btn is-quiet" onClick={() => setView('builder')}>
            <Icon.Build size={13} />
            Builder
          </button>
        </div>
      </header>

      {verdict && (
        <p className="lab-verdict">
          <Icon.Check size={13} />
          {verdict}
        </p>
      )}
      {message && <p className="lab-message">{message}</p>}

      <nav className="lab-tabs" aria-label="Research areas">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`lab-tab${tab === entry.id ? ' is-active' : ''}`}
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
          >
            {entry.label}
            {entry.id === 'branches' && branches.length > 0 && (
              <span className="lab-tab-count">{branches.length}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'baseline' && <BaselinePanel artifact={artifact} verification={verification} />}

      {tab === 'branches' && (
        <BranchesPanel
          artifact={artifact}
          branches={branches}
          optionList={optionList}
          rules={rules}
          busy={busy}
          onRun={(operation, change, reason) => void runBranch(operation, change, reason)}
          onFocus={(artifactId) => {
            setFocus(artifactId);
            setTab('diff');
          }}
        />
      )}

      {tab === 'diff' && (
        <DiffPanel artifact={artifact} chosen={chosen} counterfactuals={counterfactuals} />
      )}

      {tab === 'impact' && <ImpactPanel artifact={artifact} branches={branches} />}

      {tab === 'stability' && <StabilityPanel stability={stability} />}

      {tab === 'questions' && (
        <QuestionsPanel artifact={artifact} branchRuns={branchRuns} other={chosen} />
      )}

      {tab === 'lineage' && (
        <LineagePanel
          lineage={lineage}
          runs={runs}
          focusId={artifact.identity.artifactId}
          onOpen={(run) => void rerunStored(run)}
        />
      )}
    </div>
  );
}
