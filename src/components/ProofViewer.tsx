import { useMemo } from 'react';
import type { Derivation, DerivationStep } from '../engine/derive/types';
import { STEP_KIND_LABEL, GRADE_LABEL, GRADE_MEANING } from '../engine/derive/types';
import { useStore } from '../state/store';
import { Chip } from './Panel';
import { Icon } from './Icon';
import { formatDate } from '../engine/text/normalize';

/* ------------------------------------------------------------------ */
/* Proof viewer                                                        */
/*                                                                    */
/* Renders a derivation as what it actually is: a directed acyclic      */
/* graph of steps ending in one conclusion. Premises are documented     */
/* statements, interval nodes are periods reconstructed from them, the  */
/* rule node is the inference, and the conclusion is the claim.         */
/*                                                                    */
/* Laying it out left to right by dependency level is what makes the    */
/* reasoning inspectable rather than merely asserted.                   */
/* ------------------------------------------------------------------ */

const COLUMN_WIDTH = 268;
const COLUMN_GAP = 46;
const ROW_HEIGHT = 132;
const ROW_GAP = 14;

interface Placed {
  step: DerivationStep;
  level: number;
  row: number;
  x: number;
  y: number;
}

const KIND_ACCENT: Record<DerivationStep['kind'], string> = {
  premise: 'var(--accent-2)',
  interval: 'var(--external)',
  rule: 'var(--medium)',
  conclusion: 'var(--accent)',
};

function layout(steps: DerivationStep[]): { placed: Placed[]; width: number; height: number } {
  const levelOf = new Map<string, number>();
  // Steps are appended in topological order, so a single forward pass suffices.
  for (const step of steps) {
    const level =
      step.dependsOn.length === 0
        ? 0
        : Math.max(...step.dependsOn.map((id) => (levelOf.get(id) ?? 0) + 1));
    levelOf.set(step.id, level);
  }

  const rowsByLevel = new Map<number, number>();
  const placed: Placed[] = [];
  for (const step of steps) {
    const level = levelOf.get(step.id) ?? 0;
    const row = rowsByLevel.get(level) ?? 0;
    rowsByLevel.set(level, row + 1);
    placed.push({
      step,
      level,
      row,
      x: level * (COLUMN_WIDTH + COLUMN_GAP),
      y: row * (ROW_HEIGHT + ROW_GAP),
    });
  }

  const levels = Math.max(0, ...Array.from(levelOf.values())) + 1;
  const rows = Math.max(0, ...Array.from(rowsByLevel.values()));
  return {
    placed,
    width: levels * COLUMN_WIDTH + (levels - 1) * COLUMN_GAP,
    height: Math.max(200, rows * (ROW_HEIGHT + ROW_GAP)),
  };
}

