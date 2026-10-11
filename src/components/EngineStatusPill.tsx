import type { EngineStatus } from '../lib/engineStatus';
import { statusLine } from '../lib/engineStatus';

interface EngineStatusPillProps {
  status: EngineStatus;
  onOpen: () => void;
  /** Compact form for tight headers. */
  compact?: boolean;
}

/**
 * The persistent engine status.
 *
 * This exists to answer one question before the reader has to ask it: is this
 * showing me something that was computed, or something that was drawn? So it
 * reports real counts and a live provenance verdict, and it opens the artifact
 * when clicked.
 *
 * The verdict dot is the important part. It is green only because every fact was
 * re-read from its source span on this render, and it turns red the moment one
 * does not.
 */
export function EngineStatusPill({ status, onOpen, compact = false }: EngineStatusPillProps) {
  const verified = status.verification.clean;

  return (
    <button
      type="button"
      className={`engine-pill${verified ? ' is-verified' : ' is-failed'}`}
      onClick={onOpen}
      title={
        verified
          ? 'Every fact was re-read from its source span. Click to inspect the artifact.'
          : `${status.verification.problems.facts.length} facts and ${status.verification.problems.proofs.length} proofs did not verify. Click to see them.`
      }
      aria-label="Engine status and artifact inspector"
    >
      <span className="engine-pill-dot" aria-hidden="true" />
      <span className="engine-pill-label">Live engine</span>
      <span className="engine-pill-id mono" title="This result's name: corpus hash and result hash">
        {status.identity.id}
      </span>
      {!compact && <span className="engine-pill-line">{statusLine(status)}</span>}
      <span className="engine-pill-verdict">
        {verified ? `${status.verification.score}` : 'failed'}
      </span>
    </button>
  );
}
