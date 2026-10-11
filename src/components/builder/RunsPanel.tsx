import { useCallback, useMemo, useState } from 'react';
import { LocalBuildBackend, reproduceArtifact } from '../../builder/backend';
import { requestFromRun, toStoredRun } from '../../builder/runs';
import type { BuildArtifact } from '../../builder/types';
import { LocalStorageBackend } from '../../engine/platform/persistence';
import { RunRegistry, type StoredRun } from '../../engine/platform/registry';
import { OPERATION_LABEL } from '../../engine/platform/artifactStore';
import type { ComparableRun } from '../../engine/compare';
import { reproductionHeadline, type ReproductionReport } from '../../engine/identity';
import { Icon } from '../Icon';

/* ------------------------------------------------------------------ */
/* Saved runs                                                          */
/*                                                                    */
/* The registry stores a result and the corpus behind it, never the     */
/* graph. So opening a run re-derives the graph and checks it against   */
/* what the run claimed, and the verdict is shown rather than assumed.  */
/*                                                                    */
/* That is the whole difference between a history and a list of numbers */
/* a history can tell you whether the thing it remembers still holds.   */
/* ------------------------------------------------------------------ */

const VERDICT: Record<ReproductionReport['status'], { label: string; tone: string }> = {
  identical: { label: 'Reproduces exactly', tone: 'ok' },
  changed: { label: 'Reproduces with differences', tone: 'warn' },
  incompatible: { label: 'Not reproducible here', tone: 'bad' },
};

interface RunsPanelProps {
  artifact: BuildArtifact | null;
  prompt: string;
  /** Called with the re-derived artifact when a saved run is opened. */
  onOpen: (artifact: BuildArtifact) => void;
  /** Called with the two runs to compare, or an empty list to clear. */
  onCompare: (runs: ComparableRun[]) => void;
}

