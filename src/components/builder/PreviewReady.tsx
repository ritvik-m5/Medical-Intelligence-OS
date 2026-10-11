import type { BuildArtifact } from '../../builder/types';
import type { Fact } from '../../engine/types';

/* ------------------------------------------------------------------ */
/* The built product                                                   */
/*                                                                    */
/* This is the payoff panel: a miniature of the application, populated */
/* entirely from the artifact the build produced. Every number, label  */
/* and bar traces back to a real document span.                        */
/* ------------------------------------------------------------------ */

interface Series {
  entityKey: string;
  label: string;
  unit?: string;
  points: { date: string; value: number }[];
}

/** The measurement with the most documented values, for the sparkline. */
function richestSeries(facts: Fact[]): Series | null {
  const groups = new Map<string, Series>();
  for (const fact of facts) {
    if (fact.type !== 'measurement' || fact.valueNum === undefined) continue;
    const existing = groups.get(fact.entityKey) ?? {
      entityKey: fact.entityKey,
      label: fact.label,
      unit: fact.unit,
      points: [],
    };
    existing.points.push({ date: fact.occurredAt, value: fact.valueNum });
    groups.set(fact.entityKey, existing);
  }
  let best: Series | null = null;
  for (const series of groups.values()) {
    if (series.points.length < 3) continue;
    if (!best || series.points.length > best.points.length) best = series;
  }
  if (!best) return null;
  return { ...best, points: best.points.sort((a, b) => a.date.localeCompare(b.date)) };
}

/** A sparkline over real values. No smoothing, no invented points. */
function Sparkline({ points }: { points: { date: string; value: number }[] }) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 300;
  const height = 72;
  const step = points.length > 1 ? width / (points.length - 1) : width;

  const coords = points.map((point, index) => ({
    x: index * step,
    y: height - ((point.value - min) / span) * (height - 16) - 8,
  }));

  return (
    <svg className="ready-spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Measurement series">
      <polyline
        className="ready-spark-line"
        points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
      />
      {coords.map((c, index) => (
        <circle key={index} className="ready-spark-dot" cx={c.x} cy={c.y} r={2.6} />
      ))}
    </svg>
  );
}

export function ReadyPreview({ artifact }: { artifact: BuildArtifact }) {
  const { graph, derivations, quality, summary, patient, elapsedMs } = artifact;
  const span = `${graph.stats.spanStart} → ${graph.stats.spanEnd}`;

  return (
    <div className="ready">
      <div className="ready-head">
        <div>
          <div className="ready-patient">{patient.name}</div>
          <div className="ready-meta">
            {graph.documents.length} documents · {span} · built in {elapsedMs} ms
          </div>
        </div>
        <div className={`ready-grade is-${quality.grade.toLowerCase()}`}>
          <span className="ready-grade-letter">{quality.grade}</span>
          <span className="ready-grade-label">record grade</span>
        </div>
      </div>

      <div className="ready-stats">
        <Tile label="Provenanced facts" value={graph.stats.facts} />
        <Tile label="Resolved concepts" value={graph.stats.entities} />
        <Tile label="Derivations" value={derivations.length} accent={summary.bySeverity.high > 0} />
        <Tile label="High severity" value={summary.bySeverity.high} />
      </div>

      <FocusPanel artifact={artifact} />

      <div className="ready-foot">
        Every fact above carries the document id and character span it was read from. Nothing on this
        screen was generated as text.
      </div>
    </div>
  );
}

function Tile({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`ready-tile${accent ? ' is-accent' : ''}`}>
      <span className="ready-tile-value">{value}</span>
      <span className="ready-tile-label">{label}</span>
    </div>
  );
}

function FocusPanel({ artifact }: { artifact: BuildArtifact }) {
  switch (artifact.focus) {
    case 'timeline':
      return <TimelinePanel artifact={artifact} />;
    case 'measurements':
      return <MeasurementPanel artifact={artifact} />;
    case 'quality':
      return <QualityPanel artifact={artifact} />;
    case 'interop':
      return <InteropPanel artifact={artifact} />;
    case 'findings':
    default:
      return <FindingsPanel artifact={artifact} />;
  }
}

/* ---------------------------- Findings ---------------------------- */

