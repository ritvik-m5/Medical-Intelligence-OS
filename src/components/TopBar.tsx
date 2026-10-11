import { useState } from 'react';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { EngineStatusPill } from './EngineStatusPill';
import { ArtifactInspector } from './ArtifactInspector';
import { formatDate } from '../engine/text/normalize';
import { plural } from '../lib/format';

const TITLES: Record<string, { title: string; sub: string }> = {
  home: {
    title: 'Home',
    sub: 'Your record, in plain view',
  },
  whatis: {
    title: 'What is this',
    sub: 'Why this exists, and why it matters',
  },
  reset: {
    title: 'Reset',
    sub: 'A calm place to undo things',
  },
  overview: {
    title: 'Overview',
    sub: 'Current state of the record, and everything the engine refuses to assume',
  },
  timemachine: {
    title: 'Medical Time Machine',
    sub: 'What was documented, when — and what changed between two points',
  },
  temporal: {
    title: 'Documented Intervals',
    sub: 'Courses and spans on one axis, because a medication is a period, not an event',
  },
  graph: {
    title: 'Temporal Health Graph',
    sub: 'Concepts, documents and the inferred relations between them',
  },
  records: {
    title: 'Records',
    sub: 'Import documents and inspect exactly what was extracted, and from where',
  },
  measurements: {
    title: 'Measurements',
    sub: 'Every reading, its source document, and its own reference range',
  },
  debugger: {
    title: 'Medical Debugger',
    sub: 'Contradictions and documented change across the record',
  },
  inference: {
    title: 'Inference Board',
    sub: 'Every derived claim with the proof graph that produced it',
  },
  ask: {
    title: 'Ask',
    sub: 'Query the structured health history, with the plan and the sources shown',
  },
  research: {
    title: 'Research Mode',
    sub: 'Personal graph kept strictly separate from external evidence',
  },
  quality: {
    title: 'Record Quality',
    sub: 'A scorecard about the documents, and an audit log of this session',
  },
  cohort: {
    title: 'Cohort',
    sub: 'The same rules, evaluated across several subjects at once',
  },
  interop: {
    title: 'Interoperability & Sharing',
    sub: 'FHIR export with provenance, structural de-identification, bundle import',
  },
};

export function TopBar() {
  const { view, setView, asOf, graph, snapshot, contradictions, qualityFlags, engine, derivations, openProof, mobileNavOpen, setMobileNavOpen, setFocusDoc } =
    useStore();
  const [inspecting, setInspecting] = useState(false);
  const meta = TITLES[view] ?? TITLES.overview;

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="nav-toggle"
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
        >
          <Icon.Menu size={18} />
        </button>

        <div className="topbar-title">
          <h1>{meta.title}</h1>
          <div className="topbar-sub">{meta.sub}</div>
        </div>

        <div className="topbar-actions">
          <EngineStatusPill status={engine} onOpen={() => setInspecting(true)} compact />
          <span className="chip is-muted" title="The Time Machine date governs every view">
            <span className="dot info" />
            as of {formatDate(asOf)}
          </span>
          <span className="chip is-muted" title="Documents visible at this date">
            {snapshot.totals.documents}/{graph.documents.length} docs
          </span>
          {contradictions.length > 0 && (
            <button
              type="button"
              className="chip is-critical is-button"
              onClick={() => setView('debugger')}
              title="Open the Medical Debugger"
            >
              <Icon.Warning size={12} />
              {plural(contradictions.length, 'contradiction')}
            </button>
          )}
          {qualityFlags.length > 0 && (
            <button
              type="button"
              className="chip is-warn is-button"
              onClick={() => setView('debugger')}
              title="Open the Medical Debugger — data-quality warnings"
            >
              <Icon.Circle size={10} />
              {plural(qualityFlags.length, 'data-quality warning')}
            </button>
          )}
          <button type="button" className="btn is-primary" onClick={() => setView('ask')}>
            <Icon.Ask size={14} />
            Ask the record
          </button>
        </div>
      </header>

      {inspecting && (
        <ArtifactInspector
          status={engine}
          graph={graph}
          derivations={derivations}
          onOpenProof={(derivationId) => {
            setInspecting(false);
            // The proof is rendered by the Inference view, so opening one from
            // here has to take the reader to where it is shown.
            setView('inference');
            openProof(derivationId);
          }}
          onOpenDocument={(docId) => {
            setInspecting(false);
            setView('records');
            setFocusDoc(docId);
          }}
          onClose={() => setInspecting(false)}
        />
      )}
    </>
  );
}
