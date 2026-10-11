import { useMemo } from 'react';
import { usePrefersReducedMotion, useScrollProgress, stageProgress } from '../../builder/scroll';
import { storySample, type StorySample } from '../../builder/story';
import type { BuildArtifact } from '../../builder/types';

/* ------------------------------------------------------------------ */
/* The pipeline, told by scrolling                                     */
/*                                                                    */
/* The panel is pinned while the narrative advances. Panels cross-fade  */
/* rather than cut, so the reader's eye is never asked to re-orient.    */
/* With reduced motion the section collapses to a plain list, which is  */
/* the same content without the choreography.                          */
/*                                                                    */
/* Every diagram below is drawn from a real artifact: the document is a */
/* document the engine read, the highlighted spans are the spans it     */
/* stored, the intervals are courses it reconstructed, and the proof is */
/* a proof it emitted. When there is no artifact yet the diagrams are   */
/* blank schematics that claim nothing.                                 */
/* ------------------------------------------------------------------ */

interface Chapter {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
}

const CHAPTERS: Chapter[] = [
  {
    id: 'read',
    eyebrow: 'Step one',
    title: 'Every document is read, not summarised',
    body: 'Ingestion keeps the raw text and the character offsets. Section headings decide how a line is interpreted, so a value under a medication list and the same value in a discharge paragraph are treated differently.',
  },
  {
    id: 'link',
    eyebrow: 'Step two',
    title: 'The same concept becomes one entity',
    body: 'The same concept written several different ways across several documents resolves to a single entity, with every surface form and every document retained. Edges record which facts justified them, and edges the engine inferred are marked as inferred.',
  },
  {
    id: 'reason',
    eyebrow: 'Step three',
    title: 'Rules reason over intervals, not dates',
    body: 'A medication is not a date, it is a period. Reconstructing courses and condition spans lets a rule ask whether one interval contained another, which is how a prescription written against a recorded allergy is caught rather than missed.',
  },
  {
    id: 'prove',
    eyebrow: 'Step four',
    title: 'Every conclusion is a proof, not a sentence',
    body: 'A finding is a directed acyclic graph ending in exactly one conclusion. Confidence is propagated from the premises through the rule, never asserted, and each rule must declare what it refuses to conclude.',
  },
];

/** The caption under each diagram, built from the sample rather than written. */
function figureFor(index: number, sample: StorySample): { value: string; label: string } {
  if (!sample.document) return { value: '—', label: 'waiting for the first build' };

  switch (index) {
    case 0:
      return {
        value: `${sample.factsTotal} facts`,
        label: 'each one re-readable from its own span',
      };
    case 1:
      return sample.entity
        ? {
            value: `${sample.entity.forms.length} forms → 1`,
            label: `one entity across ${sample.entity.docCount} documents`,
          }
        : { value: '—', label: 'no concept written more than one way' };
    case 2:
      return { value: `${sample.intervals.length} intervals`, label: sample.intervalCaption };
    default:
      return sample.proof
        ? { value: `${sample.proof.steps} steps`, label: sample.proof.shape }
        : { value: '—', label: 'no rule fired on this record' };
  }
}

