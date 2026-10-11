import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Panel } from '../components/Panel';
import { factsFor } from '../engine/access';
import { formatDate } from '../engine/text/normalize';
import { MeasurementCard } from '../components/MeasurementCard';

/**
 * Measurements: every reading the engine extracted, with its own series.
 *
 * Two things are deliberately visible here. First, the reference range shown is
 * the one printed in the document whenever it exists, and is labelled as
 * illustrative when it does not. Second, a flagged value is plotted as a flagged
 * point — the chart does not smooth over a value the engine doubts.
 */
export function MeasurementsView() {
  const { graph, asOf, openEvidence } = useStore();
  const [query, setQuery] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const measurements = useMemo(() => {
    const entities = graph.entities.filter((e) => e.kind === 'measurement' || e.kind === 'vital');
    return entities
      .map((entity) => {
        const facts = factsFor(graph, entity.key).filter((f) => f.occurredAt <= asOf);
        const readings = facts.filter((f) => f.valueNum !== undefined && f.attrs.restated !== true);
        return { entity, readings };
      })
      .filter((entry) => entry.readings.length > 0)
      .filter((entry) =>
        query.trim() ? entry.entity.label.toLowerCase().includes(query.trim().toLowerCase()) : true,
      )
      .filter((entry) =>
        onlyFlagged
          ? entry.readings.some(
              (f) =>
                f.flags.includes('implausible_value') ||
                f.flags.includes('outside_reference_range') ||
                f.flags.includes('unit_unusual'),
            )
          : true,
      )
      .sort((a, b) => b.readings.length - a.readings.length);
  }, [graph, asOf, query, onlyFlagged]);

  const totalReadings = measurements.reduce((sum, entry) => sum + entry.readings.length, 0);
  const flaggedReadings = graph.facts.filter(
    (f) =>
      f.occurredAt <= asOf && (f.type === 'measurement' || f.type === 'vital') && f.flags.length > 0,
  ).length;

  return (
    <div className="view-inner">
      <Panel
        title="Measurements"
        sub={`${measurements.length} concepts · ${totalReadings} readings on or before ${formatDate(asOf)} · ${flaggedReadings} readings flagged`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className={`btn is-sm${onlyFlagged ? ' is-primary' : ''}`}
              onClick={() => setOnlyFlagged((v) => !v)}
            >
              Only flagged
            </button>
            <input
              type="search"
              placeholder="Filter by name…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'rgba(0,0,0,0.28)',
                color: 'var(--text)',
                fontSize: 12.5,
                outline: 'none',
              }}
            />
          </div>
        }
      >
        <div className="notice">
          <div>
            <strong>Reference ranges.</strong> A range printed in the source document is used exactly
            as printed. When a document states no range, a widely published typical range is shown
            and labelled as illustrative. The performing laboratory's own range always takes
            precedence.
          </div>
        </div>
      </Panel>

      {measurements.length === 0 ? (
        <Panel title="No measurement matches">
          <div className="empty">Try clearing the filter.</div>
        </Panel>
      ) : (
        <div className="grid grid-2">
          {measurements.map(({ entity, readings }) => (
            <MeasurementCard
              key={entity.key}
              label={entity.label}
              category={entity.category}
              readings={readings}
              onEvidence={openEvidence}
            />
          ))}
        </div>
      )}
    </div>
  );
}
