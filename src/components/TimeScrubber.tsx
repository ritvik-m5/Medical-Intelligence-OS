import { useMemo } from 'react';
import { useStore } from '../state/store';
import { addDays, formatDate } from '../engine/text/normalize';

/**
 * The persistent Time Machine control.
 *
 * It is deliberately always visible and global: every view (overview, graph,
 * measurements, even the Ask engine) answers as of this date. A "time machine"
 * that only works on one screen is a filter, not a time machine.
 */
export function TimeScrubber() {
  const { graph, asOf, setAsOf, contradictions, changes, snapshot, setView } = useStore();

  const start = graph.stats.spanStart;
  const end = graph.stats.spanEnd;

  const { ticks, years, fraction } = useMemo(() => {
    const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
    const t0 = toTime(start);
    const t1 = toTime(end);
    const span = Math.max(1, t1 - t0);
    const position = (date: string) => {
      const raw = ((toTime(date) - t0) / span) * 100;
      return Math.max(0, Math.min(100, raw));
    };

    const tickList: Array<{ left: number; kind: 'doc' | 'event' | 'conflict'; label: string }> = [];
    for (const doc of graph.documents) {
      tickList.push({ left: position(doc.date), kind: 'doc', label: `${doc.title} (${doc.date})` });
    }
    for (const change of changes) {
      if (change.kind === 'new_document') continue;
      tickList.push({
        left: position(change.toDate),
        kind: 'event',
        label: change.deltaText,
      });
    }
    for (const conflict of contradictions) {
      tickList.push({
        left: position(conflict.window.end),
        kind: 'conflict',
        label: conflict.title,
      });
    }

    const firstYear = Number(start.slice(0, 4));
    const lastYear = Number(end.slice(0, 4));
    const yearList: Array<{ year: string; left: number; date: string }> = [];
    for (let y = firstYear; y <= lastYear; y++) {
      const jan1 = `${y}-01-01`;
      const date = jan1 < start ? start : jan1 > end ? end : jan1;
      yearList.push({ year: String(y), left: position(date), date });
    }

    return {
      ticks: tickList,
      years: yearList,
      fraction: position(asOf) / 100,
    };
  }, [graph, changes, contradictions, start, end, asOf]);

  const recordDates = useMemo(() => {
    const dates = new Set<string>([start, end]);
    for (const doc of graph.documents) dates.add(doc.date);
    return [...dates].filter(Boolean).sort();
  }, [graph.documents, start, end]);

  const previousRecord = [...recordDates].reverse().find((date) => date < asOf) ?? null;
  const nextRecord = recordDates.find((date) => date > asOf) ?? null;

  const index = useMemo(() => {
    const days = Math.round(
      (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
    );
    return days;
  }, [asOf, start]);

  const totalDays = Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
  );

  const visibleConflicts = contradictions.filter((c) => c.window.end <= asOf).length;
  const currentYear = asOf.slice(0, 4);

  return (
    <div className="scrubber">
      <div className="scrubber-meta">
        <div className="scrubber-head">
          <div className="scrubber-label">Time Machine</div>
          <div className="scrubber-date">{formatDate(asOf)}</div>
        </div>

        <div className="scrubber-tools">
          <div className="scrubber-counts">
            <span className="scrubber-count" title="Documents as of this date">
              <span className="dot info" />
              <span className="scrubber-count-n">{snapshot.totals.documents}</span>
              <span className="scrubber-count-l">docs</span>
            </span>
            <span className="scrubber-count" title="Changes in the record">
              <span className="dot warn" />
              <span className="scrubber-count-n">{changes.length}</span>
              <span className="scrubber-count-l">changes</span>
            </span>
            <span className="scrubber-count" title="Conflicts visible as of this date">
              <span className="dot critical" />
              <span className="scrubber-count-n">{visibleConflicts}</span>
              <span className="scrubber-count-l">conflicts</span>
            </span>
          </div>
          <div className="scrubber-nav">
            <button
              type="button"
              disabled={previousRecord === null}
              onClick={() => previousRecord && setAsOf(previousRecord)}
              aria-label="Previous document"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={nextRecord === null}
              onClick={() => nextRecord && setAsOf(nextRecord)}
              aria-label="Next document"
            >
              Next
            </button>
            <button type="button" onClick={() => setAsOf(start)}>
              Earliest
            </button>
            <button type="button" onClick={() => setAsOf(end)}>
              Latest
            </button>
            <button type="button" className="is-compare" onClick={() => setView('timemachine')}>
              Compare
            </button>
          </div>
        </div>
      </div>

      <div className="scrubber-track">
        <div className="scrubber-rail" />
        <div className="scrubber-fill" style={{ width: `${fraction * 100}%` }} />
        <div className="scrubber-ticks">
          {ticks.map((tick, i) => (
            <span
              key={`${tick.kind}_${i}`}
              className={`scrubber-tick is-${tick.kind}`}
              style={{ left: `${tick.left}%` }}
              title={tick.label}
            />
          ))}
        </div>
        <input
          className="scrubber-input"
          type="range"
          min={0}
          max={Math.max(1, totalDays)}
          value={Math.max(0, Math.min(totalDays, index))}
          onChange={(event) => setAsOf(addDays(start, Number(event.target.value)))}
          aria-label="Time machine date"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, totalDays)}
          aria-valuenow={Math.max(0, Math.min(totalDays, index))}
          aria-valuetext={formatDate(asOf)}
        />
        <div className="scrubber-years">
          {years.map((mark) => {
            const pin = mark.left <= 3 ? 'is-start' : mark.left >= 97 ? 'is-end' : '';
            return (
              <button
                key={mark.year}
                type="button"
                className={`scrubber-year ${pin}${mark.year === currentYear ? ' is-current' : ''}`}
                style={{ left: `${mark.left}%` }}
                onClick={() => setAsOf(mark.date)}
                title={`Jump to ${mark.year}`}
              >
                {mark.year}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
