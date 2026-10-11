import { Chip } from './Panel';
import { formatDate } from '../engine/text/normalize';
import type { Snapshot } from '../engine/types';
import { statusLabel, statusTone } from '../lib/format';

/**
 * One reconstruction of the record at a point in time.
 *
 * Deliberately shows the counts *and* the items, because "3 medications" is not
 * auditable but "Lisinopril, Atorvastatin, Metformin, each with a date" is.
 */
export function SnapshotPanel({
  snapshot,
  title,
  onFact,
}: {
  snapshot: Snapshot;
  title: string;
  onFact: (request: { title: string; subtitle?: string; factIds: string[] }) => void;
}) {
  const sections: Array<{ label: string; items: Snapshot['conditions'] }> = [
    { label: 'Problems', items: snapshot.conditions },
    { label: 'Medications', items: snapshot.medications },
    { label: 'Allergies', items: snapshot.allergies },
    { label: 'Procedures', items: snapshot.procedures },
    { label: 'Immunizations', items: snapshot.immunizations },
  ];

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <div className="panel-title">{title}</div>
          <div className="panel-sub">
            {snapshot.totals.documents} documents · {snapshot.totals.facts} facts ·{' '}
            {snapshot.totals.entities} concepts
          </div>
        </div>
      </header>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sections.map((section) => (
          <div key={section.label}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: section.items.length ? 7 : 0,
              }}
            >
              <span className="metric-label">{section.label}</span>
              <Chip tone={section.items.length ? 'muted' : 'muted'}>{section.items.length}</Chip>
            </div>
            {section.items.length === 0 ? (
              <div className="dim" style={{ fontSize: 11.5 }}>
                Nothing documented at this date.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {section.items.map((item) => (
                  <div
                    key={item.entityKey}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12.5,
                      padding: '5px 8px',
                      borderRadius: 'var(--radius-xs)',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--line)',
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      onFact({
                        title: item.label,
                        subtitle: `${statusLabel(item.status)} · last documented ${formatDate(item.lastDocumented)}`,
                        factIds: item.factIds,
                      })
                    }
                  >
                    <span className={`dot ${statusTone(item.status)}`} />
                    <span>{item.label}</span>
                    {item.latestDose && (
                      <span className="mono dim" style={{ fontSize: 11 }}>
                        {item.latestDose}
                      </span>
                    )}
                    <span className="mono dim" style={{ marginLeft: 'auto', fontSize: 10.5 }}>
                      {statusLabel(item.status)} · {formatDate(item.lastDocumented)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <span className="metric-label">Measurements</span>
            <Chip tone="muted">{snapshot.measurements.length}</Chip>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {snapshot.measurements.slice(0, 14).map((measurement) => (
              <Chip
                key={measurement.entityKey}
                tone={
                  measurement.latest.flags.includes('implausible_value')
                    ? 'critical'
                    : measurement.inRange === false
                      ? 'warn'
                      : 'muted'
                }
                onClick={() =>
                  onFact({
                    title: measurement.label,
                    subtitle: 'Latest reading at this date',
                    factIds: [measurement.latest.id],
                  })
                }
              >
                {measurement.label} {measurement.latest.valueNum}
                {measurement.latest.unit ? ` ${measurement.latest.unit}` : ''}
              </Chip>
            ))}
            {snapshot.measurements.length > 14 && (
              <Chip tone="muted">+{snapshot.measurements.length - 14} more</Chip>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
