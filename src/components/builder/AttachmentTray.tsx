import type { DocKind } from '../../engine/types';
import type { AcceptedAttachment, RejectedAttachment } from '../../builder/attachments';

/* ------------------------------------------------------------------ */
/* The attachment tray                                                 */
/*                                                                    */
/* Attachments are shown with the kind they were read as and the reason */
/* for that choice, because the extractors are section-aware and a wrong */
/* kind genuinely degrades extraction. Correcting it is one click.       */
/* ------------------------------------------------------------------ */

const KIND_OPTIONS: Array<{ value: DocKind; label: string }> = [
  { value: 'visit_note', label: 'Visit note' },
  { value: 'lab_report', label: 'Lab report' },
  { value: 'medication_list', label: 'Medication list' },
  { value: 'discharge_summary', label: 'Discharge summary' },
  { value: 'imaging_report', label: 'Imaging report' },
  { value: 'pathology_report', label: 'Pathology report' },
  { value: 'vaccination_record', label: 'Vaccination record' },
  { value: 'allergy_record', label: 'Allergy record' },
  { value: 'wearable_summary', label: 'Wearable summary' },
  { value: 'procedure_note', label: 'Procedure note' },
  { value: 'questionnaire', label: 'Questionnaire' },
];

interface AttachmentTrayProps {
  attachments: AcceptedAttachment[];
  rejections: RejectedAttachment[];
  onRemove: (filename: string) => void;
  onRetype: (filename: string, kind: DocKind) => void;
  onDismissRejection: (filename: string) => void;
  onClear: () => void;
}

export function AttachmentTray({
  attachments,
  rejections,
  onRemove,
  onRetype,
  onDismissRejection,
  onClear,
}: AttachmentTrayProps) {
  if (attachments.length === 0 && rejections.length === 0) return null;

  return (
    <div className="attach-tray">
      {attachments.length > 0 && (
        <div className="attach-group">
          <div className="attach-head">
            <span className="attach-head-label">
              {attachments.length} attached document{attachments.length === 1 ? '' : 's'}
            </span>
            <span className="attach-head-note">
              read with the same extractors as the built-in record
            </span>
            <button type="button" className="attach-clear" onClick={onClear}>
              Remove all
            </button>
          </div>

          <div className="attach-list">
            {attachments.map((attachment) => (
              <div className="attach-item" key={attachment.filename}>
                <div className="attach-item-main">
                  <span className="attach-item-name">{attachment.input.title}</span>
                  <span className="attach-item-meta mono">
                    {attachment.characters.toLocaleString()} chars · {Math.max(1, Math.round(attachment.bytes / 1000))} kB
                  </span>
                </div>

                <label className="attach-item-kind">
                  <span className="attach-item-kind-label">read as</span>
                  <select
                    value={attachment.input.kind}
                    onChange={(event) =>
                      onRetype(attachment.filename, event.target.value as DocKind)
                    }
                    aria-label={`Document kind for ${attachment.filename}`}
                  >
                    {KIND_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <span
                  className={`attach-item-because${attachment.kindSource === 'fallback' ? ' is-guess' : ''}`}
                  title={attachment.because}
                >
                  {attachment.kindSource === 'fallback' ? 'guessed' : attachment.kindSource}
                </span>

                <button
                  type="button"
                  className="attach-item-remove"
                  onClick={() => onRemove(attachment.filename)}
                  aria-label={`Remove ${attachment.filename}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {rejections.length > 0 && (
        <div className="attach-group is-rejected">
          <div className="attach-head">
            <span className="attach-head-label">
              {rejections.length} file{rejections.length === 1 ? '' : 's'} not read
            </span>
          </div>
          <div className="attach-list">
            {rejections.map((rejection) => (
              <div className="attach-item" key={rejection.filename}>
                <div className="attach-item-main">
                  <span className="attach-item-name">{rejection.filename}</span>
                  <span className="attach-item-reason">{rejection.reason}</span>
                </div>
                <button
                  type="button"
                  className="attach-item-remove"
                  onClick={() => onDismissRejection(rejection.filename)}
                  aria-label={`Dismiss ${rejection.filename}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
