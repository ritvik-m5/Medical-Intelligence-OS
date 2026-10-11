import { useMemo } from 'react';
import { useStore } from '../state/store';
import { Chip, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import { Sparkline } from '../components/Charts';
import { StateOfRecord } from '../components/StateOfRecord';
import { formatDate } from '../engine/text/normalize';
import { factsFor } from '../engine/access';
import { pct, plural, statusLabel, statusTone } from '../lib/format';
import { CATEGORY_LABEL } from '../engine/derive/types';

export function OverviewView() {
  const {
    graph,
    snapshot,
    derivations,
    changes,
    asOf,
    setView,
    openEvidence,
    openProof,
  } = useStore();

  const activeConditions = snapshot.conditions.filter((c) => c.status === 'active');
  const activeMedications = snapshot.medications.filter((m) => m.status === 'active');
  const topFindings = derivations.slice(0, 4);

  const keyMeasurements = useMemo(() => {
    const priority = [
      'measurement:hemoglobin-a1c',
      'measurement:ldl-cholesterol',
      'vital:weight',
      'vital:bmi',
      'measurement:egfr',
      'measurement:potassium',
    ];
    const byKey = new Map(snapshot.measurements.map((m) => [m.entityKey, m]));
    const ordered = priority
      .map((key) => byKey.get(key))
      .filter((m): m is (typeof snapshot.measurements)[number] => Boolean(m));
    const extras = snapshot.measurements.filter((m) => !priority.includes(m.entityKey));
    return [...ordered, ...extras].slice(0, 6);
  }, [snapshot]);

  const topChanges = changes.filter((c) => c.kind !== 'new_document').slice(0, 6);

  return (
    <div className="view-inner">
      <StateOfRecord />

      <Panel
        title="Highest-ranked findings"
        sub={`${plural(derivations.length, 'derivation')} produced by the rule registry at ${formatDate(asOf)}`}
        actions={
          <button type="button" className="btn is-sm" onClick={() => setView('inference')}>
            All findings
          </button>
        }
      >
        {topFindings.length === 0 ? (
          <div className="empty">
            No rule produced a finding for this record at this date. That is a valid outcome, not a
            failure.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topFindings.map((derivation) => (
              <div
                key={derivation.id}
                className="answer-item"
                onClick={() => {
                  setView('inference');
                  openProof(derivation.id);
                }}
              >
                <div className="answer-item-label">
                  <span
                    className={`dot ${
                      derivation.severity === 'high'
                        ? 'critical'
                        : derivation.severity === 'medium'
                          ? 'warn'
                          : 'info'
                    }`}
                  />
                  <span>{derivation.title}</span>
                  <Chip tone="muted">{CATEGORY_LABEL[derivation.category]}</Chip>
                  <Chip tone={derivation.confidence >= 0.8 ? 'ok' : 'muted'}>
                    {derivation.confidence.toFixed(2)}
                  </Chip>
                  <Chip tone="muted">{derivation.steps.length} steps</Chip>
                </div>
                <div className="answer-item-sub">{derivation.statement}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>


      <div className="grid grid-2">
        <Panel
          title="What changed in the last 12 months"
          sub={`Compared ${formatDate(asOf)} against the same date a year earlier`}
          actions={
            <button type="button" className="btn is-sm" onClick={() => setView('timemachine')}>
              Time Machine
            </button>
          }
        >
          {topChanges.length === 0 ? (
            <div className="empty">Nothing in the record changed in that window.</div>
          ) : (
            <div className="tl">
              {topChanges.map((change) => (
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
                      <Chip tone="muted">{change.factType}</Chip>
                    </div>
                    <div className="tl-sub">Caveat: {change.caveat}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Active problems"
          sub="Status folded forward from the wording of each document"
          actions={
            <button type="button" className="btn is-sm" onClick={() => setView('graph')}>
              Health Graph
            </button>
          }
        >
          {activeConditions.length === 0 ? (
            <div className="empty">No problem is documented as active at this date.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeConditions.map((condition) => (
                <div
                  key={condition.entityKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                  onClick={() =>
                    openEvidence({
                      title: condition.label,
                      subtitle: `${statusLabel(condition.status)} · since ${formatDate(condition.since)}`,
                      factIds: condition.factIds,
                    })
                  }
                >
                  <span className={`dot ${statusTone(condition.status)}`} />
                  <span style={{ fontSize: 13 }}>{condition.label}</span>
                  {condition.category && <Chip tone="muted">{condition.category}</Chip>}
                  <span className="mono dim" style={{ marginLeft: 'auto', fontSize: 11 }}>
                    since {formatDate(condition.since)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Current medications" sub={`As documented on or before ${formatDate(asOf)}`} flush>
        {activeMedications.length === 0 ? (
          <div className="empty">No medication is documented as active at this date.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Class</th>
                <th>Latest documented dose</th>
                <th>Since</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {activeMedications.map((medication) => {
                const facts = factsFor(graph, medication.entityKey).filter(
                  (f) => f.occurredAt <= asOf,
                );
                const latest = facts[facts.length - 1];
                return (
                  <tr
                    key={medication.entityKey}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      openEvidence({
                        title: medication.label,
                        subtitle: 'Medication',
                        factIds: medication.factIds,
                      })
                    }
                  >
                    <td className="is-primary">{medication.label}</td>
                    <td>{medication.category ?? '—'}</td>
                    <td className="mono">{medication.latestDose ?? 'not stated'}</td>
                    <td className="mono">{formatDate(medication.since)}</td>
                    <td className="mono">{latest ? formatDate(latest.occurredAt) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="grid grid-3">
        {keyMeasurements.map((measurement) => {
          const series = factsFor(graph, measurement.entityKey).filter(
            (f) => f.occurredAt <= asOf && f.attrs.restated !== true,
          );
          const implausible = measurement.latest.flags.includes('implausible_value');
          return (
            <div className="metric-card" key={measurement.entityKey} style={{ gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="metric-label">{measurement.label}</span>
                {implausible ? (
                  <Chip tone="critical">implausible value</Chip>
                ) : measurement.inRange === false ? (
                  <Chip tone="warn">out of range</Chip>
                ) : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="metric-value"
                  style={{ fontSize: 24 }}
                  onClick={() =>
                    openEvidence({
                      title: measurement.label,
                      subtitle: 'Latest reading',
                      factIds: [measurement.latest.id],
                    })
                  }
                >
                  {measurement.latest.valueNum}
                  <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>
                    {measurement.latest.unit}
                  </span>
                </button>
                <Sparkline
                  facts={series}
                  tone={
                    implausible
                      ? 'var(--high)'
                      : measurement.inRange === false
                        ? 'var(--medium)'
                        : 'var(--accent-2)'
                  }
                />
              </div>
              <div className="metric-sub">
                {measurement.readings} reading{measurement.readings === 1 ? '' : 's'} ·{' '}
                {measurement.changePct === null
                  ? 'no comparable change'
                  : `${pct(measurement.changePct)} since ${formatDate(measurement.first.occurredAt)}`}
              </div>
              <button
                type="button"
                className="btn is-sm is-ghost"
                onClick={() => setView('measurements')}
              >
                <Icon.Measurements size={12} />
                Open series
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