export function RunsPanel({ artifact, prompt, onOpen, onCompare }: RunsPanelProps) {
  // Zero pace: opening a saved run is not a performance, it is a lookup.
  const backend = useMemo(() => new LocalBuildBackend({ pace: 0 }), []);
  const registry = useMemo(() => new RunRegistry(new LocalStorageBackend()), []);

  const [list, setList] = useState(() => registry.load());
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<{ artifactId: string; report: ReproductionReport } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setList(registry.load()), [registry]);

  const save = useCallback(() => {
    if (!artifact) return;
    const result = registry.save(toStoredRun(artifact, { label, prompt }));
    setMessage(result.message);
    setLabel('');
    refresh();
  }, [artifact, label, prompt, refresh, registry]);

  const remove = useCallback(
    (id: string) => {
      registry.remove(id);
      setSelected((previous) => previous.filter((entry) => entry !== id));
      setOpened((previous) => (previous?.artifactId === id ? null : previous));
      setMessage(`${id} removed.`);
      refresh();
    },
    [refresh, registry],
  );

  /**
   * Open a saved run.
   *
   * The corpus is re-ingested, the graph rebuilt, the rules run again. Nothing
   * is reused from the record except what it says it read and what it claimed.
   * Then the claim is checked.
   */
  const open = useCallback(
    async (run: StoredRun) => {
      setBusy(true);
      try {
        const rebuilt = await backend.run(requestFromRun(run), () => {});
        const { report } = reproduceArtifact(rebuilt);
        setOpened({ artifactId: run.artifactId, report });
        setMessage(
          report.status === 'identical'
            ? `${display(run)} re-derived from its own documents and matches.`
            : `${display(run)} re-derived, but does not match the saved result. See the verdict below.`,
        );
        onOpen(rebuilt);
      } catch (error) {
        setMessage(`Could not open ${display(run)}: ${String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [backend, onOpen],
  );

  /**
   * Rebuild two runs for comparison.
   *
   * Cross-session by construction: both sides come from stored corpora, so a run
   * saved last week can be compared with one built a minute ago.
   */
  const compare = useCallback(
    async (ids: string[]) => {
      const picked = ids
        .map((id) => list.runs.find((run) => run.artifactId === id))
        .filter((run): run is StoredRun => Boolean(run));
      if (picked.length !== 2) return;

      setBusy(true);
      try {
        const rebuilt: ComparableRun[] = [];
        for (const run of picked) {
          const built = await backend.run(requestFromRun(run), () => {});
          rebuilt.push({
            label: `${run.label} · ${display(run)}`,
            identity: built.identity,
            derivations: built.derivations,
          });
        }
        onCompare(rebuilt);
        setMessage(`Comparing ${display(picked[0])} with ${display(picked[1])}.`);
      } catch (error) {
        setMessage(`Could not compare: ${String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [backend, list.runs, onCompare],
  );

  const toggleSelected = useCallback(
    (id: string) => {
      setSelected((previous) => {
        if (previous.includes(id)) return previous.filter((entry) => entry !== id);
        // Two at a time: a comparison is between two things.
        const next = [...previous, id].slice(-2);
        if (next.length === 2) void compare(next);
        return next;
      });
    },
    [compare],
  );

  const runs = list.runs;
  /** The short, quotable name. The content address is the key, not the label. */
  const display = (run: StoredRun) => run.identity.id;
  /** A branch names its parent; show that parent's label when it is in the store. */
  const parentDisplay = (run: StoredRun) => {
    const parent = list.runs.find((entry) => entry.artifactId === run.branch.parentId);
    return parent ? parent.identity.id : `${(run.branch.parentId ?? '').slice(0, 12)}…`;
  };
  /** The label of the run whose verdict is on screen. */
  const openedLabel =
    list.runs.find((run) => run.artifactId === opened?.artifactId)?.identity.id ??
    (opened?.artifactId.slice(0, 12) ?? '');
  const storageUnavailable = list.status === 'empty' && list.message.includes('unavailable');

  return (
    <div className="runs">
      <div className="runs-head">
        <div>
          <h3 className="runs-title">Saved runs</h3>
          <p className="runs-sub">
            A run is stored as its identity, the corpus it read, and what it claimed. The graph is
            re-derived when it is opened, so a saved run cannot drift from its sources.
          </p>
        </div>
        <span className="runs-count">{runs.length} kept</span>
      </div>

      {storageUnavailable && (
        <div className="runs-notice is-warn">
          <Icon.Warning size={14} />
          <span>
            Storage is unavailable in this browser context. Runs will not survive a reload, and the
            system says so rather than pretending they were kept.
          </span>
        </div>
      )}

      {(list.status === 'version-mismatch' || list.status === 'corrupt') && (
        <div className="runs-notice is-bad">
          <Icon.Warning size={14} />
          <span>{list.message}</span>
        </div>
      )}

      <div className="runs-save">
        <input
          className="runs-save-input"
          type="text"
          value={label}
          placeholder={artifact ? artifact.scenarioLabel : 'Build something first'}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
          disabled={!artifact}
          aria-label="Name for this run"
        />
        <button className="runs-save-btn" type="button" onClick={save} disabled={!artifact || busy}>
          <Icon.Bookmark size={14} />
          Save run
        </button>
      </div>

      {message && <p className="runs-message">{message}</p>}

      {opened && (
        <div className={`runs-verdict is-${VERDICT[opened.report.status].tone}`}>
          {opened.report.status === 'identical' ? <Icon.Check size={14} /> : <Icon.Warning size={14} />}
          <div>
            <strong>
              {openedLabel}: {VERDICT[opened.report.status].label}
            </strong>
            <p>{reproductionHeadline(opened.report)}</p>
          </div>
        </div>
      )}

      {runs.length === 0 && !storageUnavailable && list.status !== 'corrupt' && (
        <p className="runs-empty">
          Nothing saved yet. Build a record, name it, and it will be here next time you open this
          page.
        </p>
      )}

      <ul className="runs-list">
        {runs.map((run) => {
          const isSelected = selected.includes(run.artifactId);
          return (
            <li key={run.artifactId} className={`runs-item${isSelected ? ' is-selected' : ''}`}>
              <button
                className="runs-item-select"
                type="button"
                onClick={() => toggleSelected(run.artifactId)}
                aria-pressed={isSelected}
                aria-label={`Select ${display(run)} for comparison`}
              >
                {isSelected ? <Icon.Check size={12} /> : <Icon.Circle size={12} />}
              </button>

              <div className="runs-item-body">
                <div className="runs-item-top">
                  <span className="runs-item-label">{run.label}</span>
                  <code className="runs-item-id">{display(run)}</code>
                </div>

                <div className="runs-item-meta">
                  <span>{run.patientName}</span>
                  <span className="runs-dot" />
                  <span>{run.documents.length} documents</span>
                  <span className="runs-dot" />
                  <span>{run.findings.length} findings</span>
                  <span className="runs-dot" />
                  <span>engine {run.identity.engineVersion}</span>
                  <span className="runs-dot" />
                  <span>{run.identity.ruleCount} rules</span>
                </div>

                {run.branch.operation !== 'baseline' && (
                  <div className="runs-item-branch">
                    <Icon.Branch size={12} />
                    <span>
                      {OPERATION_LABEL[run.branch.operation]} of <code>{parentDisplay(run)}</code>
                      {run.branch.reason ? ` — ${run.branch.reason}` : ''}
                    </span>
                  </div>
                )}

                <div className="runs-item-flags">
                  <span className={`runs-flag is-${run.verification.clean ? 'ok' : 'warn'}`}>
                    {run.verification.clean
                      ? `provenance clean · ${run.verification.score}/100`
                      : `provenance ${run.verification.score}/100`}
                  </span>
                  {run.suppressedRules.length > 0 && (
                    <span className="runs-flag is-warn">
                      {run.suppressedRules.length} rule
                      {run.suppressedRules.length === 1 ? '' : 's'} withheld
                    </span>
                  )}
                  <span className="runs-flag is-plain">{run.createdAt.slice(0, 10)}</span>
                </div>
              </div>

              <div className="runs-item-actions">
                <button
                  className="runs-action"
                  type="button"
                  onClick={() => void open(run)}
                  disabled={busy}
                  title="Re-derive this run from its own documents and check the result"
                >
                  <Icon.Play size={13} />
                  Open
                </button>
                <button
                  className="runs-action is-quiet"
                  type="button"
                  onClick={() => remove(run.artifactId)}
                  disabled={busy}
                  aria-label={`Delete ${display(run)}`}
                >
                  <Icon.Trash size={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {selected.length > 0 && (
        <div className="runs-tray">
          <span className="runs-tray-label">
            {selected.length === 1 ? 'Pick one more to compare' : 'Comparing'}
          </span>
          {selected.map((id) => (
            <code key={id} className="runs-tray-id">
              {id}
            </code>
          ))}
          <button
            className="runs-tray-clear"
            type="button"
            onClick={() => {
              setSelected([]);
              onCompare([]);
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
