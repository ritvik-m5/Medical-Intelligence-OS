import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, EmptyState, Panel } from '../components/Panel';
import { diffSnapshots, snapshotAt } from '../engine/timeline';
import { addDays, formatDate } from '../engine/text/normalize';
import { plural } from '../lib/format';
import { SnapshotPanel } from '../components/SnapshotPanel';

/**
 * The Medical Time Machine.
 *
 * Two pins, two reconstructions of the record, and the documented difference
 * between them. The point is that the earlier panel is not a filter over today's
 * data — it is what the documents actually said at that moment.
 */
export function TimeMachineView() {
  const { graph, asOf, openEvidence, setAsOf } = useStore();
  const [fromDate, setFromDate] = useState(() => addDays(asOf, -366));
  const [toDate, setToDate] = useState(asOf);

  const before = useMemo(() => snapshotAt(graph, fromDate), [graph, fromDate]);
  const after = useMemo(() => snapshotAt(graph, toDate), [graph, toDate]);
  const changes = useMemo(
    () => diffSnapshots(before, after).filter((c) => c.kind !== 'new_document'),
    [before, after],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof changes>();
    for (const change of changes) {
      const list = groups.get(change.kind);
      if (list) list.push(change);
      else groups.set(change.kind, [change]);
    }
    return Array.from(groups.entries());
  }, [changes]);

  const presets: Array<{ label: string; apply: () => void }> = [
    { label: 'Last 12 months', apply: () => setFromDate(addDays(toDate, -366)) },
    { label: 'Whole record', apply: () => setFromDate(graph.stats.spanStart) },
    {
      label: 'Around the statin stop',
      apply: () => {
        setFromDate('2025-01-01');
        setToDate('2025-09-30');
      },
    },
    {
      label: 'Before metformin',
      apply: () => {
        setFromDate(graph.stats.spanStart);
        setToDate('2024-11-01');
      },
    },
  ];

  return (
    <div className="view-inner">
      <Panel
        title="Choose two moments in the record"
        sub="Every panel below is reconstructed only from documents dated on or before the pin"
        actions={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {presets.map((preset) => (
              <button key={preset.label} type="button" className="btn is-sm" onClick={preset.apply}>
                {preset.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-2">
          <div className="field">
            <label>Pin A — earlier state</label>
            <input
              type="date"
              value={fromDate}
              min={graph.stats.spanStart}
              max={toDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label>Pin B — later state</label>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={graph.stats.spanEnd}
              onChange={(event) => {
                setToDate(event.target.value);
                setAsOf(event.target.value);
              }}
            />
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Chip tone="info">
            {plural(before.totals.documents, 'document')} at A → {plural(after.totals.documents, 'document')} at B
          </Chip>
          <Chip tone="info">
            {plural(before.totals.facts, 'fact')} at A → {plural(after.totals.facts, 'fact')} at B
          </Chip>
          <Chip tone={changes.length > 0 ? 'warn' : 'ok'}>
            {plural(changes.length, 'documented change')} between A and B
          </Chip>
        </div>
      </Panel>

      <div className="grid grid-2">
        <SnapshotPanel
          snapshot={before}
          title={`State at A — ${formatDate(fromDate)}`}
          onFact={openEvidence}
        />
        <SnapshotPanel
          snapshot={after}
          title={`State at B — ${formatDate(toDate)}`}
          onFact={openEvidence}
        />
      </div>

      <Panel
        title="Documented change between A and B"
        sub="Every entry states what the documents do not establish"
      >
        {changes.length === 0 ? (
          <EmptyState>
            Nothing changed between these two dates for the concepts the engine tracks.
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {grouped.map(([kind, list]) => (
              <div key={kind}>
                <div className="section-heading">
                  <h2 style={{ fontSize: 13 }}>{kind.replace(/_/g, ' ')}</h2>
                  <Chip tone="muted">{list.length}</Chip>
                </div>
                <div className="tl" style={{ marginTop: 8 }}>
                  {list.map((change) => (
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
                            subtitle: `${change.fromValue ?? ''} → ${change.toValue ?? ''}`.trim(),
                            factIds: [change.toFactId, change.fromFactId].filter((x): x is string =>
                              Boolean(x),
                            ),
                          })
                        }
                      >
                        <div className="tl-title">
                          {change.deltaText}
                          <Chip tone="muted">{change.factType}</Chip>
                        </div>
                        <div className="tl-sub">Caveat: {change.caveat}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

