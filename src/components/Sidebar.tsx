import { useStore, type ViewId } from '../state/store';
import { Icon } from './Icon';
import { formatDate } from '../engine/text/normalize';

interface NavEntry {
  id: ViewId;
  label: string;
  icon: (props: { size?: number }) => JSX.Element;
  group: 'start' | 'reconstruct' | 'inspect' | 'reason' | 'platform';
}

const NAV: NavEntry[] = [
  { id: 'home', label: 'Home', icon: Icon.Overview, group: 'start' },
  { id: 'guide', label: 'How it works', icon: Icon.Ask, group: 'start' },
  { id: 'whatis', label: 'What is this', icon: Icon.Memory, group: 'start' },
  { id: 'builder', label: 'Builder', icon: Icon.Build, group: 'start' },
  { id: 'chat', label: 'Chat', icon: Icon.Ask, group: 'start' },
  { id: 'overview', label: 'Overview', icon: Icon.Overview, group: 'reconstruct' },
  { id: 'timemachine', label: 'Time Machine', icon: Icon.TimeMachine, group: 'reconstruct' },
  { id: 'temporal', label: 'Intervals', icon: Icon.Measurements, group: 'reconstruct' },
  { id: 'graph', label: 'Health Graph', icon: Icon.Graph, group: 'reconstruct' },
  { id: 'records', label: 'Records', icon: Icon.Records, group: 'inspect' },
  { id: 'measurements', label: 'Measurements', icon: Icon.Measurements, group: 'inspect' },
  { id: 'debugger', label: 'Debugger', icon: Icon.Debugger, group: 'inspect' },
  { id: 'inference', label: 'Inference', icon: Icon.Inference, group: 'reason' },
  { id: 'ask', label: 'Ask', icon: Icon.Ask, group: 'reason' },
  { id: 'research', label: 'Research Mode', icon: Icon.Research, group: 'reason' },
  { id: 'lab', label: 'Research Lab', icon: Icon.Inference, group: 'reason' },
  { id: 'quality', label: 'Record Quality', icon: Icon.Quality, group: 'platform' },
  { id: 'cohort', label: 'Cohort', icon: Icon.Cohort, group: 'platform' },
  { id: 'interop', label: 'Interop & Sharing', icon: Icon.Interop, group: 'platform' },
  { id: 'reset', label: 'Reset', icon: Icon.Reset, group: 'start' },
];

const GROUP_LABEL: Record<NavEntry['group'], string> = {
  start: 'Start here',
  reconstruct: 'Reconstruct',
  inspect: 'Inspect',
  reason: 'Reason',
  platform: 'Platform',
};

export function Sidebar() {
  const { view, setView, graph, derivations, changes, quality, userDocumentCount, mobileNavOpen, questions, hasRecord } =
    useStore();
  const highSeverity = derivations.filter((d) => d.severity === 'high').length;
  const openQuestionCount = questions.filter((q) => q.status !== 'dismissed').length;
  const docCount = graph.documents.length;

  const badgeFor = (id: ViewId): { text: string; soft?: boolean } | null => {
    if (id === 'inference') {
      return derivations.length > 0
        ? { text: String(derivations.length) }
        : { text: '0', soft: true };
    }
    if (id === 'debugger') {
      return highSeverity > 0 ? { text: String(highSeverity) } : { text: '0', soft: true };
    }
    if (id === 'records') return { text: String(docCount), soft: true };
    if (id === 'quality') return { text: String(quality.overall), soft: quality.overall >= 70 };
    if (id === 'timemachine') {
      return changes.length > 0 ? { text: String(changes.length), soft: true } : null;
    }
    return null;
  };

  return (
    <aside className={`sidebar${mobileNavOpen ? ' is-open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">
          <Icon.Memory size={19} />
        </div>
        <div>
          <div className="brand-name">Medical Memory</div>
          <div className="brand-tag">Your health, reconstructed</div>
        </div>
      </div>

      {(['start', 'reconstruct', 'inspect', 'reason', 'platform'] as const).map((group) => (
        <div className="nav-group" key={group}>
          <div className="nav-label">{GROUP_LABEL[group]}</div>
          {NAV.filter((entry) => entry.group === group).map((entry) => {
            const badge = badgeFor(entry.id);
            const Glyph = entry.icon;
            // Before any document is imported, the record-dependent tabs are
            // held back: the reader drops files in, the pipeline runs, and only
            // then do they unlock.
            const locked =
              !hasRecord && entry.id !== 'home' && entry.id !== 'guide' && entry.id !== 'whatis' && entry.id !== 'builder' && entry.id !== 'reset';
            return (
              <button
                key={entry.id}
                type="button"
                className={`nav-item${view === entry.id ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
                onClick={() => setView(entry.id)}
                disabled={locked}
                title={locked ? 'Import documents to unlock' : undefined}
                aria-disabled={locked}
              >
                <Glyph size={16} />
                <span>{entry.label}</span>
                {badge && !locked && (
                  <span className={`nav-badge${badge.soft ? ' is-soft' : ''}`}>{badge.text}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}


      <div style={{ marginTop: 'auto' }}>
        <div className="side-card">
          <div className="patient-name">{graph.patient.name || 'Your record'}</div>
          <div className="patient-meta">
            {graph.patient.dateOfBirth ? `Born ${formatDate(graph.patient.dateOfBirth)}` : 'DOB not recorded'}
            {hasRecord ? ' · your record' : ' · no documents yet'}
          </div>
          <hr className="hairline" style={{ margin: '10px 0' }} />
          <div className="stat-row">
            <span>Documents</span>
            <span>{docCount}</span>
          </div>
          <div className="stat-row">
            <span>Provenanced facts</span>
            <span>{graph.stats.facts}</span>
          </div>
          <div className="stat-row">
            <span>Resolved concepts</span>
            <span>{graph.stats.entities}</span>
          </div>
          <div className="stat-row">
            <span>Graph edges</span>
            <span>{graph.stats.edges}</span>
          </div>
          <div className="stat-row">
            <span>Mean confidence</span>
            <span>{graph.stats.meanConfidence.toFixed(2)}</span>
          </div>
          {userDocumentCount > 0 && (
            <div className="stat-row">
              <span>Your uploads</span>
              <span>{userDocumentCount}</span>
            </div>
          )}
        </div>

        <div className="side-card">
          <div className="metric-label">Open questions</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span
              className="metric-value"
              style={{
                fontSize: 24,
                color: openQuestionCount > 0 ? 'var(--medium)' : 'var(--ok)',
              }}
            >
              {openQuestionCount}
            </span>
            <span className="metric-sub">
              {openQuestionCount === 0 ? 'the record answers itself' : 'the record cannot answer'}
            </span>
          </div>
        </div>
      </div>

      <div className="sidebar-foot">
        Your health record, reconstructed. Not a medical device and not for clinical use.
      </div>
    </aside>
  );
}
