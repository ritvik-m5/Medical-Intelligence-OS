import { useStore, EXPLAIN_DEPTH_LABEL, type ExplainDepth } from '../state/store';
import { Icon } from '../components/Icon';

/* ------------------------------------------------------------------ */
/* What is this                                                        */
/*                                                                    */
/* Why this software exists, and why it matters. The same explanation  */
/* is offered at three depths: simple · plain · technical. The engine   */
/* does not change between modes — only the words do.                   */
/* ------------------------------------------------------------------ */

type DepthText = Record<ExplainDepth, string>;

interface Section {
  id: string;
  icon: (props: { size?: number }) => JSX.Element;
  title: DepthText;
  body: DepthText;
}

const SECTIONS: Section[] = [
  {
    id: 'why',
    icon: Icon.Memory,
    title: {
      simple: 'Why did someone make this?',
      plain: 'Why this exists',
      technical: 'Why this was built',
    },
    body: {
      simple:
        'Your health records live in lots of different places — this doctor, that visit, last year, the year before. This app collects them into one place and shows you what they actually say.',
      plain:
        'A medical record is fragmented: spread across visits, providers and years, written for other clinicians, and hard for a patient to read. Medical Memory reconstructs it into one coherent, provable picture you can ask questions of.',
      technical:
        'Health data is scattered across heterogeneous documents with no shared timeline or provenance. Medical Memory ingests those documents into facts, reconstructs intervals and entity states, and reasons over them with deterministic rules — producing derivations, each backed by a proof graph that names its premises and spans.',
    },
  },
  {
    id: 'problem',
    icon: Icon.Warning,
    title: {
      simple: 'What problem does it fix?',
      plain: 'The problem it addresses',
      technical: 'The failure mode it targets',
    },
    body: {
      simple:
        'When you get a big pile of health papers, it is hard to know what is important, what changed, and whether two papers say different things.',
      plain:
        'A patient can hold years of records and still not know what changed, what contradicts what, or what was never followed up. The record is present but not legible.',
      technical:
        'Documents assert facts without a shared temporal model, so contradictions, gaps and undocumented changes are invisible without an engine that resolves entity identity, reconstructs intervals, and evaluates rules against a point in time.',
    },
  },
  {
    id: 'how',
    icon: Icon.Play,
    title: {
      simple: 'How does it work?',
      plain: 'How it works',
      technical: 'The architecture in one paragraph',
    },
    body: {
      simple:
        'It reads your records like a very careful librarian. Every time it tells you something, it also points at the exact words it read, so you can check it yourself.',
      plain:
        'Every statement the engine makes is backed by the source text. A finding is not a sentence someone wrote — it is a proof: documented premises, reconstructed intervals, the rule that fired, and one conclusion you can trace back.',
      technical:
        'Documents → facts (with character spans) → graph → reconstructed intervals → deterministic rules → derivations (proof graphs). The artifact is the reproducible state of that whole computation; the engine answers first, and any model prose is subordinate to it.',
    },
  },
  {
    id: 'importance',
    icon: Icon.Check,
    title: {
      simple: 'Why does it matter?',
      plain: 'Why it matters',
      technical: 'Why this matters',
    },
    body: {
      simple:
        'Because understanding your own health should not need a medical degree. This lets you see, in plain words, what your records say — and check that it is true.',
      plain:
        'Health decisions should rest on what a record actually establishes, not on a summary you have to take on faith. Making every conclusion traceable to its source turns a stack of paper into something you can verify and share.',
      technical:
        'Clinical reasoning becomes auditable and reproducible. No conclusion is asserted without a chain from source spans, through rules, to the finding — the difference between software you trust and software you merely use.',
    },
  },
  {
    id: 'never',
    icon: Icon.Close,
    title: {
      simple: 'What it will never do',
      plain: 'What it will never do',
      technical: 'What it will never do',
    },
    body: {
      simple:
        'It will never pretend to be a doctor. It does not diagnose you, and it does not tell you what medicine to take. It just helps you understand the words.',
      plain:
        'It does not diagnose, prescribe, or tell you to change treatment. It is a guide to what your records say — not a clinician. Anything urgent is answered with a safety message, not a guess.',
      technical:
        'It never treats model output as evidence, never invents a medical conclusion, and never converts a concern into a diagnosis. The engine derives; the model only explains — and is always labelled as such.',
    },
  },
];

const DEPTHS: ExplainDepth[] = ['simple', 'plain', 'technical'];


export function WhatIsThisView() {
  const { explainDepth, setExplainDepth, setView } = useStore();

  return (
    <div className="whatis">
      <header className="whatis-head">
        <div className="whatis-mark">
          <Icon.Memory size={22} />
        </div>
        <div>
          <h1 className="whatis-title">What is Medical Memory?</h1>
          <p className="whatis-sub">
            The same explanation, at whatever depth you want. Pick how you would like it told.
          </p>
        </div>
      </header>

      <div className="depth-switch" role="group" aria-label="Explanation depth">
        {DEPTHS.map((depth) => (
          <button
            key={depth}
            type="button"
            className={`depth-option${explainDepth === depth ? ' is-active' : ''}`}
            onClick={() => setExplainDepth(depth)}
            aria-pressed={explainDepth === depth}
          >
            {EXPLAIN_DEPTH_LABEL[depth]}
          </button>
        ))}
      </div>

      <div className="whatis-sections">
        {SECTIONS.map((section) => (
          <section key={section.id} className="whatis-section">
            <div className="whatis-section-head">
              <span className="whatis-section-icon">
                <section.icon size={16} />
              </span>
              <h2 className="whatis-section-title">{section.title[explainDepth]}</h2>
            </div>
            <p className="whatis-section-body">{section.body[explainDepth]}</p>
          </section>
        ))}
      </div>

      <footer className="whatis-foot">
        <button type="button" className="btn is-primary" onClick={() => setView('home')}>
          <Icon.Overview size={14} />
          Go to your record
        </button>
        <button type="button" className="btn is-ghost" onClick={() => setView('guide')}>
          Take the full tour
        </button>
      </footer>
    </div>
  );
}