export function ProofGraph({ derivation }: { derivation: Derivation }) {
  const { openEvidence } = useStore();
  const { placed, width, height } = useMemo(() => layout(derivation.steps), [derivation]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.step.id, p])), [placed]);

  const edges = placed.flatMap((target) =>
    target.step.dependsOn
      .map((sourceId) => {
        const source = byId.get(sourceId);
        if (!source) return null;
        return { source, target, id: `${sourceId}->${target.step.id}` };
      })
      .filter((e): e is { source: Placed; target: Placed; id: string } => Boolean(e)),
  );

  return (
    <div className="proof-scroll">
      <div className="proof-canvas" style={{ width, height }}>
        <svg className="proof-edges" width={width} height={height}>
          {edges.map((edge) => {
            const x1 = edge.source.x + COLUMN_WIDTH;
            const y1 = edge.source.y + ROW_HEIGHT / 2;
            const x2 = edge.target.x;
            const y2 = edge.target.y + ROW_HEIGHT / 2;
            const midX = (x1 + x2) / 2;
            return (
              <path
                key={edge.id}
                d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`}
                fill="none"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1.4}
              />
            );
          })}
        </svg>

        {placed.map(({ step, x, y }) => (
          <div
            key={step.id}
            className={`proof-node is-${step.kind}`}
            style={{ left: x, top: y, width: COLUMN_WIDTH }}
          >
            <div className="proof-node-head">
              <span className="proof-kind" style={{ color: KIND_ACCENT[step.kind] }}>
                {STEP_KIND_LABEL[step.kind]}
              </span>
              <span className="mono dim" style={{ fontSize: 10 }}>
                {step.confidence.toFixed(2)}
              </span>
            </div>
            <div className="proof-node-label">{step.label}</div>
            <div className="proof-node-just">{step.justification}</div>
            {step.factIds.length > 0 && (
              <div className="proof-node-facts">
                {step.factIds.slice(0, 4).map((factId) => (
                  <button
                    key={factId}
                    type="button"
                    className="chip is-info is-button"
                    style={{ fontSize: 9.5, padding: '1px 6px' }}
                    onClick={() =>
                      openEvidence({
                        title: step.label,
                        subtitle: 'Cited statement',
                        factIds: [factId],
                      })
                    }
                  >
                    <Icon.Quote size={9} />
                    source
                  </button>
                ))}
                {step.factIds.length > 4 && <Chip tone="muted">+{step.factIds.length - 4}</Chip>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProofPanel({ derivation }: { derivation: Derivation }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="panel-title">Proof — {derivation.title}</div>
          <div className="panel-sub">
            {derivation.steps.length} steps · depth {derivation.depth} ·{' '}
            {GRADE_LABEL[derivation.grade]}
          </div>
        </div>
        <div className="panel-head-actions">
          <Chip tone={derivation.confidence >= 0.8 ? 'ok' : 'warn'}>
            confidence {derivation.confidence.toFixed(2)}
          </Chip>
        </div>
      </header>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="notice">
          <Icon.Warning size={14} />
          <div>
            <strong>Read this left to right.</strong> Each column depends on the one before it.
            Premises are statements read from documents; interval nodes are periods reconstructed
            from them; the rule node is the inference; the conclusion is the claim. Click any source
            chip to see the characters it came from.
          </div>
        </div>

        <div className="notice">
          <Icon.Circle size={14} />
          <div>
            <strong>What the numbers mean.</strong> The evidence grade describes provenance only —{' '}
            {GRADE_MEANING.toLowerCase()} The confidence is the propagation of the premises'
            source authority through the rule's declared reliability, computed by the engine; it is
            not an assertion about whether the underlying value is correct.
          </div>
        </div>

        <ProofGraph derivation={derivation} />

        <div className="grid grid-2">
          <div className="conflict-ask">
            <strong>Ask:</strong> {derivation.question}
          </div>
          <div className="conflict-not">
            <strong>Not concluded:</strong> {derivation.notConcluded}
          </div>
        </div>

        {derivation.satisfiableBy && (
          <div className="answer-block is-provenance">
            <div className="answer-block-title">What would clear this</div>
            <div className="answer-text">{derivation.satisfiableBy}</div>
          </div>
        )}

        {derivation.guideline && (
          <a
            className="answer-item"
            href={derivation.guideline.url}
            target="_blank"
            rel="noreferrer noopener"
            style={{ textDecoration: 'none' }}
          >
            <div className="answer-item-label">
              <span className="dot external" />
              <span>{derivation.guideline.title}</span>
              <Chip tone="external">{derivation.guideline.source}</Chip>
              <Icon.Link size={12} />
            </div>
            <div className="answer-item-sub">
              The threshold or expectation this rule compares against, from a public source.
            </div>
          </a>
        )}

        <div className="dim mono" style={{ fontSize: 10.5 }}>
          rule {derivation.ruleId} · window {formatDate(derivation.window.start)} →{' '}
          {formatDate(derivation.window.end)}
        </div>
      </div>
    </section>
  );
}

