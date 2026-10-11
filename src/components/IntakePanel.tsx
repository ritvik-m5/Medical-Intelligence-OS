import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, Notice, Panel } from './Panel';
import { Icon } from './Icon';
import { DOC_KIND_LABEL, type DocKind } from '../engine/types';
import { plural } from '../lib/format';
import { readAttachments } from '../builder/attachments';

const KINDS: DocKind[] = [
  'lab_report',
  'visit_note',
  'medication_list',
  'imaging_report',
  'discharge_summary',
  'vaccination_record',
  'wearable_summary',
  'questionnaire',
  'procedure_note',
  'allergy_record',
  'pathology_report',
];

/**
 * Document intake.
 *
 * Only text is accepted, and that is a deliberate, stated boundary: this build
 * does not pretend to read PDFs or scans. Fabricating an import path that
 * silently mangles a real lab report would be worse than not having one.
 */
export function IntakePanel() {
  const { ingest, resetCorpus, lastIngest, userDocumentCount } = useStore();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DocKind>('lab_report');
  const [date, setDate] = useState('');
  const [facility, setFacility] = useState('');
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const submit = () => {
    if (!text.trim()) {
      setMessage('Paste some document text first.');
      return;
    }
    ingest({
      title: title.trim() || 'Untitled document',
      kind,
      date: date || undefined,
      facility: facility.trim() || undefined,
      text,
      origin: 'paste',
    });
    setMessage('Extracted. The document now appears in the library below.');
    setTitle('');
    setText('');
    setDate('');
    setFacility('');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { accepted, rejected } = await readAttachments(files);

    for (const attachment of accepted) {
      ingest({
        ...attachment.input,
        origin: 'upload',
      });
    }

    const parts: string[] = [];
    if (accepted.length > 0) {
      parts.push(
        `Extracted ${plural(accepted.length, 'document')}: ${accepted.map((item) => item.filename).join(', ')}.`,
      );
    }
    if (rejected.length > 0) {
      parts.push(rejected.map((item) => `${item.filename}: ${item.reason}`).join(' '));
    }
    setMessage(parts.join(' ') || 'Nothing was imported.');
    if (accepted.length === 1) {
      // Auto-fill the form so the inferred metadata is visible and correctable.
      const input = accepted[0].input;
      setTitle(input.title);
      setKind(input.kind);
      setDate(input.date ?? '');
      setFacility(input.facility ?? '');
      setText(input.text);
    }
  };

  return (
    <Panel
      title="Import a document"
      sub="Text only, in this build. Everything extracted is shown back to you with its source span."
      actions={
        userDocumentCount > 0 ? (
          <button type="button" className="btn is-sm" onClick={resetCorpus}>
            <Icon.Reset size={12} />
            Clear imported documents
          </button>
        ) : null
      }
    >
      <div
        className={`dropzone${dragging ? ' is-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
      >
        <div className="dropzone-title">Drop documents here, or click to choose files</div>
        <div className="dropzone-sub">
          Text only: .txt, .md, .csv. Drop several files at once. Each one is extracted as soon as
          it lands. PDF and scans are refused — copy the text out first.
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".txt,.md,.csv,.text"
          style={{ display: 'none' }}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      <div className="intake-form" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Lipid panel"
          />
        </div>
        <div className="field">
          <label>Document type</label>
          <select value={kind} onChange={(event) => setKind(event.target.value as DocKind)}>
            {KINDS.map((option) => (
              <option key={option} value={option}>
                {DOC_KIND_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Document date</label>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="field">
          <label>Facility (optional)</label>
          <input
            value={facility}
            onChange={(event) => setFacility(event.target.value)}
            placeholder="e.g. Northside Laboratories"
          />
        </div>
        <div className="field is-wide">
          <label>Document text</label>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              'Paste the document text exactly as it appears, including headings such as "Current Medications", "Allergies" or "Results". Section headings change how a line is interpreted, so keep them.'
            }
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button type="button" className="btn is-primary" onClick={submit}>
          <Icon.Plus size={14} />
          Extract and add to the graph
        </button>
        {message && (
          <span className="muted" style={{ fontSize: 11.5 }}>
            {message}
          </span>
        )}
      </div>

      {lastIngest && (
        <div style={{ marginTop: 16 }}>
          <Notice>
            <strong>Extraction report — {lastIngest.document.title}.</strong>{' '}
            {lastIngest.document.date} · {plural(lastIngest.facts.length, 'fact')} extracted · text
            quality {lastIngest.document.quality.toFixed(2)}.
            <div className="flag-list" style={{ marginTop: 8 }}>
              {Object.entries(
                lastIngest.facts.reduce<Record<string, number>>((acc, fact) => {
                  acc[fact.type] = (acc[fact.type] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([type, count]) => (
                <Chip key={type} tone="info">
                  {count} × {type}
                </Chip>
              ))}
              {Object.entries(lastIngest.extractorCounts).map(([extractor, count]) => (
                <Chip key={extractor} tone="muted">
                  {extractor}: {count}
                </Chip>
              ))}
            </div>
            {lastIngest.facts.some((fact) => fact.flags.length > 0) && (
              <div style={{ marginTop: 8, color: 'var(--medium)' }}>
                {plural(
                  lastIngest.facts.filter((fact) => fact.flags.length > 0).length,
                  'fact carries a flag',
                  'facts carry flags',
                )}{' '}
                — open them in the inspector to see what the engine questioned.
              </div>
            )}
          </Notice>
        </div>
      )}
    </Panel>
  );
}

