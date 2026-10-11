import { useMemo, useState } from 'react';
import {
  compareRuns,
  comparisonHeadline,
  type ComparableRun,
  type FindingStatus,
  type ProofSide,
} from '../../engine/compare';
import { STEP_KIND_LABEL } from '../../engine/derive/types';
import { Icon } from '../Icon';

/* ------------------------------------------------------------------ */
/* Compare runs                                                        */
/*                                                                    */
/* A count is not an explanation. This surface reports every difference */
/* at the level of the proof: which rule fired, over which premises,    */
/* with which confidence — and when a finding moved, both sides are     */
/* shown rather than summarised.                                        */
/*                                                                    */
/* Rule evolution becomes inspectable here. A version of the engine     */
/* that changes how a rule reasons produces a visible difference in the */
/* proof, not just a different number.                                  */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<FindingStatus, string> = {
  added: 'added',
  removed: 'removed',
  changed: 'changed',
  same: 'unchanged',
};

interface RunCompareProps {
  runs: ComparableRun[];
}

export function RunCompare({ runs }: RunCompareProps) {
  const [leftId, setLeftId] = useState<string | null>(runs[1]?.identity.id ?? null);
  const [rightId, setRightId] = useState<string | null>(runs[0]?.identity.id ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const [showSame, setShowSame] = useState(false);

  const left = runs.find((entry) => entry.identity.id === leftId) ?? runs[1] ?? runs[0] ?? null;
  const right = runs.find((entry) => entry.identity.id === rightId) ?? runs[0] ?? null;

  const comparison = useMemo(
    () => (left && right ? compareRuns(left, right) : null),
    [left, right],
  );

  if (runs.length < 2 || !left || !right || !comparison) {
    return (
      <div className="runcmp-empty">
        <Icon.Reset size={15} />
        <div>
          <strong>Two runs are needed to compare.</strong>
          <p>
            Every build you make is kept here with its identity. Build a second one — a different
            prompt, a different record, or the same record again — and the differences appear at the
            level of the proof.
          </p>
        </div>
      </div>
    );
  }

  const visible = showSame
    ? comparison.findings
    : comparison.findings.filter((finding) => finding.status !== 'same');

  return (
    <div className="runcmp">
      <div className="runcmp-pickers">
        <Picker label="Run A" runs={runs} value={left.identity.id} onChange={setLeftId} />
        <span className="runcmp-arrow" aria-hidden="true">
          →
        </span>
        <Picker label="Run B" runs={runs} value={right.identity.id} onChange={setRightId} />
      </div>

      <div className="runcmp-headline">{comparisonHeadline(comparison)}</div>

      <div className="runcmp-axes">
        <Axis
          label="Record"
          same={comparison.corpus.same}
          a={left.identity.corpusHash}
          b={right.identity.corpusHash}
        />
        <Axis
          label="Rule set"
          same={comparison.ruleset.same}
          a={left.identity.rulesetVersion}
          b={right.identity.rulesetVersion}
        />
        <Axis
          label="Engine"
          same={comparison.engine.same}
          a={left.identity.engineVersion}
          b={right.identity.engineVersion}
        />
      </div>

      <div className="runcmp-counts">
        <Count label="added" value={comparison.counts.added} tone="added" />
        <Count label="removed" value={comparison.counts.removed} tone="removed" />
        <Count label="changed" value={comparison.counts.changed} tone="changed" />
        <Count label="unchanged" value={comparison.counts.same} tone="same" />
      </div>

      {comparison.engine.delta && (
        <div className="runcmp-delta">
          <div className="runcmp-delta-head">
            <span className="mono">
              {comparison.engine.delta.from} → {comparison.engine.delta.to}
            </span>
            {comparison.engine.delta.breaking && <span className="runcmp-breaking">breaking</span>}
          </div>
          {comparison.engine.delta.releases.map((release) => (
            <div className="runcmp-release" key={release.version}>
              <span className="mono runcmp-release-version">{release.version}</span>
              <span className="runcmp-release-summary">{release.summary}</span>
            </div>
          ))}
        </div>
      )}

      {comparison.notes.map((note, index) => (
        <div className="runcmp-note" key={index}>
          {note}
        </div>
      ))}

      <div className="runcmp-list-head">
        <span className="runcmp-list-title">Findings</span>
        <button
          type="button"
          className={`chip is-button${showSame ? ' is-ok' : ' is-muted'}`}
          onClick={() => setShowSame((value) => !value)}
        >
          {showSame ? 'hide unchanged' : `show ${comparison.counts.same} unchanged`}
        </button>
      </div>

      <div className="runcmp-list">
        {visible.length === 0 && (
          <div className="runcmp-none">
            Nothing differs. Every finding, its rule, its severity and its confidence are unchanged.
          </div>
        )}

        {visible.map((finding) => (
          <div className={`runcmp-finding is-${finding.status}`} key={finding.id}>
            <button
              type="button"
              className="runcmp-finding-head"
              onClick={() => setOpen(open === finding.id ? null : finding.id)}
              aria-expanded={open === finding.id}
            >
              <span className={`runcmp-status is-${finding.status}`}>
                {STATUS_LABEL[finding.status]}
              </span>
              <span className="runcmp-finding-title">{finding.title}</span>
              <span className="mono runcmp-finding-rule">{finding.ruleId}</span>
            </button>

            {finding.changes.length > 0 && (
              <ul className="runcmp-changes">
                {finding.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            )}

            {open === finding.id && (
              <div className="runcmp-proof">
                <ProofColumn side={finding.before} label={left.label} />
                <ProofColumn side={finding.after} label={right.label} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Pieces ------------------------------ */

function Picker({
  label,
  runs,
  value,
  onChange,
}: {
  label: string;
  runs: ComparableRun[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="runcmp-picker">
      <span className="runcmp-picker-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {runs.map((run) => (
          <option value={run.identity.id} key={run.identity.id}>
            {run.label} · {run.identity.id} · {run.derivations.length} findings
          </option>
        ))}
      </select>
    </label>
  );
}

/** One axis of comparison: the same, or different and by how much. */
function Axis({ label, same, a, b }: { label: string; same: boolean; a: string; b: string }) {
  return (
    <div className={`runcmp-axis${same ? ' is-same' : ' is-different'}`}>
      <span className="runcmp-axis-label">{label}</span>
      <span className="runcmp-axis-mark">{same ? '=' : '≠'}</span>
      <span className="mono runcmp-axis-values">
        {same ? a : `${a} → ${b}`}
      </span>
    </div>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: FindingStatus;
}) {
  return (
    <div className={`runcmp-count is-${tone}${value === 0 ? ' is-zero' : ''}`}>
      <span className="runcmp-count-value mono">{value}</span>
      <span className="runcmp-count-label">{label}</span>
    </div>
  );
}

/**
 * One side of a proof.
 *
 * Shown in full — rule, severity, grade, confidence, every step with its
 * justification — because the point of the comparison is that a difference in a
 * result can be traced to a difference in the reasoning.
 */
function ProofColumn({ side, label }: { side: ProofSide | null; label: string }) {
  if (!side) {
    return (
      <div className="runcmp-side is-absent">
        <div className="runcmp-side-head">{label}</div>
        <div className="runcmp-side-absent">No proof on this side.</div>
      </div>
    );
  }

  return (
    <div className="runcmp-side">
      <div className="runcmp-side-head">{label}</div>
      <div className="runcmp-side-facts">
        <span className="mono runcmp-side-rule">{side.ruleId}</span>
        <span className={`chip is-button is-${side.severity === 'high' ? 'critical' : side.severity === 'medium' ? 'warn' : 'muted'}`}>
          {side.severity}
        </span>
        <span className="dim">grade {side.grade}</span>
        <span className="mono dim">conf {side.confidence.toFixed(4)}</span>
        <span className="mono dim">{side.factCount} premises</span>
      </div>
      <ol className="runcmp-side-steps">
        {side.steps.map((step, index) => (
          <li key={index}>
            <span className="runcmp-side-kind">{STEP_KIND_LABEL[step.kind]}</span>
            <span className="runcmp-side-label">{step.label}</span>
            <span className="runcmp-side-just">{step.justification}</span>
          </li>
        ))}
      </ol>
      <div className="runcmp-side-not">{side.notConcluded}</div>
    </div>
  );
}
