import type { Fact } from '../engine/types';

/** Tiny inline trend line for measurement cards. */
export function Sparkline({
  facts,
  width = 120,
  height = 26,
  tone = 'var(--accent)',
}: {
  facts: Fact[];
  width?: number;
  height?: number;
  tone?: string;
}) {
  const points = facts
    .filter((f) => f.valueNum !== undefined)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  if (points.length < 2) {
    return <span className="dim mono" style={{ fontSize: 10.5 }}>single reading</span>;
  }

  const values = points.map((f) => f.valueNum as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);

  const path = points
    .map((point, index) => {
      const x = index * stepX;
      const y = height - ((point.valueNum! - min) / span) * (height - 6) - 3;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const last = points[points.length - 1];
  const lastY = height - ((last.valueNum! - min) / span) * (height - 6) - 3;

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke={tone} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={width} cy={lastY} r={2.6} fill={tone} />
    </svg>
  );
}

export interface SeriesPoint {
  date: string;
  value: number;
  factId: string;
  flagged: boolean;
  inRange: boolean | null;
}

/**
 * A measurement chart drawn by hand.
 *
 * It plots the readings the engine extracted, marks the document's own reference
 * range when one exists, and marks flagged points differently — so a bad value
 * is visible as a bad value rather than a smooth line.
 */
export function SeriesChart({
  points,
  unit,
  referenceRange,
  height = 150,
}: {
  points: SeriesPoint[];
  unit?: string;
  referenceRange?: { low?: number; high?: number };
  height?: number;
}) {
  const width = 640;
  const padding = { top: 16, right: 18, bottom: 24, left: 46 };
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const refLow = referenceRange?.low;
  const refHigh = referenceRange?.high;
  const candidates = [...values, ...(refLow !== undefined ? [refLow] : []), ...(refHigh !== undefined ? [refHigh] : [])];
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || 1;
  const pad = span * 0.16;

  const y = (value: number) =>
    padding.top + (1 - (value - (min - pad)) / (span + pad * 2)) * (height - padding.top - padding.bottom);
  const x = (index: number) =>
    padding.left + (index / Math.max(1, points.length - 1)) * (width - padding.left - padding.right);

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(' ');

  const refBandTop = refHigh !== undefined ? y(refHigh) : padding.top;
  const refBandBottom = refLow !== undefined ? y(refLow) : height - padding.bottom;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {(refHigh !== undefined || refLow !== undefined) && (
        <rect
          x={padding.left}
          y={Math.min(refBandTop, refBandBottom)}
          width={width - padding.left - padding.right}
          height={Math.max(2, Math.abs(refBandBottom - refBandTop))}
          fill="rgba(61, 220, 151, 0.09)"
        />
      )}

      {[0, 0.5, 1].map((fraction) => {
        const value = min - pad + fraction * (span + pad * 2);
        return (
          <g key={fraction}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(value)}
              y2={y(value)}
              stroke="rgba(255,255,255,0.06)"
            />
            <text x={8} y={y(value) + 4} fill="var(--text-4)" fontSize={10} fontFamily="var(--mono)">
              {Math.round(value * 100) / 100}
            </text>
          </g>
        );
      })}

      <path d={path} fill="none" stroke="var(--accent-2)" strokeWidth={1.8} strokeLinejoin="round" />

      {points.map((point, index) => (
        <circle
          key={point.factId}
          cx={x(index)}
          cy={y(point.value)}
          r={point.flagged ? 4.5 : 3.2}
          fill={point.flagged ? 'var(--high)' : point.inRange === false ? 'var(--medium)' : 'var(--accent-2)'}
          stroke="var(--bg-1)"
          strokeWidth={1.5}
        >
          <title>{`${point.date}: ${point.value} ${unit ?? ''}`}</title>
        </circle>
      ))}

      {points.map((point, index) =>
        index % Math.ceil(points.length / 6) === 0 || index === points.length - 1 ? (
          <text
            key={`label_${point.factId}`}
            x={x(index)}
            y={height - 6}
            fill="var(--text-4)"
            fontSize={10}
            fontFamily="var(--mono)"
            textAnchor="middle"
          >
            {point.date.slice(0, 7)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
