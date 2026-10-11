import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, EmptyState, MetricCard, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import { analyseCohort, COHORT_QUERIES, runCohortQuery } from '../engine/platform/cohort';
import { RULE_LABEL } from '../engine/derive/types';
import type { RuleId } from '../engine/derive/types';

/**
 * Cohort view.
 *
 * The same engines, iterated over several subjects. A rule is written once and
 * evaluated across a population, so prevalence becomes a number rather than an
 * anecdote — and every number carries the caveat that makes it readable.
 */
export function CohortView() {
  const { cohort } = useStore();
  const [queryId, setQueryId] = useState<string>('high-severity');

  const analysis = useMemo(
    () =>
      analyseCohort(
        cohort.map((entry) => ({ id: entry.id, label: entry.label, graph: entry.graph })),
        cohort.reduce((latest, entry) => {
          const end = entry.graph.stats.spanEnd;
          return end > latest ? end : latest;
        }, '2000-01-01'),
      ),
    [cohort],
  );

  const activeQuery = COHORT_QUERIES.find((query) => query.id === queryId) ?? COHORT_QUERIES[0];
  const hits = runCohortQuery(analysis, activeQuery);

  return (
    <div className="view-inner">
      <div className="grid grid-4">
        <MetricCard label="Subjects" value={analysis.subjects.length} sub="records" />
        <MetricCard
          label="Total findings"
          value={analysis.totalFindings}
          sub={`${analysis.rulePrevalence.length} distinct rules fired`}
        />
        <MetricCard
          label="Mean record quality"
          value={analysis.qualityMean}
          sub={analysis.qualityLowest ? `lowest: ${analysis.qualityLowest.label}` : ''}
        />
        <MetricCard
          label="High severity"
          value={analysis.severityTotals.high}
          tone={analysis.severityTotals.high > 0 ? 'warn' : 'ok'}
          sub={`${analysis.severityTotals.medium} medium · ${analysis.severityTotals.low} low`}
        />
      </div>

      <Panel
        title="Rule prevalence across the cohort"
        sub="Share of subjects in which each rule produced at least one finding"
      >
        <div className="notice">
          <Icon.Warning size={15} />
          <div>{analysis.notes[0]}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {analysis.rulePrevalence.map((prevalence) => (
            <div key={prevalence.ruleId} className="quality-row">
              <div className="quality-head">
                <span className="quality-label">
                  {RULE_LABEL[prevalence.ruleId as RuleId] ?? prevalence.ruleId}
                </span>
                <span className="mono quality-score">
                  {prevalence.share}% · {prevalence.findings} finding
                  {prevalence.findings === 1 ? '' : 's'}
                </span>
              </div>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{
                    width: `${prevalence.share}%`,
                    background:
                      prevalence.share >= 66
                        ? 'var(--medium)'
                        : 'linear-gradient(90deg, var(--accent), var(--accent-2))',
                  }}
                />
              </div>
              <div className="quality-detail mono" style={{ fontSize: 10.5 }}>
                {prevalence.ruleId}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Cohort queries"
        sub="Each query is a predicate over an analysed subject, shown with its caveat"
        actions={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {COHORT_QUERIES.map((query) => (
              <button
                key={query.id}
                type="button"
                className={`chip is-button${queryId === query.id ? ' is-ok' : ' is-muted'}`}
                onClick={() => setQueryId(query.id)}
              >
                {query.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="conflict-ask" style={{ marginBottom: 12 }}>
          <strong>{activeQuery.question}</strong>
        </div>

        {hits.length === 0 ? (
          <EmptyState>
            No subject in this cohort matches. With a small cohort, an empty result is expected rather
            than meaningful.
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hits.map((subject) => (
              <div key={subject.id} className="answer-item">
                <div className="answer-item-label">
                  <span className="dot warn" />
                  <span>{subject.label}</span>
                  <Chip tone="muted">{subject.counts.documents} docs</Chip>
                  <Chip tone="muted">{subject.counts.facts} facts</Chip>
                  <Chip tone={subject.quality.overall >= 70 ? 'ok' : 'warn'}>
                    quality {subject.quality.overall}
                  </Chip>
                </div>
                <div className="answer-item-sub">
                  {subject.derivations
                    .filter((d) => !activeQuery.rules || activeQuery.rules.includes(d.ruleId))
                    .slice(0, 3)
                    .map((d) => d.title)
                    .join(' · ') || `${subject.derivations.length} findings in total`}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="conflict-not" style={{ marginTop: 12 }}>
          <strong>Caveat:</strong> {activeQuery.caveat}
        </div>
      </Panel>

      <Panel title="Subject comparison" sub="Record shape and finding mix per subject" flush>
        <table className="table">
          <thead>
            <tr>
              <th>Subject</th>
              <th style={{ textAlign: 'right' }}>Docs</th>
              <th style={{ textAlign: 'right' }}>Facts</th>
              <th style={{ textAlign: 'right' }}>Open conditions</th>
              <th style={{ textAlign: 'right' }}>Open meds</th>
              <th style={{ textAlign: 'right' }}>Findings</th>
              <th style={{ textAlign: 'right' }}>High</th>
              <th style={{ textAlign: 'right' }}>Quality</th>
            </tr>
          </thead>
          <tbody>
            {analysis.subjects.map((subject) => (
              <tr key={subject.id}>
                <td className="is-primary">{subject.label}</td>
                <td className="num">{subject.counts.documents}</td>
                <td className="num">{subject.counts.facts}</td>
                <td className="num">{subject.counts.activeConditions}</td>
                <td className="num">{subject.counts.activeMedications}</td>
                <td className="num">{subject.derivations.length}</td>
                <td className="num">{subject.summary.bySeverity.high}</td>
                <td className="num">{subject.quality.overall}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dim" style={{ fontSize: 11, marginTop: 10, padding: '0 14px 12px' }}>
          Findings are not comparable across subjects with different documentation volume, which is
          why the document and fact counts sit next to them.
        </div>
      </Panel>
    </div>
  );
}

