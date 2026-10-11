import type { BuildPlan, BuildStage, BuildStep } from '../../builder/types';

/* ------------------------------------------------------------------ */
/* Build-stage panels                                                  */
/*                                                                    */
/* Each panel reads the metrics the backend actually reported. No value */
/* here is computed for display purposes or advanced on a timer.        */
/* ------------------------------------------------------------------ */

function metricsOf(steps: BuildStep[], stage: BuildStage): Record<string, number | string> {
  return steps
    .filter((step) => step.stage === stage)
    .reduce<Record<string, number | string>>((acc, step) => ({ ...acc, ...(step.metrics ?? {}) }), {});
}

const num = (value: number | string | undefined, fallback = 0) =>
  typeof value === 'number' ? value : fallback;

/* ------------------------------ Empty ----------------------------- */

/**
 * The empty state is not a blank panel. It shows the shape of the product that
 * will be built, so the composer reads as a tool rather than a search box.
 */
export function EmptyPreview() {
  const rows = ['Active problems', 'Medication courses', 'Open findings', 'Monitoring'];
  return (
    <div className="preview-empty">
      <div className="preview-empty-head">
        <span className="preview-empty-title">Nothing built yet</span>
        <span className="preview-empty-sub">
          Describe a record above and the preview fills in with the result.
        </span>
      </div>
      <div className="preview-skeleton">
        {rows.map((row, index) => (
          <div
            className="preview-skeleton-row"
            key={row}
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <span className="preview-skeleton-label">{row}</span>
            <span className="preview-skeleton-bar" style={{ width: `${72 - index * 11}%` }} />
          </div>
        ))}
      </div>
      <div className="preview-empty-foot">
        Every figure in this preview is read back out of the build. Nothing is a placeholder
        animation.
      </div>
    </div>
  );
}

/* ------------------------------ Plan ------------------------------ */