export function Scrollytelling({ artifact }: { artifact: BuildArtifact | null }) {
  const reduced = usePrefersReducedMotion();
  const { ref, progress } = useScrollProgress<HTMLElement>();

  /*
   * The diagrams are derived here rather than passed in, so that the module that
   * knows how to read an artifact for illustration travels with the section that
   * displays it — and out of the initial bundle.
   */
  const sample = useMemo(() => storySample(artifact), [artifact]);

  const raw = progress * CHAPTERS.length;
  const active = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(raw)));
  const captionOpacity = 1 - stageProgress(progress, 0.02, 0.12);
  const figure = figureFor(active, sample);

  return (
    <section
      className={`scrollstory${reduced ? ' is-static' : ''}`}
      ref={ref}
      style={{ '--chapters': CHAPTERS.length } as React.CSSProperties}
    >
      <div className="scrollstory-sticky">
        <div className="scrollstory-inner">
          <div className="scrollstory-copy">
            <div className="scrollstory-eyebrow">How a build happens</div>
            <h2 className="scrollstory-title">Four steps, none of them a black box</h2>

            <ol className="scrollstory-steps">
              {CHAPTERS.map((chapter, index) => {
                const state =
                  index < active ? 'is-past' : index === active ? 'is-active' : 'is-future';
                return (
                  <li className={`scrollstory-step ${state}`} key={chapter.id}>
                    <span className="scrollstory-step-mark" aria-hidden="true" />
                    <div className="scrollstory-step-body">
                      <div className="scrollstory-step-eyebrow">{chapter.eyebrow}</div>
                      <div className="scrollstory-step-title">{chapter.title}</div>
                      <p className="scrollstory-step-text">{chapter.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="scrollstory-stage">
            <div className="scrollstory-figure">
              {CHAPTERS.map((chapter, index) => {
                const opacity = Math.max(0, 1 - Math.abs(index - active) * 0.9);
                return (
                  <div
                    className="scrollstory-visual"
                    key={chapter.id}
                    style={{ opacity, pointerEvents: opacity > 0.5 ? 'auto' : 'none' }}
                    aria-hidden={index !== active}
                  >
                    <Visual index={index} sample={sample} />
                  </div>
                );
              })}
            </div>

            <div className="scrollstory-caption" style={{ opacity: captionOpacity }}>
              <span className="scrollstory-caption-value">{figure.value}</span>
              <span className="scrollstory-caption-label">{figure.label}</span>
            </div>

            <div className="scrollstory-progress" aria-hidden="true">
              {CHAPTERS.map((chapter, index) => (
                <span
                  key={chapter.id}
                  className={`scrollstory-tick${index <= active ? ' is-on' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Visual({ index, sample }: { index: number; sample: StorySample }) {
  if (index === 0) return <ReadVisual sample={sample} />;
  if (index === 1) return <LinkVisual sample={sample} />;
  if (index === 2) return <IntervalVisual sample={sample} />;
  return <ProofVisual sample={sample} />;
}

/* ---------------------------- Chapter one --------------------------- */

/** Split a line into plain and highlighted runs at the real span boundaries. */
function segments(line: { text: string; highlights: Array<{ start: number; end: number }> }) {
  if (line.highlights.length === 0) return [{ text: line.text, marked: false }];

  const parts: Array<{ text: string; marked: boolean }> = [];
  let cursor = 0;
  for (const { start, end } of line.highlights) {
    if (start > cursor) parts.push({ text: line.text.slice(cursor, start), marked: false });
    parts.push({ text: line.text.slice(start, end), marked: true });
    cursor = end;
  }
  if (cursor < line.text.length) parts.push({ text: line.text.slice(cursor), marked: false });
  return parts;
}

function ReadVisual({ sample }: { sample: StorySample }) {
  if (!sample.document) return <Schematic lines={4} note="Waiting for the first build" />;
  const doc = sample.document;

  return (
    <div className="story-doc">
      <div className="story-doc-head">
        <span className="story-doc-kind">{doc.kind}</span>
        <span className="story-doc-date mono">{doc.date}</span>
      </div>

      <div className="story-doc-lines">
        {doc.lines.map((line, index) => (
          <div className="story-doc-line" key={index}>
            {segments(line).map((part, partIndex) =>
              part.marked ? (
                <mark className="story-hl" key={partIndex}>
                  {part.text}
                </mark>
              ) : (
                <span key={partIndex}>{part.text}</span>
              ),
            )}
          </div>
        ))}
      </div>

      <div className="story-doc-foot">
        <span className="mono">{doc.factsInDocument}</span> facts read from{' '}
        <span className="story-doc-foot-name">{doc.title}</span>
      </div>
    </div>
  );
}

/* ---------------------------- Schematic ----------------------------- */

/** An unlabelled shape, used only before an artifact exists. */
function Schematic({ lines, note }: { lines: number; note: string }) {
  return (
    <div className="story-schematic">
      <div className="story-schematic-rows">
        {Array.from({ length: lines }).map((_, index) => (
          <span key={index} style={{ width: `${86 - index * 12}%` }} />
        ))}
      </div>
      <div className="story-schematic-note">{note}</div>
    </div>
  );
}

/* ---------------------------- Chapter two --------------------------- */

function LinkVisual({ sample }: { sample: StorySample }) {
  if (!sample.entity) {
    return <Schematic lines={3} note="No concept was written more than one way" />;
  }
  const { forms, label, docCount, factCount, totalEntities } = sample.entity;

  return (
    <div className="story-link">
      <div className="story-link-forms">
        {forms.map((form) => (
          <div className="story-form" key={form.text}>
            <span className="story-form-text">{form.text}</span>
            <span className="story-form-docs mono">
              {form.docs} doc{form.docs === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>

      <div className="story-link-join" aria-hidden="true">
        {forms.map((form) => (
          <span className="story-link-wire" key={form.text} />
        ))}
      </div>

      <div className="story-link-node">
        <span className="story-node-label">{label}</span>
        <span className="story-node-sub mono">
          {factCount} facts · {docCount} documents
        </span>
        <span className="story-node-sub mono dim">{totalEntities} entities resolved</span>
      </div>
    </div>
  );
}

/* -------------------------- Chapter three --------------------------- */

function IntervalVisual({ sample }: { sample: StorySample }) {
  if (sample.intervals.length === 0) {
    return <Schematic lines={3} note="No intervals were reconstructed" />;
  }

  return (
    <div className="story-intervals">
      {sample.intervals.map((row) => (
        <div className="story-interval-row" key={`${row.label}-${row.start}`}>
          <div className="story-interval-label" title={row.detail}>
            {row.label}
          </div>
          <div className="story-interval-track">
            <div
              className={`story-interval-bar is-${row.tone}`}
              style={{ left: `${row.start * 100}%`, width: `${row.width * 100}%` }}
              title={row.detail}
            />
          </div>
          <div className="story-interval-when mono">{row.detail.split(' · ')[0]}</div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Chapter four --------------------------- */

const NODE_W = 128;
const NODE_H = 36;
const GAP_X = 44;
const GAP_Y = 14;
const PAD = 8;

function ProofVisual({ sample }: { sample: StorySample }) {
  if (!sample.proof) return <Schematic lines={3} note="No rule fired on this record" />;

  const { nodes, edges } = sample.proof;
  const columns = Math.max(...nodes.map((node) => node.level)) + 1;
  const rows = Math.max(...nodes.map((node) => node.row)) + 1;
  const width = PAD * 2 + columns * NODE_W + (columns - 1) * GAP_X;
  const height = PAD * 2 + rows * NODE_H + (rows - 1) * GAP_Y;

  const box = (node: { level: number; row: number }) => ({
    x: PAD + node.level * (NODE_W + GAP_X),
    y: PAD + node.row * (NODE_H + GAP_Y),
  });

  return (
    <svg
      className="story-proof"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Proof graph with ${nodes.length} steps`}
    >
      {edges.map((edge, index) => {
        const from = box(nodes[edge.from]);
        const to = box(nodes[edge.to]);
        const x1 = from.x + NODE_W;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x;
        const y2 = to.y + NODE_H / 2;
        const mid = (x1 + x2) / 2;
        return (
          <path
            key={index}
            className="story-proof-edge"
            d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
            style={{ animationDelay: `${index * 90}ms` }}
          />
        );
      })}

      {nodes.map((node, index) => {
        const at = box(node);
        return (
          <g
            key={index}
            className={`story-proof-step is-${node.kind}`}
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <rect
              x={at.x}
              y={at.y}
              width={NODE_W}
              height={NODE_H}
              rx={7}
              className="story-proof-box"
            />
            <text x={at.x + 10} y={at.y + 15} className="story-proof-kind">
              {node.kind}
            </text>
            <text x={at.x + 10} y={at.y + 28} className="story-proof-label">
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
