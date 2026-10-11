import { STAGE_LABEL, STAGE_ORDER, type BuildPlan, type BuildStage, type BuildStep } from '../../builder/types';

interface BuildStateProps {
  stage: BuildStage;
  progress: number;
  steps: BuildStep[];
  plan: BuildPlan | null;
  error: string | null;
  compact?: boolean;
}

const PIPELINE: BuildStage[] = STAGE_ORDER.filter((stage) => stage !== 'ready');

/**
 * The build pipeline.
 *
 * Every line here is a step the backend actually reported, including its real
 * counts. Nothing is on a timer, and a step that has not happened yet is shown
 * as pending rather than animated into existence.
 */
export function BuildState({ stage, progress, steps, plan, error, compact = false }: BuildStateProps) {
  const reachedIndex = Math.max(
    0,
    PIPELINE.indexOf(stage) === -1 ? (stage === 'ready' ? PIPELINE.length : 0) : PIPELINE.indexOf(stage),
  );
  const lastStep = steps[steps.length - 1] ?? null;

  return (
    <div className={`buildstate${compact ? ' is-compact' : ''}`}>
      <div className="buildstate-rail" role="list" aria-label="Build stages">
        {PIPELINE.map((entry, index) => {
          const done = stage === 'ready' || index < reachedIndex;
          const active = index === reachedIndex && stage !== 'ready' && stage !== 'idle';
          return (
            <div
              key={entry}
              role="listitem"
              className={`buildstate-node${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
            >
              <span className="buildstate-dot" aria-hidden="true" />
              <span className="buildstate-name">{STAGE_LABEL[entry]}</span>
            </div>
          );
        })}
      </div>

      <div className="buildstate-track" aria-hidden="true">
        <div className="buildstate-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {!compact && (
        <div className="buildstate-body">
          <div className="buildstate-now">
            <div className="buildstate-label">
              {error ? 'Build failed' : (lastStep?.label ?? 'Waiting for a description')}
            </div>
            <div className="buildstate-detail">
              {error ?? lastStep?.detail ?? 'Type what you want to build, or pick a suggestion.'}
            </div>
            {lastStep?.metrics && Object.keys(lastStep.metrics).length > 0 && (
              <div className="buildstate-metrics">
                {Object.entries(lastStep.metrics).map(([key, value]) => (
                  <span key={key} className="buildstate-metric">
                    <b>{value}</b>
                    <span>{key}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {plan && (
            <div className="buildstate-plan">
              <div className="buildstate-plan-head">
                <span className="buildstate-plan-name">{plan.scenarioLabel}</span>
                <span
                  className={`buildstate-plan-tag${plan.matchedBy === 'fallback' ? ' is-soft' : ''}`}
                >
                  {plan.matchedBy === 'keywords'
                    ? 'matched on your words'
                    : plan.matchedBy === 'attachment'
                      ? 'your attachment'
                      : 'default record'}
                </span>
              </div>
              <div className="buildstate-plan-grid">
                <div>
                  <span className="buildstate-plan-k">Documents</span>
                  <span className="buildstate-plan-v">{plan.documentCount}</span>
                </div>
                <div>
                  <span className="buildstate-plan-k">Rules</span>
                  <span className="buildstate-plan-v">{plan.ruleCount}</span>
                </div>
                <div>
                  <span className="buildstate-plan-k">Extractors</span>
                  <span className="buildstate-plan-v">{plan.extractors.length}</span>
                </div>
              </div>
              {plan.caveats.map((caveat) => (
                <div key={caveat} className="buildstate-caveat">
                  {caveat}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