export function PlanPreview({ plan }: { plan: BuildPlan }) {
  return (
    <div className="preview-panel">
      <div className="preview-panel-head">
        <span className="preview-panel-title">{plan.scenarioLabel}</span>
        <span className={`preview-chip${plan.matchedBy === 'fallback' ? ' is-soft' : ''}`}>
          {plan.matchedBy === 'keywords'
            ? `matched on ${plan.matchedOn.length} keyword${plan.matchedOn.length === 1 ? '' : 's'}`
            : plan.matchedBy === 'attachment'
              ? 'from your attachment'
              : 'default record'}
        </span>
      </div>

      {plan.matchedOn.length > 0 && (
        <div className="preview-tags">
          {plan.matchedOn.map((word) => (
            <span className="preview-tag" key={word}>
              {word}
            </span>
          ))}
        </div>
      )}

      <div className="preview-facts">
        <Stat label="Documents to read" value={plan.documentCount} />
        <Stat label="Rules available" value={plan.ruleCount} />
        <Stat label="Extractors" value={plan.extractors.length} />
      </div>

      <div className="preview-block">
        <div className="preview-block-label">Document kinds</div>
        <div className="preview-tags">
          {plan.documentKinds.map((kind) => (
            <span className="preview-tag is-quiet" key={kind}>
              {kind.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      <div className="preview-block">
        <div className="preview-block-label">Extractors engaged</div>
        <div className="preview-tags">
          {plan.extractors.map((extractor) => (
            <span className="preview-tag is-quiet" key={extractor}>
              {extractor}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="preview-fact">
      <span className="preview-fact-value">{value}</span>
      <span className="preview-fact-label">{label}</span>
    </div>
  );
}

/* ---------------------------- Ingesting --------------------------- */

export function IngestPreview({ steps, plan }: { steps: BuildStep[]; plan: BuildPlan | null }) {
  const reads = steps.filter((step) => step.stage === 'ingesting');
  const metrics = metricsOf(steps, 'ingesting');
  const total = plan?.documentCount ?? 0;

  return (
    <div className="preview-panel">
      <div className="preview-panel-head">
        <span className="preview-panel-title">Reading documents</span>
        <span className="preview-chip">
          {num(metrics.documents)} of {total}
        </span>
      </div>

      <div className="preview-facts">
        <Stat label="Facts so far" value={num(metrics.facts)} />
        <Stat label="Documents read" value={num(metrics.documents)} />
        <Stat label="Remaining" value={Math.max(total - num(metrics.documents), 0)} />
      </div>

      <div className="preview-list">
        {reads.map((step) => (
          <div className="preview-list-row is-in" key={step.id}>
            <span className="preview-list-dot" aria-hidden="true" />
            <span className="preview-list-text">{step.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Linking ---------------------------- */

export function LinkPreview({ steps }: { steps: BuildStep[] }) {
  const metrics = metricsOf(steps, 'linking');
  const entities = num(metrics.entities);
  const edges = num(metrics.edges);
  const inferred = num(metrics.inferred);

  return (
    <div className="preview-panel">
      <div className="preview-panel-head">
        <span className="preview-panel-title">Resolving entities</span>
        <span className="preview-chip">{num(metrics.facts)} facts</span>
      </div>

      <div className="preview-facts">
        <Stat label="Entities" value={entities} />
        <Stat label="Edges" value={edges} />
        <Stat label="Inferred edges" value={inferred} />
      </div>

      <MiniGraph entities={entities} edges={edges} />

      <div className="preview-note">
        Edges the engine read from a document and edges it inferred are counted separately, so the
        two are never confused.
      </div>
    </div>
  );
}

/** A node cloud whose density reflects the real entity and edge counts. */
function MiniGraph({ entities, edges }: { entities: number; edges: number }) {
  const nodes = Math.min(entities, 22);
  if (nodes === 0) return <div className="preview-graph is-empty">Waiting for the graph.</div>;

  const radius = 46;
  const cx = 80;
  const cy = 56;

  const point = (index: number) => {
    const angle = (index / nodes) * Math.PI * 2;
    const wobble = 0.55 + ((index * 37) % 45) / 100;
    return {
      x: cx + Math.cos(angle) * radius * wobble,
      y: cy + Math.sin(angle) * radius * wobble * 0.72,
    };
  };

  return (
    <div className="preview-graph">
      <svg viewBox="0 0 160 112" role="img" aria-label={`${entities} entities, ${edges} edges`}>
        {Array.from({ length: nodes }).map((_, index) => {
          const { x, y } = point(index);
          return (
            <line key={`e-${index}`} x1={cx} y1={cy} x2={x} y2={y} className="preview-graph-edge" />
          );
        })}
        {Array.from({ length: nodes }).map((_, index) => {
          const { x, y } = point(index);
          return (
            <circle
              key={`n-${index}`}
              cx={x}
              cy={y}
              r={index % 5 === 0 ? 4 : 2.6}
              className={index % 5 === 0 ? 'preview-graph-node is-major' : 'preview-graph-node'}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={7} className="preview-graph-hub" />
      </svg>
    </div>
  );
}

/* ---------------------------- Inferring --------------------------- */

export function RulePreview({ steps }: { steps: BuildStep[] }) {
  const metrics = metricsOf(steps, 'inferring');

  return (
    <div className="preview-panel">
      <div className="preview-panel-head">
        <span className="preview-panel-title">Applying rules</span>
        <span className="preview-chip">{num(metrics.rules)} rules</span>
      </div>

      <div className="preview-facts">
        <Stat label="Derivations" value={num(metrics.derivations)} />
        <Stat label="High severity" value={num(metrics.high)} />
        <Stat label="Categories" value={num(metrics.categories)} />
      </div>

      <div className="preview-list">
        {steps
          .filter((step) => step.stage === 'inferring')
          .map((step) => (
            <div className="preview-list-row is-in" key={step.id}>
              <span className="preview-list-dot is-rule" aria-hidden="true" />
              <span className="preview-list-text">{step.detail}</span>
            </div>
          ))}
      </div>

      <div className="preview-note">
        Rules that fire zero times are still counted. A rule that found nothing is a result, not an
        absence.
      </div>
    </div>
  );
}

/* ---------------------------- Packaging --------------------------- */

export function PackagePreview({ steps }: { steps: BuildStep[] }) {
  const metrics = metricsOf(steps, 'packaging');
  const coded = num(metrics.coded);
  const total = num(metrics.total);
  const percent = total === 0 ? 0 : Math.round((coded / total) * 100);

  return (
    <div className="preview-panel">
      <div className="preview-panel-head">
        <span className="preview-panel-title">Packaging</span>
        <span className="preview-chip">{num(metrics.resources)} resources</span>
      </div>

      <div className="preview-facts">
        <Stat label="FHIR resources" value={num(metrics.resources)} />
        <Stat label="Coded concepts" value={coded} />
        <Stat label="Total concepts" value={total} />
      </div>

      <div className="preview-meter">
        <div className="preview-meter-head">
          <span>Coding coverage</span>
          <span>{percent}%</span>
        </div>
        <div className="preview-meter-track">
          <div className="preview-meter-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="preview-meter-foot">
          Concepts with no standard code are listed as uncoded rather than silently dropped.
        </div>
      </div>
    </div>
  );
}
