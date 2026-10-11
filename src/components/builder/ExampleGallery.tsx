import { useState } from 'react';
import { useReveal } from '../../builder/scroll';

/* ------------------------------------------------------------------ */
/* The example wall                                                    */
/*                                                                    */
/* Each tile is a miniature of something the engine genuinely produces, */
/* and each carries the prompt that would build it. Hovering reveals    */
/* the prompt; choosing a tile loads that prompt and runs it.           */
/* ------------------------------------------------------------------ */

interface Example {
  id: string;
  name: string;
  prompt: string;
  /** What the miniature is showing. */
  caption: string;
}

const EXAMPLES: Example[] = [
  {
    id: 'longitudinal',
    name: 'Longitudinal record',
    prompt: 'Reconstruct a four-year medical history with every source document linked',
    caption: 'Documents, problems and medications across four years.',
  },
  {
    id: 'reconciliation',
    name: 'Medication reconciliation',
    prompt: 'Audit my medication list for anything that contradicts an earlier document',
    caption: 'Every course checked against every list that mentions it.',
  },
  {
    id: 'monitoring',
    name: 'Monitoring plan',
    prompt: 'Show me which monitoring tests are missing for my active conditions',
    caption: 'What each open condition should have generated, and what is absent.',
  },
  {
    id: 'proof',
    name: 'Proof explorer',
    prompt: 'Reconstruct a four-year medical history with every source document linked',
    caption: 'The derivation graph behind a single conclusion.',
  },
  {
    id: 'quality',
    name: 'Quality report',
    prompt: 'Find anything in my records that looks like a transcription or unit error',
    caption: 'Nine dimensions, each justified by the documents that moved it.',
  },
  {
    id: 'cohort',
    name: 'Cohort comparison',
    prompt: 'Run the same checks across several patients and show me which rules fire most',
    caption: 'One rule set over three structurally different records.',
  },
  {
    id: 'share',
    name: 'Share package',
    prompt: 'Prepare a redacted summary I can send to a specialist',
    caption: 'A FHIR bundle that keeps provenance, plus a redaction manifest.',
  },
  {
    id: 'trajectory',
    name: 'Trajectory view',
    prompt: 'Show me which monitoring tests are missing for my active conditions',
    caption: 'Fitted trends with the restated values excluded.',
  },
];

interface ExampleGalleryProps {
  onChoose: (prompt: string) => void;
  disabled?: boolean;
}

export function ExampleGallery({ onChoose, disabled = false }: ExampleGalleryProps) {
  const { ref, revealed } = useReveal<HTMLElement>({ threshold: 0.1 });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className={`gallery${revealed ? ' is-revealed' : ''}`} ref={ref}>
      <div className="gallery-head">
        <div className="gallery-eyebrow">What a prompt can produce</div>
        <h2 className="gallery-title">Pick one, or describe your own</h2>
        <p className="gallery-sub">
          Each of these is a real scenario in the product. Choosing one loads its description and runs
          the build.
        </p>
      </div>

      <div className="gallery-grid">
        {EXAMPLES.map((example, index) => (
          <article
            className={`example${open === example.id ? ' is-open' : ''}`}
            key={example.id}
            style={{ '--i': index } as React.CSSProperties}
          >
            <button
              type="button"
              className="example-toggle"
              onClick={() => setOpen(open === example.id ? null : example.id)}
              aria-expanded={open === example.id}
              aria-label={`${example.name}: ${example.caption}`}
            >
              <span className="example-screen">
                <Miniature id={example.id} />
              </span>
              <span className="example-body">
                <span className="example-name">{example.name}</span>
                <span className="example-caption">{example.caption}</span>
              </span>
            </button>

            <div className="example-prompt">
              <code className="example-prompt-text">{example.prompt}</code>
              <button
                type="button"
                className="example-run"
                onClick={() => onChoose(example.prompt)}
                disabled={disabled}
              >
                Build this
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Miniatures                                                          */
/*                                                                    */
/* Abstract but honest: each one draws the shape of the real output.    */
/* ------------------------------------------------------------------ */

function Miniature({ id }: { id: string }) {
  switch (id) {
    case 'reconciliation':
      return (
        <span className="mini mini-cols">
          <MiniList rows={4} tone="plain" />
          <span className="mini-vs">≠</span>
          <MiniList rows={4} tone="alert" />
        </span>
      );
    case 'monitoring':
      return (
        <span className="mini mini-checks">
          {[true, true, false, true, false].map((done, index) => (
            <span className="mini-check" key={index}>
              <span className={`mini-tick${done ? ' is-done' : ''}`} />
              <span className="mini-check-bar" style={{ width: `${64 - index * 7}%` }} />
            </span>
          ))}
        </span>
      );
    case 'proof':
      return (
        <span className="mini mini-proof">
          <span className="mini-node" />
          <span className="mini-node" />
          <span className="mini-node is-wide" />
          <span className="mini-node is-wide is-accent" />
          <span className="mini-wire is-one" />
          <span className="mini-wire is-two" />
          <span className="mini-wire is-three" />
        </span>
      );
    case 'quality':
      return (
        <span className="mini mini-bars">
          {[88, 72, 94, 61, 79].map((value, index) => (
            <span className="mini-bar-row" key={index}>
              <span className="mini-bar-label" />
              <span className="mini-bar-track">
                <span className="mini-bar-fill" style={{ width: `${value}%` }} />
              </span>
            </span>
          ))}
        </span>
      );
    case 'cohort':
      return (
        <span className="mini mini-cohort">
          {[3, 1, 5].map((count, column) => (
            <span className="mini-cohort-col" key={column}>
              {Array.from({ length: count }).map((_, dot) => (
                <span className={`mini-cohort-dot${dot === 0 ? ' is-high' : ''}`} key={dot} />
              ))}
            </span>
          ))}
        </span>
      );
    case 'share':
      return (
        <span className="mini mini-share">
          <span className="mini-doc">
            <span className="mini-doc-line" />
            <span className="mini-doc-line is-short" />
            <span className="mini-doc-line" />
          </span>
          <span className="mini-doc is-redacted">
            <span className="mini-doc-line is-blank" />
            <span className="mini-doc-line is-blank is-short" />
            <span className="mini-doc-line" />
          </span>
        </span>
      );
    case 'trajectory':
      return (
        <svg className="mini mini-line" viewBox="0 0 160 80" role="img" aria-label="Trend">
          <polyline className="mini-line-path" points="8,62 44,54 80,38 116,30 152,16" />
          {[
            [8, 62],
            [44, 54],
            [80, 38],
            [116, 30],
            [152, 16],
          ].map(([x, y], index) => (
            <circle className="mini-line-dot" key={index} cx={x} cy={y} r={3} />
          ))}
        </svg>
      );
    case 'longitudinal':
    default:
      return (
        <span className="mini mini-dash">
          <span className="mini-dash-top">
            <span className="mini-tile" />
            <span className="mini-tile" />
            <span className="mini-tile" />
          </span>
          <span className="mini-dash-years">
            {[38, 62, 44, 78, 30].map((height, index) => (
              <span className="mini-year" key={index} style={{ height: `${height}%` }} />
            ))}
          </span>
        </span>
      );
  }
}

function MiniList({ rows, tone }: { rows: number; tone: 'plain' | 'alert' }) {
  return (
    <span className={`mini-list is-${tone}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <span className="mini-list-row" key={index} style={{ width: `${92 - index * 9}%` }} />
      ))}
    </span>
  );
}
