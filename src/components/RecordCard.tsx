import { useStore } from '../state/store';
import { Icon } from './Icon';
import { Chip } from './Panel';
import { contextForDocument } from '../ai/context';
import {
  DOCUMENT_STATUS_LABEL,
  documentImpact,
  type DocumentSummary,
} from '../engine/document/summarize';
import { FACT_TYPE_LABEL, type Fact } from '../engine/types';
import { formatDate } from '../engine/text/normalize';
import { flagLabels, statusLabel } from '../lib/format';

export function RecordCard({ summary }: { summary: DocumentSummary }) {
  const store = useStore();
  const { engine, asOf, askAbout, openEvidence, setView } = store;

  const explain = () =>
    askAbout(
      contextForDocument(
        engine.identity.artifactId,
        asOf,
        { id: summary.docId, title: summary.title },
        [...summary.measurements, ...summary.medications, ...summary.conditions, ...summary.allergies].map((f) => f.id),
        summary.findings.map((f) => f.id),
        summary.plainLanguage,
      ),
    );

  const statusTone =
    summary.status === 'verified' ? 'ok' : summary.status === 'verified-with-flags' ? 'warn' : 'critical';

  const factButton = (fact: Fact, subtitle: string) => (
    <li key={fact.id}>
      <button
        type="button"
        className="record-card-fact"
        onClick={() => openEvidence({ title: fact.label, subtitle, factIds: [fact.id], docId: fact.docId })}
      >
        <span className="record-card-fact-type">{FACT_TYPE_LABEL[fact.type]}</span>
        {fact.label}
        {fact.valueNum !== undefined ? (
          <span className="record-card-fact-value">{fact.valueNum}{fact.unit ? ` ${fact.unit}` : ''}</span>
        ) : fact.status !== 'active' ? (
          <span className="record-card-fact-value">{statusLabel(fact.status)}</span>
        ) : null}
      </button>
    </li>
  );

  const hasFound =
    summary.measurements.length > 0 || summary.medications.length > 0 ||
    summary.conditions.length > 0 || summary.allergies.length > 0;

  return (
    <div className="record-card">
      <header className="record-card-head">
        <div>
          <h2 className="record-card-title">{summary.title}</h2>
          <div className="record-card-meta">
            {formatDate(summary.date)}
            {summary.facility ? ` · ${summary.facility}` : ''} · {summary.kind.replace(/_/g, ' ')}
          </div>
        </div>
        <Chip tone={statusTone}>{DOCUMENT_STATUS_LABEL[summary.status]}</Chip>
      </header>

      <section className="record-card-section">
        <h3 className="record-card-h3">In plain language</h3>
        <p className="record-card-body">{summary.plainLanguage}</p>
      </section>

      {hasFound && (
        <section className="record-card-section">
          <h3 className="record-card-h3">What Medical Memory found</h3>
          <ul className="record-card-list">
            {summary.measurements.slice(0, 5).map((f) => factButton(f, 'Measurement'))}
            {summary.medications.slice(0, 4).map((f) => factButton(f, 'Medication'))}
            {summary.conditions.slice(0, 4).map((f) => factButton(f, 'Condition'))}
            {summary.allergies.slice(0, 3).map((f) => factButton(f, 'Allergy'))}
          </ul>
        </section>
      )}

      {summary.flagged.length > 0 && (
        <section className="record-card-section">
          <h3 className="record-card-h3">Things the record questions</h3>
          <ul className="record-card-list">
            {summary.flagged.slice(0, 5).map((fact) => (
              <li key={fact.id} className="record-card-flag">
                {fact.label} — {flagLabels(fact.flags).join(', ')}
              </li>
            ))}
          </ul>
          <p className="record-card-note">No automatic correction was made.</p>
        </section>
      )}

      <section className="record-card-section">
        <h3 className="record-card-h3">What this document affects</h3>
        <p className="record-card-body">{documentImpact(summary)}</p>
      </section>

      <footer className="record-card-actions">
        <button type="button" className="btn is-primary" onClick={explain}>
          <Icon.Ask size={13} />
          Explain this record
        </button>
        <button type="button" className="btn is-ghost" onClick={() => setView('records')}>
          <Icon.Records size={13} />
          View original
        </button>
      </footer>
    </div>
  );
}
