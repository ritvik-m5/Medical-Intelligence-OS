import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, EmptyState, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import { CONTRADICTION_LABEL, type Severity } from '../engine/types';
import { formatDate } from '../engine/text/normalize';
import { plural } from '../lib/format';

/**
 * The Medical Debugger.
 *
 * Two engines live here: the contradiction engine, which finds documents that
 * disagree with each other, and the change detector, which finds what was
 * documented differently between two dates. Neither decides anything — the
 * interface makes that explicit rather than hiding it.
 */
export function DebuggerView() {
  const { contradictions, qualityFlags, changes, openEvidence, graph } = useStore();
  const [tab, setTab] = useState<'conflicts' | 'quality' | 'changes'>('conflicts');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');

  const kinds = useMemo(
    () => Array.from(new Set(contradictions.map((c) => c.kind))).sort(),
    [contradictions],
  );
  const qualityKinds = useMemo(
    () => Array.from(new Set(qualityFlags.map((f) => f.kind))).sort(),
    [qualityFlags],
  );

  const filtered = contradictions.filter((contradiction) => {
    if (severity !== 'all' && contradiction.severity !== severity) return false;
    if (kindFilter !== 'all' && contradiction.kind !== kindFilter) return false;
    return true;
  });

  const counts = {
    high: contradictions.filter((c) => c.severity === 'high').length,
    medium: contradictions.filter((c) => c.severity === 'medium').length,
    low: contradictions.filter((c) => c.severity === 'low').length,
  };

  const realChanges = changes.filter((c) => c.kind !== 'new_document');

  return (
    <div className="view-inner">
      <Panel
        title="Medical Debugger"
        sub={`${plural(contradictions.length, 'cross-document contradiction')} · ${plural(qualityFlags.length, 'data-quality warning')} · ${plural(realChanges.length, 'documented change')} in the last 12 months`}
        actions={
          <div className="tabs">
            <button
              type="button"
              className={`tab${tab === 'conflicts' ? ' is-active' : ''}`}
              onClick={() => setTab('conflicts')}
            >
              Contradictions
            </button>
            <button
              type="button"
              className={`tab${tab === 'quality' ? ' is-active' : ''}`}
              onClick={() => setTab('quality')}
            >
              Data quality
            </button>
            <button
              type="button"
              className={`tab${tab === 'changes' ? ' is-active' : ''}`}
              onClick={() => setTab('changes')}
            >
              Change detector
            </button>
          </div>
        }
      >
        <div className="notice is-warn">
          <Icon.Warning size={15} />
          <div>
            <strong>What this engine does and does not do.</strong>{' '}
            {tab === 'quality' ? (
              <>
                Data-quality warnings are statements about the record, not disagreements between
                documents. They flag values the engine read but will not endorse — implausible
                numbers, direction markers that contradict the reported value — and never correct
                them. A warning never implies a finding is trustworthy.
              </>
            ) : (
              <>
                It detects that two documents disagree, shows both, and asks the one question that
                would resolve it. It never decides which statement is correct, never corrects a
                value, and never concludes a cause.
              </>
            )}
          </div>
        </div>

        {tab === 'conflicts' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
            <button
              type="button"
              className={`chip is-button${severity === 'all' ? ' is-ok' : ' is-muted'}`}
              onClick={() => setSeverity('all')}
            >
              all ({contradictions.length})
            </button>
            <button
              type="button"
              className={`chip is-button${severity === 'high' ? ' is-critical' : ' is-muted'}`}
              onClick={() => setSeverity('high')}
            >
              high ({counts.high})
            </button>
            <button
              type="button"
              className={`chip is-button${severity === 'medium' ? ' is-warn' : ' is-muted'}`}
              onClick={() => setSeverity('medium')}
            >
              medium ({counts.medium})
            </button>
            <button
              type="button"
              className={`chip is-button${severity === 'low' ? ' is-info' : ' is-muted'}`}
              onClick={() => setSeverity('low')}
            >
              low ({counts.low})
            </button>
            <span style={{ width: 1, background: 'var(--line)', margin: '0 4px' }} />
            <button
              type="button"
              className={`chip is-button${kindFilter === 'all' ? ' is-ok' : ' is-muted'}`}
              onClick={() => setKindFilter('all')}
            >
              every rule
            </button>
            {kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`chip is-button${kindFilter === kind ? ' is-ok' : ' is-muted'}`}
                onClick={() => setKindFilter(kind)}
              >
                {CONTRADICTION_LABEL[kind]}
              </button>
            ))}
          </div>
        )}
      </Panel>


      {tab === 'conflicts' ? (
        filtered.length === 0 ? (
          <Panel title="No contradiction matches this filter">
            <EmptyState>
              Either the record is internally consistent for these rules, or the rules found nothing
              to flag. An empty result is not proof of correctness — it means no rule fired.
            </EmptyState>
          </Panel>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((contradiction) => (
              <div key={contradiction.id} className={`conflict-card is-${contradiction.severity}`}>
                <div className="conflict-head">
                  <span
                    className={`dot ${
                      contradiction.severity === 'high'
                        ? 'critical'
                        : contradiction.severity === 'medium'
                          ? 'warn'
                          : 'info'
                    }`}
                    style={{ marginTop: 6 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="conflict-title">{contradiction.title}</div>
                    <div className="conflict-meta">
                      <Chip
                        tone={
                          contradiction.severity === 'high'
                            ? 'critical'
                            : contradiction.severity === 'medium'
                              ? 'warn'
                              : 'info'
                        }
                      >
                        {contradiction.severity}
                      </Chip>
                      <Chip tone="muted">{CONTRADICTION_LABEL[contradiction.kind]}</Chip>
                      <Chip tone="muted">
                        {formatDate(contradiction.window.start)} →{' '}
                        {formatDate(contradiction.window.end)}
                      </Chip>
                      <Chip tone="muted">{plural(contradiction.docIds.length, 'document')}</Chip>
                    </div>
                  </div>
                </div>

                <div className="conflict-detail">{contradiction.detail}</div>

                <div className="conflict-ask">
                  <strong>Ask:</strong> {contradiction.questionForClinician}
                </div>

                <div className="conflict-not">
                  <strong>Not concluded:</strong> {contradiction.notConcluded}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {contradiction.docIds.map((docId) => {
                    const doc = graph.documents.find((d) => d.id === docId);
                    if (!doc) return null;
                    return (
                      <Chip
                        key={docId}
                        tone="info"
                        onClick={() =>
                          openEvidence({
                            title: contradiction.title,
                            subtitle: doc.title,
                            factIds: contradiction.factIds.filter(
                              (id) => graph.facts.find((f) => f.id === id)?.docId === docId,
                            ),
                            docId,
                          })
                        }
                      >
                        <Icon.Quote size={10} />
                        {doc.title} · {formatDate(doc.date)}
                      </Chip>
                    );
                  })}
                  <Chip
                    tone="muted"
                    onClick={() =>
                      openEvidence({
                        title: contradiction.title,
                        subtitle: 'All sources',
                        factIds: contradiction.factIds,
                      })
                    }
                  >
                    All {contradiction.factIds.length} statements
                  </Chip>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'quality' ? (
        <Panel
          title="Data-quality warnings"
          sub={`${plural(qualityFlags.length, 'warning')} — the engine reports what it read and never corrects it`}
        >
          {qualityFlags.length === 0 ? (
            <EmptyState>
              Nothing flagged. That does not mean the record is right — only that no rule fired.
            </EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                {qualityKinds.map((kind) => (
                  <Chip key={kind} tone="muted">
                    {CONTRADICTION_LABEL[kind]}
                  </Chip>
                ))}
              </div>
              {qualityFlags.map((flag, index) => (
                <div
                  key={`${flag.kind}-${flag.entityKey ?? 'none'}-${index}`}
                  className={`conflict-card is-${flag.severity}`}
                >
                  <div className="conflict-head">
                    <span
                      className={`dot ${
                        flag.severity === 'high' ? 'critical' : flag.severity === 'medium' ? 'warn' : 'info'
                      }`}
                      style={{ marginTop: 6 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="conflict-title">{flag.title}</div>
                      <div className="conflict-meta">
                        <Chip
                          tone={flag.severity === 'high' ? 'critical' : flag.severity === 'medium' ? 'warn' : 'info'}
                        >
                          {flag.severity}
                        </Chip>
                        <Chip tone="muted">{CONTRADICTION_LABEL[flag.kind]}</Chip>
                        <Chip tone="muted">warning, not a contradiction between documents</Chip>
                      </div>
                    </div>
                  </div>

                  <div className="conflict-detail">{flag.detail}</div>

                  <div className="conflict-ask">
                    <strong>Ask:</strong> {flag.question}
                  </div>

                  <div className="conflict-not">
                    <strong>Not concluded:</strong> {flag.notConcluded}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {flag.facts.map((fact) => {
                      const doc = graph.documents.find((d) => d.id === fact.docId);
                      if (!doc) return null;
                      return (
                        <Chip
                          key={fact.id}
                          tone="info"
                          onClick={() =>
                            openEvidence({
                              title: flag.title,
                              subtitle: doc.title,
                              factIds: [fact.id],
                              docId: doc.id,
                            })
                          }
                        >
                          <Icon.Quote size={10} />
                          {doc.title} · {formatDate(doc.date)}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        <Panel
          title="Documented change, last 12 months"
          sub="Each entry says what the documents establish and what they do not"
        >
          {realChanges.length === 0 ? (
            <EmptyState>Nothing changed in that window.</EmptyState>
          ) : (
            <div className="tl">
              {realChanges.map((change) => (
                <div className="tl-row" key={change.id}>
                  <div className="tl-date">{formatDate(change.toDate)}</div>
                  <div className="tl-marker">
                    <span
                      className={`tl-dot is-${
                        change.kind === 'status_changed'
                          ? 'warn'
                          : change.kind === 'removed'
                            ? 'critical'
                            : 'ok'
                      }`}
                    />
                  </div>
                  <div
                    className="tl-body"
                    onClick={() =>
                      openEvidence({
                        title: change.entityLabel,
                        subtitle: change.kind.replace(/_/g, ' '),
                        factIds: [change.toFactId, change.fromFactId].filter((x): x is string =>
                          Boolean(x),
                        ),
                      })
                    }
                  >
                    <div className="tl-title">
                      {change.deltaText}
                      <Chip tone="muted">{change.kind.replace(/_/g, ' ')}</Chip>
                      <Chip tone="muted">{change.factType}</Chip>
                    </div>
                    <div className="tl-sub">Caveat: {change.caveat}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
