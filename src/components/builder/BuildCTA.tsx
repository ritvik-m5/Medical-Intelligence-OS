import { useReveal } from '../../builder/scroll';
import { PromptComposer } from './PromptComposer';

interface BuildCTAProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  /** Leave the builder and open the full workspace. */
  onEnterWorkspace: () => void;
  busy: boolean;
  /** Real counts from the last build, shown as the payoff. */
  summary: { documents: number; facts: number; derivations: number } | null;
}

/**
 * The closing call to action.
 *
 * It is the composer again, not a button, because the point of the page is that
 * the composer is the product. The workspace link sits beside it as the second
 * option rather than the only one.
 */
export function BuildCTA({
  prompt,
  onPromptChange,
  onSubmit,
  onEnterWorkspace,
  busy,
  summary,
}: BuildCTAProps) {
  const { ref, revealed } = useReveal<HTMLElement>({ threshold: 0.25 });

  return (
    <section className={`cta${revealed ? ' is-revealed' : ''}`} ref={ref}>
      <div className="cta-glow" aria-hidden="true" />
      <div className="cta-inner">
        <h2 className="cta-title">Describe it. Watch it get built.</h2>
        <p className="cta-sub">
          {summary
            ? `The last build read ${summary.documents} documents, extracted ${summary.facts} facts and produced ${summary.derivations} derivations.`
            : 'Every build runs the real pipeline in your browser and returns proof, not prose.'}
        </p>

        <div className="cta-composer">
          <PromptComposer
            value={prompt}
            onChange={onPromptChange}
            onSubmit={onSubmit}
            busy={busy}
            size="compact"
            hint="Nothing leaves this tab."
          />
        </div>

        <div className="cta-actions">
          <button type="button" className="cta-enter" onClick={onEnterWorkspace}>
            Open the full workspace
            <span className="cta-enter-arrow" aria-hidden="true">
              →
            </span>
          </button>
          <span className="cta-note">
            Thirteen views over the same graph: timeline, intervals, proof graphs, quality, cohort and
            export.
          </span>
        </div>
      </div>
    </section>
  );
}
