import { Chip } from './Panel';
import { Icon } from './Icon';
import {
  assessDuplicate,
  changedFacts,
  compareFacts,
  DUPLICATE_TYPE_LABEL,
  type DocumentShape,
} from '../engine/document/identity';
import { describeDelta, type ReconciliationImpact } from '../engine/document/reconcile';
import { formatDate } from '../engine/text/normalize';
import type { Fact } from '../engine/types';

/* ------------------------------------------------------------------ */
/* Reconciliation panel                                                */
/*                                                                    */
/* The "possible duplicate" surface. Every number and every reason here  */
/* comes from the deterministic identity engine — never a second UI-only  */
/* similarity score. The default action is always non-destructive.        */
/* ------------------------------------------------------------------ */

export interface ReconciliationPanelProps {
  existing: DocumentShape;
  incoming: DocumentShape;
  existingFacts: Fact[];
  incomingFacts: Fact[];
  /** The actual consequence of keeping, pre-computed by the engine. */
  impact: ReconciliationImpact;
  onKeepBoth: () => void;
  onDiscard: () => void;
  /** Open a fact's source span. */
  onOpenFact?: (fact: Fact) => void;
}

export function ReconciliationPanel({
  existing,
  incoming,
  existingFacts,
  incomingFacts,
  impact,
  onKeepBoth,
  onDiscard,
  onOpenFact,
}: ReconciliationPanelProps) {
  const assessment = assessDuplicate(existing, incoming);
  const diff = compareFacts(existingFacts, incomingFacts);
  const changed = changedFacts(existingFacts, incomingFacts);

  const fieldLabel = (field: string) =>
    ({ title: 'title', kind: 'document type', date: 'date', facility: 'facility' })[field] ?? field;

  return (
    <div className="reconcile">
      <header className="reconcile-head">
        <Chip tone="warn">{DUPLICATE_TYPE_LABEL[assessment.type]}</Chip>
        <h3 className="reconcile-title">Possible {DUPLICATE_TYPE_LABEL[assessment.type].toLowerCase()}</h3>
      </header>

      <div className="reconcile-cols">
        <div className="reconcile-doc">
          <div className="reconcile-doc-label">Existing record</div>
          <strong>{existing.title}</strong>
          <span>{formatDate(existing.date)}</span>
          <span>{existing.facility}</span>
        </div>
        <div className="reconcile-doc">
          <div className="reconcile-doc-label">New record</div>
          <strong>{incoming.title}</strong>
          <span>{formatDate(incoming.date)}</span>
          <span>{incoming.facility}</span>
        </div>
      </div>

      <section className="reconcile-section">
        <h4>Why this was flagged</h4>
        {assessment.reasons.map((reason) => (
          <p key={reason} className="reconcile-reason">{reason}</p>
        ))}
      </section>

      {assessment.matchingFields.length > 0 && (
        <section className="reconcile-section">
          <h4>Matches</h4>
          <div className="reconcile-chips">
            {assessment.matchingFields.map((field) => (
              <Chip key={field} tone="ok">✓ {fieldLabel(field)}</Chip>
            ))}
          </div>
        </section>
      )}

      {assessment.differingFields.length > 0 && (
        <section className="reconcile-section">
          <h4>Differences</h4>
          <div className="reconcile-chips">
            {assessment.differingFields.map((field) => (
              <Chip key={field} tone="warn">{fieldLabel(field)} differs</Chip>
            ))}
          </div>
        </section>
      )}

      {(changed.length > 0 || diff.added > 0 || diff.removed > 0) && (
        <section className="reconcile-section">
          <h4>Fact changes</h4>
          {changed.map((fact) => (
            <div key={fact.entityKey} className="reconcile-change">
              <div className="reconcile-change-line">
                <span className="reconcile-change-label">{fact.label}</span>
                <span className="reconcile-change-value">{fact.oldValue ?? fact.oldText ?? ''}{fact.oldUnit ? ` ${fact.oldUnit}` : ''}</span>
              </div>
              <div className="reconcile-change-line is-new">
                <span className="reconcile-change-label">{fact.label}</span>
                <span className="reconcile-change-value">{fact.newValue ?? fact.newText ?? ''}{fact.newUnit ? ` ${fact.newUnit}` : ''}</span>
              </div>
            </div>
          ))}
          <p className="reconcile-meta">
            {diff.same} unchanged · {diff.added} added · {diff.removed} removed · {diff.changed} changed
          </p>
        </section>
      )}

      <section className="reconcile-section">
        <h4>What keeping this changes</h4>
        <p className="reconcile-impact">
          {impact.before.documents} → {impact.after.documents} documents ·{' '}
          {impact.before.facts} → {impact.after.facts} facts ·{' '}
          {impact.before.findings} → {impact.after.findings} findings
        </p>
        <p className="reconcile-meta">{describeDelta(impact.delta)}</p>
      </section>

      <footer className="reconcile-actions">
        <button type="button" className="btn is-primary" onClick={onKeepBoth}>
          <Icon.Plus size={13} />
          Keep both
        </button>
        <button type="button" className="btn is-danger" onClick={onDiscard}>
          <Icon.Close size={13} />
          Discard new
        </button>
        <button type="button" className="btn is-ghost" onClick={() => onOpenFact?.(existingFacts[0] ?? incomingFacts[0])}>
          <Icon.Records size={13} />
          Compare in detail
        </button>
      </footer>
    </div>
  );
}
