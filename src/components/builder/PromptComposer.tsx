import { useEffect, useRef, useState } from 'react';
import { PLACEHOLDER_PHRASES } from '../../builder/scenarios';
import { useAnimatedPlaceholder } from '../../builder/scroll';
import { Icon } from '../Icon';

interface PromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** True while a build is running. */
  busy?: boolean;
  /** Large hero treatment, or the compact form used further down the page. */
  size?: 'hero' | 'compact';
  /** Focus this composer on mount. */
  autoFocus?: boolean;
  /** Called with files chosen or dropped onto the composer. */
  onFiles?: (files: File[]) => void;
  attachmentCount?: number;
  hint?: string;
}

/**
 * The composer.
 *
 * This is the centre of gravity of the page, so it is built like a real
 * application input rather than a newsletter field: it accepts newlines, submits
 * on the platform's modifier, shows its own shortcut, and animates its
 * placeholder only while it is idle and unfocused.
 */
export function PromptComposer({
  value,
  onChange,
  onSubmit,
  busy = false,
  size = 'hero',
  autoFocus = false,
  onFiles,
  attachmentCount = 0,
  hint,
}: PromptComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const idle = value.length === 0 && !busy;
  const placeholder = useAnimatedPlaceholder(PLACEHOLDER_PHRASES, idle);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Grow with the content, within reason.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    const max = size === 'hero' ? 220 : 140;
    node.style.height = `${Math.min(node.scrollHeight, max)}px`;
  }, [value, size]);

  const submit = () => {
    if (busy) return;
    if (!value.trim() && attachmentCount === 0) {
      ref.current?.focus();
      return;
    }
    onSubmit();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Enter' && modifier) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={`composer composer--${size}${busy ? ' is-busy' : ''}${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        if (!onFiles) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (!onFiles) return;
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length > 0) onFiles(files);
      }}
    >
      <div className="composer-field">
        <textarea
          ref={ref}
          className="composer-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={size === 'hero' ? 2 : 1}
          aria-label="Describe what you want to build"
          spellCheck={false}
        />
      </div>

      <div className="composer-bar">
        <div className="composer-tools">
          {onFiles && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".txt,.md,.markdown,.csv,.tsv,.log,text/*"
                className="composer-file-input"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length > 0) onFiles(files);
                  // Reset so choosing the same file twice still fires a change.
                  event.target.value = '';
                }}
                aria-label="Attach documents"
              />
              <button
                type="button"
                className="composer-tool"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                title="Attach documents as text files"
              >
                <Icon.Plus size={14} />
                <span>{attachmentCount > 0 ? `${attachmentCount} attached` : 'Attach'}</span>
              </button>
            </>
          )}
          <span className="composer-scope" title="What this build will read">
            <Icon.Link size={12} />
            <span>Reads your own records only</span>
          </span>
        </div>

        <div className="composer-actions">
          <kbd className="composer-kbd">⏎</kbd>
          <button type="button" className="composer-build" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <span className="composer-spinner" aria-hidden="true" />
                <span>Building</span>
              </>
            ) : (
              <>
                <span>Build</span>
                <Icon.Play size={12} />
              </>
            )}
          </button>
        </div>
      </div>

      {hint && <div className="composer-hint">{hint}</div>}
    </div>
  );
}
