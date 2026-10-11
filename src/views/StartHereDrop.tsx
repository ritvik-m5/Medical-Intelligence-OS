import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import { plural } from '../lib/format';
import { readAttachments } from '../builder/attachments';

/**
 * The "Start here" drop zone, embedded in the Home view while there is no record.
 *
 * There is no built-in or synthetic record: the reader drops their own documents
 * in, the pipeline runs (extract → graph → infer), and only then do the workspace
 * tabs unlock. This is the same intake surface the Records view offers, surfaced
 * on the landing so the empty state is not a dead end.
 */
export function StartHereDrop() {
  const { ingest } = useStore();
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { accepted, rejected } = await readAttachments(files);

    for (const attachment of accepted) {
      ingest({ ...attachment.input, origin: 'upload' });
    }

    const parts: string[] = [];
    if (accepted.length > 0) {
      parts.push(
        `Imported ${plural(accepted.length, 'document')}: ${accepted.map((a) => a.filename).join(', ')}.`,
      );
    }
    if (rejected.length > 0) {
      parts.push(rejected.map((r) => `${r.filename}: ${r.reason}`).join(' '));
    }
    setMessage(parts.join(' ') || 'Nothing was imported.');
  };

  return (
    <div className="starthere-body">
      <div
        className={`starthere-drop${dragging ? ' is-over' : ''}`}
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
        <div className="starthere-drop-icon">
          <Icon.Records size={28} />
        </div>
        <div className="starthere-drop-title">Drop your records here</div>
        <div className="starthere-drop-sub">
          Text documents only — .txt, .md, .csv. Drop several at once, or click to browse. Each one is
          extracted the moment it lands.
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.tsv,.text,.log"
          style={{ display: 'none' }}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      {message && <p className="starthere-message">{message}</p>}

      <div className="starthere-steps">
        <div className="starthere-step">
          <span className="starthere-step-n">1</span>
          <span className="starthere-step-label">Extract</span>
          <span className="starthere-step-sub">every fact, traced to its exact source span</span>
        </div>
        <div className="starthere-step">
          <span className="starthere-step-n">2</span>
          <span className="starthere-step-label">Reconstruct</span>
          <span className="starthere-step-sub">documents, concepts and edges into one graph</span>
        </div>
        <div className="starthere-step">
          <span className="starthere-step-n">3</span>
          <span className="starthere-step-label">Reason</span>
          <span className="starthere-step-sub">the inference engine runs its rules over the record</span>
        </div>
        <div className="starthere-step">
          <span className="starthere-step-n">4</span>
          <span className="starthere-step-label">Unlock</span>
          <span className="starthere-step-sub">the workspace tabs open once a record exists</span>
        </div>
      </div>
    </div>
  );
}
