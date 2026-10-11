import { useStore } from '../state/store';
import { Panel } from './Panel';
import { Icon } from './Icon';
import { plural } from '../lib/format';

/**
 * Local persistence.
 *
 * Imported documents used to disappear on reload, which made the intake surface
 * a demonstration rather than a tool. What is stored is the corpus, never the
 * graph: the graph is re-derived on load, so it can never drift from the
 * documents it came from.
 *
 * A version mismatch or a corrupt payload is reported rather than swallowed.
 */
export function SessionPanel() {
  const { storage, userDocumentCount } = useStore();

  const restored = storage.restoreStatus === 'loaded';
  const problem =
    storage.restoreStatus === 'version-mismatch' || storage.restoreStatus === 'corrupt';

  return (
    <Panel
      title="Session"
      sub="Imported documents are kept in this browser between visits"
      actions={
        <span className={`chip is-button ${storage.available ? 'is-ok' : 'is-critical'}`}>
          <span className={`dot ${storage.available ? 'ok' : 'high'}`} />
          {storage.available ? 'storage available' : 'storage unavailable'}
        </span>
      }
    >
      {problem && (
        <div className="notice is-warn">
          <Icon.Warning size={15} />
          <div>
            <strong>A saved record was found but not loaded.</strong> {storage.message}
          </div>
        </div>
      )}

      <div className="session-grid">
        <div className="session-stat">
          <span className="session-stat-label">Imported by you</span>
          <span className="session-stat-value mono">{userDocumentCount}</span>
          <span className="session-stat-note">
            {plural(userDocumentCount, 'document')} in this session
          </span>
        </div>

        <div className="session-stat">
          <span className="session-stat-label">Last saved</span>
          <span className="session-stat-value mono">
            {storage.savedAt ? storage.savedAt.slice(0, 19).replace('T', ' ') : '—'}
          </span>
          <span className="session-stat-note">
            {restored ? 'restored when this page opened' : 'written whenever the corpus changes'}
          </span>
        </div>

        <div className="session-stat">
          <span className="session-stat-label">What is stored</span>
          <span className="session-stat-value">the corpus</span>
          <span className="session-stat-note">
            never the graph — it is re-derived on load, so it cannot drift from its documents
          </span>
        </div>
      </div>

      <div className="session-foot">
        <span className="dim">{storage.message}</span>
        {storage.savedAt && (
          <button type="button" className="btn is-ghost" onClick={storage.forget}>
            Forget the saved record
          </button>
        )}
      </div>

      <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>
        This is a browser-local convenience, not a backup. It is deliberately not a security
        control: anything in this browser can read it, and the audit log says so.
      </div>
    </Panel>
  );
}
