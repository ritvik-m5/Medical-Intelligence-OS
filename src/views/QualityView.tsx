import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, MetricCard, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import { GRADE_LABEL } from '../engine/derive/types';
import { plural } from '../lib/format';
import { downloadText } from '../lib/download';
import type { AuditKind } from '../engine/derive/types';

/* ------------------------------------------------------------------ */
/* Record quality and audit                                            */
/*                                                                    */
/* A scorecard about the documents, not the patient, plus the audit log */
/* of everything this session did. Both exist for the same reason: a    */
/* platform that cannot describe the quality of its own inputs, or its  */
/* own behaviour, is not auditable.                                     */
/* ------------------------------------------------------------------ */

const AUDIT_TONE: Record<string, string> = {
  ingest: 'ok',
  derive: 'info',
  query: 'info',
  export: 'external',
  redact: 'warn',
  view: 'muted',
  reset: 'warn',
};

export function QualityView() {
  const { quality, graph, derivations, audit, exportAudit, clearAudit } = useStore();
  const [kind, setKind] = useState<AuditKind | 'all'>('all');
  const [exportNote, setExportNote] = useState<string | null>(null);

  const weakest = [...quality.dimensions].sort((a, b) => a.score - b.score).slice(0, 3);

  /** The kinds actually present, so the filter never offers an empty list. */
  const kinds = useMemo(() => {
    const counts = new Map<AuditKind, number>();
    for (const entry of audit) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [audit]);

  const shown = useMemo(
    () => (kind === 'all' ? audit : audit.filter((entry) => entry.kind === kind)),
    [audit, kind],
  );

  const runExport = () => {
    const ok = downloadText('medical-memory-audit.json', exportAudit());
    setExportNote(
      ok
        ? `Exported ${audit.length} entries.`
        : 'This environment does not allow a download; the log is unchanged.',
    );
  };

  return (
    <div className="view-inner">
      <div className="grid grid-4">
        <MetricCard
          label="Overall"
          value={quality.overall}
          tone={quality.overall >= 85 ? 'ok' : quality.overall >= 70 ? 'warn' : 'critical'}
          sub={GRADE_LABEL[quality.grade]}
        />
        <MetricCard label="Documents" value={graph.documents.length} sub="imported" />
        <MetricCard label="Facts" value={graph.facts.length} sub={`${graph.stats.flaggedFacts} flagged`} />
        <MetricCard label="Findings" value={derivations.length} sub="derivations" />
      </div>

      <Panel
        title="Record quality scorecard"
        sub="Nine dimensions, each one a statement about the documents rather than the patient"
      >
        <div className="notice">
          <Icon.Warning size={15} />
          <div>
            <strong>A low score means the record is hard to reason over, not that care was poor.</strong>{' '}
            A sparse record and a well-kept record can describe identical care and score very
            differently. Read each dimension as a property of the documentation.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          {quality.dimensions.map((dimension) => (
            <div key={dimension.id} className="quality-row">
              <div className="quality-head">
                <span className="quality-label">{dimension.label}</span>
                <span
                  className="mono quality-score"
                  style={{
                    color:
                      dimension.score >= 85
                        ? 'var(--ok)'
                        : dimension.score >= 70
                          ? 'var(--medium)'
                          : 'var(--high)',
                  }}
                >
                  {dimension.score}
                </span>
              </div>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{
                    width: `${dimension.score}%`,
                    background:
                      dimension.score >= 85
                        ? 'linear-gradient(90deg, var(--accent), var(--accent-2))'
                        : dimension.score >= 70
                          ? 'var(--medium)'
                          : 'var(--high)',
                  }}
                />
              </div>
              <div className="quality-detail">{dimension.detail}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Where this record is weakest" sub="The three lowest-scoring dimensions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {weakest.map((dimension) => (
            <div key={dimension.id} className="answer-item">
              <div className="answer-item-label">
                <span className="dot warn" />
                <span>{dimension.label}</span>
                <Chip tone="warn">{dimension.score}/100</Chip>
              </div>
              <div className="answer-item-sub">{dimension.detail}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Audit log"
        sub={`${plural(audit.length, 'recorded action')} · append-only, stored locally`}
      >
        {audit.length === 0 ? (
          <div className="empty">
            Nothing recorded yet. Importing, asking and opening evidence all append here.
          </div>
        ) : (
          <>
            <div className="audit-controls">
              <button
                type="button"
                className={`chip is-button${kind === 'all' ? ' is-ok' : ' is-muted'}`}
                onClick={() => setKind('all')}
              >
                all {audit.length}
              </button>
              {kinds.map(([entryKind, count]) => (
                <button
                  key={entryKind}
                  type="button"
                  className={`chip is-button${kind === entryKind ? ' is-ok' : ' is-muted'}`}
                  onClick={() => setKind(entryKind)}
                >
                  {entryKind} {count}
                </button>
              ))}

              <span className="audit-controls-spacer" />

              <span className="audit-count">
                {shown.length} of {audit.length}
              </span>
              <button type="button" className="chip is-button is-muted" onClick={runExport}>
                <Icon.Quote size={11} /> Export JSON
              </button>
              <button type="button" className="chip is-button is-critical" onClick={clearAudit}>
                Clear
              </button>
            </div>

            {exportNote && (
              <div className="notice" style={{ marginBottom: 12 }}>
                <Icon.Link size={15} />
                <div>{exportNote}</div>
              </div>
            )}

            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Summary</th>
                  <th style={{ textAlign: 'right' }}>Touched</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 60).map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {entry.at}
                    </td>
                    <td>
                      <Chip tone={AUDIT_TONE[entry.kind] ?? 'muted'}>{entry.kind}</Chip>
                    </td>
                    <td className="is-primary">{entry.summary}</td>
                    <td className="num mono">
                      {entry.factIds.length + entry.docIds.length || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {shown.length > 60 && (
              <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>
                Showing the most recent 60 of {shown.length}. Export to see them all.
              </div>
            )}
          </>
        )}
        <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>
          The log records what this session did. It is stored in this browser only, and it is
          deliberately not a security control — it is the evidence that one exists.
        </div>
      </Panel>
    </div>
  );
}
