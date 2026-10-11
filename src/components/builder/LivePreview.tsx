import type { BuildState } from '../../builder/types';
import { STAGE_LABEL } from '../../builder/types';
import { GeneratedAppFrame } from './GeneratedAppFrame';
import {
  EmptyPreview,
  IngestPreview,
  LinkPreview,
  PackagePreview,
  PlanPreview,
  RulePreview,
} from './PreviewPanels';
import { ReadyPreview } from './PreviewReady';

interface LivePreviewProps {
  state: BuildState;
}

/**
 * The live preview.
 *
 * The frame is constant; the body changes with the stage, and each stage renders
 * what the backend has genuinely produced so far. There is no spinner standing in
 * for work — if the preview shows 47 facts, 47 facts have been extracted.
 */
export function LivePreview({ state }: LivePreviewProps) {
  const { stage, plan, steps, artifact, error } = state;

  const badge =
    stage === 'ready' ? (
      <span className="preview-badge is-ready">built in {artifact?.elapsedMs ?? 0} ms</span>
    ) : stage === 'error' ? (
      <span className="preview-badge is-error">failed</span>
    ) : (
      <span className={`preview-badge${stage === 'idle' ? ' is-idle' : ''}`}>
        {STAGE_LABEL[stage]}
      </span>
    );

  return (
    <GeneratedAppFrame
      address={`medical-memory.local/preview/${artifact?.scenarioId ?? plan?.scenarioId ?? '—'}`}
      badge={badge}
    >
      {error ? (
        <div className="preview-error">
          <div className="preview-error-title">The build stopped</div>
          <div className="preview-error-body">{error}</div>
        </div>
      ) : stage === 'ready' && artifact ? (
        <ReadyPreview artifact={artifact} />
      ) : stage === 'planning' && plan ? (
        <PlanPreview plan={plan} />
      ) : stage === 'ingesting' ? (
        <IngestPreview steps={steps} plan={plan} />
      ) : stage === 'linking' ? (
        <LinkPreview steps={steps} />
      ) : stage === 'inferring' ? (
        <RulePreview steps={steps} />
      ) : stage === 'packaging' ? (
        <PackagePreview steps={steps} />
      ) : (
        <EmptyPreview />
      )}
    </GeneratedAppFrame>
  );
}
