import { Chip } from './Panel';
import { SeriesChart, type SeriesPoint } from './Charts';
import { formatDate } from '../engine/text/normalize';
import { pct } from '../lib/format';
import type { Fact } from '../engine/types';

/** One measurement concept, its series, and the provenance behind every point. */
export function MeasurementCard({
  label,
  category,
  readings,
  onEvidence,
}: {
  label: string;
  category?: string;
  readings: Fact[];
  onEvidence: (request: {
    title: string;
    subtitle?: string;
    factIds: string[];
    docId?: string;
  }) => void;
}) {
  const first = readings[0];
  const latest = readings[readings.length - 1];
  const ref = latest.referenceRange;
  const sameUnit = first.unit === latest.unit;
  const changePct =
    sameUnit && first.valueNum && latest.valueNum
      ? Math.round(((latest.valueNum - first.valueNum) / first.valueNum) * 1000) / 10
      : null;

  const points: SeriesPoint[] = readings.map((fact) => ({
    date: fact.occurredAt,
    value: fact.valueNum as number,
    factId: fact.id,
    flagged: fact.flags.includes('implausible_value'),
    inRange:
      fact.attrs.inReferenceRange === true
        ? true
        : fact.attrs.inReferenceRange === false
          ? false
          : null,
  }));

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-name">{label}</span>
        {category && <Chip tone="muted">{category}</Chip>}
        <span className="chart-range">
          {ref
            ? `${ref.low ?? ''}${ref.low !== undefined && ref.high !== undefined ? '–' : ''}${ref.high ?? ''} ${latest.unit ?? ''}`
            : 'no reference range stated'}
        </span>
        {readings.some((f) => f.flags.includes('implausible_value')) && (
          <Chip tone="critical">contains a flagged value</Chip>
        )}
        <span style={{ marginLeft: 'auto' }} className="chart-range">
          {readings.length} reading{readings.length === 1 ? '' : 's'}
        </span>
      </div>

      {readings.length >= 2 ? (
        <SeriesChart points={points} unit={latest.unit} referenceRange={ref} />
      ) : (
        <div className="dim" style={{ fontSize: 11.5 }}>
          Only one reading, so there is no series to plot.
        </div>
      )}

      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-swatch" style={{ background: 'var(--accent-2)' }} />
          in range
        </span>
        <span className="chart-legend-item">
          <span className="chart-swatch" style={{ background: 'var(--medium)' }} />
          outside range
        </span>
        <span className="chart-legend-item">
          <span className="chart-swatch" style={{ background: 'var(--high)' }} />
          flagged / implausible
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 12 }}>
          {first.valueNum} {first.unit} → {latest.valueNum} {latest.unit}
        </span>
        <Chip tone={changePct === null ? 'muted' : changePct > 0 ? 'warn' : 'ok'}>
          {changePct === null ? 'not comparable' : pct(changePct)}
        </Chip>
        <Chip
          tone="info"
          onClick={() =>
            onEvidence({
              title: label,
              subtitle: `${readings.length} readings`,
              factIds: readings.map((f) => f.id),
            })
          }
        >
          All readings
        </Chip>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {readings.slice(-8).map((fact) => (
          <Chip
            key={fact.id}
            tone={
              fact.flags.includes('implausible_value')
                ? 'critical'
                : fact.attrs.inReferenceRange === false
                  ? 'warn'
                  : 'muted'
            }
            onClick={() =>
              onEvidence({
                title: label,
                subtitle: formatDate(fact.occurredAt),
                factIds: [fact.id],
                docId: fact.docId,
              })
            }
          >
            {formatDate(fact.occurredAt)} · {fact.valueNum}
          </Chip>
        ))}
      </div>
    </div>
  );
}
