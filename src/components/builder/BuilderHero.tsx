import { useScrollProgress, stageProgress } from '../../builder/scroll';
import type { BuildState as BuildStateModel } from '../../builder/types';
import type { AcceptedAttachment, RejectedAttachment } from '../../builder/attachments';
import type { DocKind } from '../../engine/types';
import { PromptComposer } from './PromptComposer';
import { PromptSuggestions } from './PromptSuggestions';
import { AttachmentTray } from './AttachmentTray';
import { BuildState } from './BuildState';
import { LivePreview } from './LivePreview';

interface BuilderHeroProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onPickSuggestion: (suggestion: string) => void;
  suggestions: string[];
  state: BuildStateModel;
  busy: boolean;
  attachments: AcceptedAttachment[];
  rejections: RejectedAttachment[];
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (filename: string) => void;
  onRetypeAttachment: (filename: string, kind: DocKind) => void;
  onDismissRejection: (filename: string) => void;
  onClearAttachments: () => void;
}

/**
 * The hero.
 *
 * The composer is the centre of gravity: everything else on the page is
 * subordinate to it. As the reader scrolls, the composer settles and the preview
 * lifts toward full scale, so the transition from "describing" to "looking at
 * what was built" happens continuously rather than as a section break.
 */
export function BuilderHero({
  prompt,
  onPromptChange,
  onSubmit,
  onPickSuggestion,
  suggestions,
  state,
  busy,
  attachments,
  rejections,
  onFiles,
  onRemoveAttachment,
  onRetypeAttachment,
  onDismissRejection,
  onClearAttachments,
}: BuilderHeroProps) {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  // Choreographed across the hero's traversal: nothing starts until it is settled.
  const settle = stageProgress(progress, 0.12, 0.5);
  const lift = stageProgress(progress, 0.24, 0.72);

  return (
    <section
      className="hero"
      ref={ref}
      style={
        {
          '--hero-settle': settle.toFixed(3),
          '--hero-lift': lift.toFixed(3),
        } as React.CSSProperties
      }
    >
      <div className="hero-glow" aria-hidden="true" />

      <div className="hero-inner">
        <div className="hero-label">
          <span className="hero-label-dot" aria-hidden="true" />
          Medical Memory
        </div>

        <h1 className="hero-title">
          Build anything
          <span className="hero-title-accent"> from a health record</span>
        </h1>

        <p className="hero-sub">
          Describe the record you want. The engine reads real documents, reconstructs the timeline,
          and returns findings that each carry the exact span they came from.
        </p>

        <div className="hero-composer">
          <PromptComposer
            value={prompt}
            onChange={onPromptChange}
            onSubmit={onSubmit}
            busy={busy}
            size="hero"
            onFiles={onFiles}
            attachmentCount={attachments.length}
            hint={
              attachments.length > 0
                ? `${attachments.length} document${attachments.length === 1 ? '' : 's'} will be read instead of the built-in record.`
                : 'Runs entirely in this browser. Drop a text file in, or use the built-in record.'
            }
          />
          <AttachmentTray
            attachments={attachments}
            rejections={rejections}
            onRemove={onRemoveAttachment}
            onRetype={onRetypeAttachment}
            onDismissRejection={onDismissRejection}
            onClear={onClearAttachments}
          />
          <PromptSuggestions
            suggestions={suggestions}
            onPick={onPickSuggestion}
            disabled={busy}
          />
        </div>

        {state.steps.length > 0 && (
          <div className="hero-buildstate">
            <BuildState
              stage={state.stage}
              progress={state.progress}
              steps={state.steps}
              plan={state.plan}
              error={state.error}
              compact={state.stage === 'ready'}
            />
          </div>
        )}

        <div className="hero-preview">
          <LivePreview state={state} />
        </div>

        <div className="hero-scroll" aria-hidden="true">
          <span>See how it works</span>
          <span className="hero-scroll-line" />
        </div>
      </div>
    </section>
  );
}
