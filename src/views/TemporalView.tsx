import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, EmptyState, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import { buildConditionSpans, buildMedicationCourses, relate } from '../engine/derive/intervals';
import { daysBetween, formatDate } from '../engine/text/normalize';
import { plural } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Temporal view                                                       */
/*                                                                    */
/* Medications and conditions are courses, not events. This view draws  */
/* them as intervals on one shared axis so that overlap, gap and        */
/* sequence become visible — which is the whole reason the rules reason */
/* over intervals rather than dates.                                    */
/* ------------------------------------------------------------------ */

interface Row {
  kind: 'medication' | 'condition';
  key: string;
  label: string;
  start: string;
  end?: string;
  state: string;
  dose?: string;
  startFactId: string;
  confidence: number;
}

export function TemporalView() {
  const { graph, asOf, openEvidence } = useStore();
  const [show, setShow] = useState<'all' | 'medication' | 'condition'>('all');

  const courses = useMemo(() => buildMedicationCourses(graph), [graph]);
  const spans = useMemo(() => buildConditionSpans(graph), [graph]);

  const axisStart = graph.stats.spanStart;
  const axisEnd = asOf;
  const axisDays = Math.max(1, daysBetween(axisStart, axisEnd));

  const rows: Row[] = useMemo(() => {
    const medicationRows: Row[] = courses.map((course) => ({
      kind: 'medication',
      key: `${course.entityKey}_${course.startFactId}`,
      label: course.label,
      start: course.interval.start,
      end: course.interval.end,
      state: course.state,
      dose: course.dose,
      startFactId: course.startFactId,
      confidence: course.confidence,
    }));
    const conditionRows: Row[] = spans.map((span) => ({
      kind: 'condition',
      key: `${span.entityKey}_${span.startFactId}`,
      label: span.label,
      start: span.interval.start,
      end: span.interval.end,
      state: span.state,
      startFactId: span.startFactId,
      confidence: span.confidence,
    }));
    const all = [...conditionRows, ...medicationRows];
    const filtered = show === 'all' ? all : all.filter((row) => row.kind === show);
    return filtered.sort(
      (a, b) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label),
    );
  }, [courses, spans, show]);

  const position = (date: string) =>
    Math.max(0, Math.min(100, (daysBetween(axisStart, date) / axisDays) * 100));

  const yearTicks = useMemo(() => {
    const first = Number(axisStart.slice(0, 4));
    const last = Number(axisEnd.slice(0, 4));
    const ticks: Array<{ year: string; left: number }> = [];
    for (let year = first; year <= last; year++) {
      const date = `${year}-01-01`;
      if (date < axisStart || date > axisEnd) continue;
      ticks.push({ year: String(year), left: position(date) });
    }
    return ticks;
  }, [axisStart, axisEnd]);

  const overlaps = useMemo(() => {
    const pairs: Array<{ a: Row; b: Row; relation: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        const relation = relate({ start: a.start, end: a.end }, { start: b.start, end: b.end });
        if (['overlaps', 'overlapped-by', 'contains', 'during', 'equals'].includes(relation)) {
          pairs.push({ a, b, relation });
        }
      }
    }
    return pairs.slice(0, 12);
  }, [rows]);

  return (
    <div className="view-inner">
      <Panel
        title="Documented intervals"
        sub={`${plural(rows.length, 'interval')} from ${formatDate(axisStart)} to ${formatDate(axisEnd)}`}
        actions={
          <div className="tabs">
            {(['all', 'condition', 'medication'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`tab${show === option ? ' is-active' : ''}`}
                onClick={() => setShow(option)}
              >
                {option === 'all'
                  ? 'Everything'
                  : option === 'condition'
                    ? 'Conditions'
                    : 'Medications'}
              </button>
            ))}
          </div>
        }
      >
        <div className="notice">
          <Icon.Warning size={15} />
          <div>
            <strong>An open bar means the documents do not close it.</strong> That is not the same as
            "still active" — it means no later document says otherwise. A bar ends only where a
            statement closes it, so its width is a property of the record, not of the patient's life.
          </div>
        </div>

        <div className="temporal-axis">
          {yearTicks.map((tick) => (
            <span key={tick.year} className="temporal-tick" style={{ left: `${tick.left}%` }}>
              {tick.year}
            </span>
          ))}
        </div>
      </Panel>

      {rows.length === 0 ? (
        <Panel title="No intervals">
          <EmptyState>
            No condition or medication interval has been documented by this date.
          </EmptyState>
        </Panel>
      ) : (
        <Panel title="Course timeline" sub="Click any bar to see the statement that opened it">
          <div className="temporal">
            {rows.map((row) => {
              const left = position(row.start);
              const right = row.end ? position(row.end) : 100;
              const width = Math.max(1.2, right - left);
              return (
                <div className="temporal-row" key={row.key}>
                  <div className="temporal-label">
                    <span className={`dot ${row.kind === 'medication' ? 'ok' : 'external'}`} />
                    <span className="truncate">{row.label}</span>
                    {row.dose && <span className="mono dim temporal-dose">{row.dose}</span>}
                  </div>
                  <div className="temporal-track">
                    <button
                      type="button"
                      className={`temporal-bar is-${row.kind}${row.state === 'open' ? ' is-open' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${row.label}: ${formatDate(row.start)} → ${row.end ? formatDate(row.end) : 'open'} (${row.state})`}
                      onClick={() =>
                        openEvidence({
                          title: row.label,
                          subtitle: `${row.state === 'open' ? 'Open interval from' : 'Interval'} ${formatDate(row.start)}${row.end ? ` to ${formatDate(row.end)}` : ''}`,
                          factIds: [row.startFactId],
                        })
                      }
                    />
                    <span className="temporal-caption" style={{ left: `${left}%` }}>
                      {formatDate(row.start)}
                      {row.end ? ` → ${formatDate(row.end)}` : ' → open'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel
        title="Interval relations the engine found"
        sub="Allen relations between the documented courses above"
      >
        {overlaps.length === 0 ? (
          <EmptyState>
            No two documented intervals overlap, contain or coincide within this window.
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {overlaps.map((pair, index) => (
              <div key={index} className="answer-item">
                <div className="answer-item-label">
                  <span className={`dot ${pair.a.kind === 'medication' ? 'ok' : 'external'}`} />
                  <span>{pair.a.label}</span>
                  <Chip tone="info">{pair.relation}</Chip>
                  <span className={`dot ${pair.b.kind === 'medication' ? 'ok' : 'external'}`} />
                  <span>{pair.b.label}</span>
                </div>
                <div className="answer-item-sub">
                  {pair.a.label} ({formatDate(pair.a.start)} →{' '}
                  {pair.a.end ? formatDate(pair.a.end) : 'open'}) {pair.relation} {pair.b.label} (
                  {formatDate(pair.b.start)} → {pair.b.end ? formatDate(pair.b.end) : 'open'}).
                </div>
              </div>
            ))}
            <div className="dim" style={{ fontSize: 11 }}>
              Overlap is a property of the documentation, not of what was actually taken. Two courses
              that overlap here may never have been concurrent in reality.
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

