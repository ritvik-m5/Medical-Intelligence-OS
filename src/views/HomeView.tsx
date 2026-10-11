import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import { StartHereDrop } from './StartHereDrop';
import { formatDate } from '../engine/text/normalize';

/* ------------------------------------------------------------------ */
/* Home                                                                */
/*                                                                    */
/* The calm, patient-facing surface. Everything here is a doorway into */
/* the same engine the rest of the workspace uses — nothing is a        */
/* separate number. The four areas are the four things a person wants:  */
/* ask, see what changed, see what is open, and read the record.        */
/* ------------------------------------------------------------------ */

export function HomeView() {
  const { graph, snapshot, changes, questions, engine, asOf, setView, openEvidence, hasRecord } =
    useStore();

  // Before any record exists, the landing is the drop zone. Everything else —
  // the four doorways, the changes and the open questions — unlocks once the
  // reader drops their documents in and the pipeline runs.
  if (!hasRecord) {
    return (
      <div className="home">
        <header className="home-head">
          <div>
            <h1 className="home-hello">Start here</h1>
            <p className="home-sub">Drop your health records in to reconstruct them.</p>
          </div>
        </header>
        <StartHereDrop />
      </div>
    );
  }

  const patientName = graph.patient.name?.split(' ')[0] || 'there';
  const realChanges = changes.filter((c) => c.kind !== 'new_document').slice(0, 4);
  const openQuestions = questions.filter((q) => q.status !== 'dismissed').slice(0, 4);

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <h1 className="home-hello">Hi, {patientName}</h1>
          <p className="home-sub">Here is your health record, as it is documented.</p>
        </div>
        <span className={`home-status${engine.verification.clean ? ' is-verified' : ''}`}>
          <Icon.Check size={12} />
          {engine.verification.clean ? 'Verified' : 'Needs attention'}
        </span>
      </header>

      <div className="home-areas">
        <button type="button" className="home-area is-ask" onClick={() => setView('chat')}>
          <span className="home-area-icon">
            <Icon.Ask size={18} />
          </span>
          <span className="home-area-name">Ask Medical Memory</span>
          <span className="home-area-note">Ask anything about your record</span>
        </button>

        <button type="button" className="home-area" onClick={() => setView('timemachine')}>
          <span className="home-area-icon">
            <Icon.TimeMachine size={18} />
          </span>
          <span className="home-area-name">Recent changes</span>
          <span className="home-area-note">{realChanges.length} documented changes</span>
        </button>

        <button type="button" className="home-area" onClick={() => setView('overview')}>
          <span className="home-area-icon">
            <Icon.Overview size={18} />
          </span>
          <span className="home-area-name">Open questions</span>
          <span className="home-area-note">{openQuestions.length} the record cannot answer</span>
        </button>

        <button type="button" className="home-area" onClick={() => setView('records')}>
          <span className="home-area-icon">
            <Icon.Records size={18} />
          </span>
          <span className="home-area-name">Your record</span>
          <span className="home-area-note">
            {snapshot.totals.documents} documents · {graph.stats.facts} facts
          </span>
        </button>
      </div>

      <div className="home-columns">
        <section className="home-section">
          <h2 className="home-h2">Recent changes</h2>
          {realChanges.length === 0 ? (
            <p className="home-empty">No documented changes in the current window.</p>
          ) : (
            <ul className="home-list">
              {realChanges.map((change) => (
                <li key={change.id}>
                  <button
                    type="button"
                    className="home-item"
                    onClick={() =>
                      openEvidence({
                        title: `${change.entityLabel} — ${change.kind.replace(/_/g, ' ')}`,
                        subtitle: change.deltaText,
                        factIds: [change.fromFactId, change.toFactId].filter(Boolean) as string[],
                      })
                    }
                  >
                    <span className="home-item-label">{change.entityLabel}</span>
                    <span className="home-item-meta">{change.deltaText}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="home-section">
          <h2 className="home-h2">Open questions</h2>
          {openQuestions.length === 0 ? (
            <p className="home-empty">Nothing in this record currently raises an open question.</p>
          ) : (
            <ul className="home-list">
              {openQuestions.map((question) => (
                <li key={question.id}>
                  <button
                    type="button"
                    className="home-item"
                    onClick={() => setView(question.destination)}
                  >
                    <span className="home-item-label">{question.question}</span>
                    <span className="home-item-meta">{question.evidence}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="home-foot">
        <span className="home-foot-note">Record as of {formatDate(asOf)}.</span>
        <button type="button" className="btn is-ghost is-sm" onClick={() => setView('whatis')}>
          What is this?
        </button>
      </footer>
    </div>
  );
}
