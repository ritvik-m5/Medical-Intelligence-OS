import type { Receipt } from '../chat/conversation';
import type { ArtifactIdentity } from '../engine/identity';
import type { HealthGraph } from '../engine/types';
import type { Derivation } from '../engine/derive/types';
import type { ProvenanceReport } from '../engine/verify';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ */
/* The receipt                                                         */
/*                                                                    */
/* A compact answer to "what produced this?" — the same six facts every */
/* time, in the same order, so a reader learns to read it once and then */
/* trusts it everywhere.                                                */
/*                                                                    */
/* It is deliberately plain. A receipt that looked like a dashboard     */
/* would be scanned rather than read, and the one line that matters      */
/* most is the last: whether a model wrote the prose.                    */
/* ------------------------------------------------------------------ */

interface ReceiptProps {
  receipt: Receipt;
  /** Collapsed by default, because a reader usually wants the answer first. */
  defaultOpen?: boolean;
}

/**
 * Build a receipt from the raw artifact, without the rest of a chat context.
 *
 * Used by the views so the same six facts appear the same way everywhere, and so
 * a receipt is never assembled by hand in a place that could drift from the
 * artifact it describes.
 */
export function artifactReceipt(
  identity: ArtifactIdentity,
  graph: HealthGraph,
  derivations: Derivation[],
  verification: ProvenanceReport,
  options: { modelUsed?: boolean; steps?: number | null } = {},
): Receipt {
  return {
    artifactId: identity.artifactId,
    displayId: identity.id,
    engineVersion: identity.engineVersion,
    rulesetVersion: identity.rulesetVersion,
    documents: graph.documents.length,
    facts: graph.facts.length,
    derivations: derivations.length,
    steps: options.steps ?? null,
    verification: { score: verification.score, clean: verification.clean },
    modelUsed: options.modelUsed ?? false,
  };
}

export function ReceiptView({ receipt, defaultOpen = false }: ReceiptProps) {
  return (
    <details className="receipt" open={defaultOpen}>
      <summary className="receipt-summary">
        <Icon.Quote size={12} />
        <span className="receipt-title">Medical Memory receipt</span>
        <code className="receipt-id">{receipt.displayId}</code>
        <span className={`receipt-flag is-${receipt.modelUsed ? 'model' : 'engine'}`}>
          {receipt.modelUsed ? 'model rewrote the prose' : 'engine wrote this'}
        </span>
      </summary>

      <dl className="receipt-body">
        <div className="receipt-row">
          <dt>Artifact</dt>
          <dd>
            <code title={receipt.artifactId}>{receipt.displayId}</code>
          </dd>
        </div>
        <div className="receipt-row">
          <dt>Corpus</dt>
          <dd>
            {receipt.documents} document{receipt.documents === 1 ? '' : 's'} · {receipt.facts} facts
          </dd>
        </div>
        <div className="receipt-row">
          <dt>Engine</dt>
          <dd>
            <code>{receipt.engineVersion}</code> · ruleset{' '}
            <code title={receipt.rulesetVersion}>{receipt.rulesetVersion.slice(0, 10)}</code>
          </dd>
        </div>
        <div className="receipt-row">
          <dt>Findings</dt>
          <dd>
            {receipt.derivations}
            {receipt.steps !== null && <> · this proof is {receipt.steps} steps</>}
          </dd>
        </div>
        <div className="receipt-row">
          <dt>Verification</dt>
          <dd className={receipt.verification.clean ? 'is-ok' : 'is-warn'}>
            {receipt.verification.score}%{receipt.verification.clean ? ' · clean' : ' · problems found'}
          </dd>
        </div>
        <div className="receipt-row">
          <dt>Model used</dt>
          <dd className={receipt.modelUsed ? 'is-warn' : 'is-ok'}>
            {receipt.modelUsed ? 'Yes — wording only, never evidence' : 'No'}
          </dd>
        </div>
      </dl>
    </details>
  );
}