function FindingsPanel({ artifact }: { artifact: BuildArtifact }) {
  const shown = artifact.derivations.slice(0, 6);

  return (
    <div className="ready-panel">
      <div className="ready-panel-head">
        <span className="ready-panel-title">Open findings</span>
        <span className="ready-panel-sub">
          {artifact.derivations.length} total · showing {shown.length}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="ready-empty">
          No rule fired. That is reported as a result, not hidden: {artifact.summary.total} derivations
          were produced.
        </div>
      ) : (
        <div className="ready-findings">
          {shown.map((derivation) => (
            <div className={`ready-finding is-${derivation.severity}`} key={derivation.id}>
              <span className="ready-finding-dot" aria-hidden="true" />
              <div className="ready-finding-body">
                <div className="ready-finding-title">{derivation.title}</div>
                <div className="ready-finding-meta">
                  <span className="ready-finding-rule">{derivation.ruleId}</span>
                  <span>grade {derivation.grade}</span>
                  <span>confidence {derivation.confidence.toFixed(2)}</span>
                  <span>{derivation.depth} proof steps</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ready-panel-foot">
        Each finding is a proof graph ending in one conclusion, and each states what it refuses to
        conclude.
      </div>
    </div>
  );
}

/* ---------------------------- Timeline ---------------------------- */

function TimelinePanel({ artifact }: { artifact: BuildArtifact }) {
  const byYear = new Map<string, number>();
  for (const doc of artifact.documents) {
    const year = doc.date.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  const years = Array.from(byYear.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const peak = Math.max(...years.map(([, count]) => count), 1);

  return (
    <div className="ready-panel">
      <div className="ready-panel-head">
        <span className="ready-panel-title">Documented life</span>
        <span className="ready-panel-sub">
          {artifact.documents.length} documents over {years.length} years
        </span>
      </div>

      <div className="ready-timeline">
        {years.map(([year, count]) => (
          <div className="ready-year" key={year}>
            <div className="ready-year-count">{count}</div>
            <div className="ready-year-track">
              <div className="ready-year-fill" style={{ height: `${(count / peak) * 100}%` }} />
            </div>
            <div className="ready-year-label">{year}</div>
          </div>
        ))}
      </div>

      <div className="ready-panel-foot">
        The gap between bars is real. Missing years are shown as missing rather than smoothed over.
      </div>
    </div>
  );
}

/* -------------------------- Measurements -------------------------- */

function MeasurementPanel({ artifact }: { artifact: BuildArtifact }) {
  const series = richestSeries(artifact.facts);

  if (!series) {
    return (
      <div className="ready-panel">
        <div className="ready-panel-head">
          <span className="ready-panel-title">Measurements</span>
        </div>
        <div className="ready-empty">
          No measurement in this record has three or more documented values, so no trend is shown.
          Two points are not a trajectory.
        </div>
      </div>
    );
  }

  const values = series.points.map((point) => point.value);
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;

  return (
    <div className="ready-panel">
      <div className="ready-panel-head">
        <span className="ready-panel-title">{series.label}</span>
        <span className="ready-panel-sub">
          {series.points.length} values · {series.points[0].date} to{' '}
          {series.points[series.points.length - 1].date}
        </span>
      </div>

      <Sparkline points={series.points} />

      <div className="ready-facts">
        <div className="ready-fact">
          <span className="ready-fact-value">
            {first} → {last}
          </span>
          <span className="ready-fact-label">{series.unit ?? 'units'}</span>
        </div>
        <div className="ready-fact">
          <span className={`ready-fact-value${change > 0 ? ' is-up' : change < 0 ? ' is-down' : ''}`}>
            {change > 0 ? '+' : ''}
            {change.toFixed(2)}
          </span>
          <span className="ready-fact-label">documented change</span>
        </div>
      </div>

      <div className="ready-panel-foot">
        Plotted from documented values only. Values restated inside later narrative notes are excluded
        from any fit.
      </div>
    </div>
  );
}

/* ----------------------------- Quality ---------------------------- */

function QualityPanel({ artifact }: { artifact: BuildArtifact }) {
  const top = [...artifact.quality.dimensions].sort((a, b) => b.score - a.score);
  const weakest = top[top.length - 1];

  return (
    <div className="ready-panel">
      <div className="ready-panel-head">
        <span className="ready-panel-title">Record quality</span>
        <span className="ready-panel-sub">
          {artifact.quality.overall}/100 · grade {artifact.quality.grade}
        </span>
      </div>

      <div className="ready-dims">
        {top.slice(0, 5).map((dimension) => (
          <div className="ready-dim" key={dimension.id}>
            <div className="ready-dim-head">
              <span className="ready-dim-label">{dimension.label}</span>
              <span className="ready-dim-score">{dimension.score}</span>
            </div>
            <div className="ready-dim-track">
              <div className="ready-dim-fill" style={{ width: `${dimension.score}%` }} />
            </div>
          </div>
        ))}
      </div>

      {weakest && (
        <div className="ready-panel-foot">
          Weakest dimension: {weakest.label} at {weakest.score}. {weakest.detail}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Interop ---------------------------- */

function InteropPanel({ artifact }: { artifact: BuildArtifact }) {
  const percent =
    artifact.interop.totalConcepts === 0
      ? 0
      : Math.round((artifact.interop.codedConcepts / artifact.interop.totalConcepts) * 100);

  return (
    <div className="ready-panel">
      <div className="ready-panel-head">
        <span className="ready-panel-title">Share package</span>
        <span className="ready-panel-sub">FHIR R4 collection bundle</span>
      </div>

      <div className="ready-facts">
        <div className="ready-fact">
          <span className="ready-fact-value">{artifact.interop.resourceCount}</span>
          <span className="ready-fact-label">resources</span>
        </div>
        <div className="ready-fact">
          <span className="ready-fact-value">{artifact.interop.codedConcepts}</span>
          <span className="ready-fact-label">coded concepts</span>
        </div>
        <div className="ready-fact">
          <span className="ready-fact-value">{artifact.interop.totalConcepts}</span>
          <span className="ready-fact-label">total concepts</span>
        </div>
      </div>

      <div className="ready-meter">
        <div className="ready-meter-head">
          <span>Coding coverage</span>
          <span>{percent}%</span>
        </div>
        <div className="ready-meter-track">
          <div className="ready-meter-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="ready-panel-foot">
        Every clinical resource carries the document id and character span it was read from, so a
        receiving system can trace any value back to its source line.
      </div>
    </div>
  );
}
