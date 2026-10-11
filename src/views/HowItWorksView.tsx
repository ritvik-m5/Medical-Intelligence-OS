import { useStore, type ViewId } from '../state/store';
import { Icon } from '../components/Icon';

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/*                                                                    */
/* Written for someone who has never seen this project and does not     */
/* work in medicine. One idea carries the whole page: every conclusion  */
/* comes with a receipt. Everything else is a tab, and every tab is     */
/* explained in the same three lines — what it is, when you would use   */
/* it, and what it looks like.                                          */
/*                                                                    */
/* The tab list is data, so a tab added to the sidebar and forgotten    */
/* here would be a visible gap rather than a silent omission.           */
/* ------------------------------------------------------------------ */

interface GuideEntry {
  view: ViewId;
  name: string;
  icon: (props: { size?: number }) => JSX.Element;
  what: string;
  when: string;
  looks: string;
}

interface GuideGroup {
  title: string;
  intro: string;
  entries: GuideEntry[];
}

const GROUPS: GuideGroup[] = [
  {
    title: 'Start here',
    intro: 'The one page you need to understand the rest.',
    entries: [
      {
        view: 'home',
        name: 'Home',
        icon: Icon.Overview,
        what: 'The calm front page: ask, see what changed, see what is open, and read the record.',
        when: 'Every time you open the workspace. This is the landing page.',
        looks: 'A greeting, four big areas, and the recent changes and open questions.',
      },
      {
        view: 'whatis',
        name: 'What is this',
        icon: Icon.Memory,
        what: 'Why this software exists and why it matters, explained at three depths you choose.',
        when: 'When you want the short version of the whole project, or the technical one.',
        looks: 'A switch for "Explain like I\u2019m 10", plain English, or technical detail.',
      },
      {
        view: 'reset',
        name: 'Reset',
        icon: Icon.Reset,
        what: 'One place to undo things: reset the record, delete the saved copy, or clear history.',
        when: 'When you want a fresh start, and nothing happens until you confirm it.',
        looks: 'A list of actions, each saying what it removes and what it leaves.',
      },
      {
        view: 'builder',
        name: 'Builder',
        icon: Icon.Build,
        what: 'You type what you want in normal English. It reads the records and builds the result.',
        when: 'Every time. This is the front door.',
        looks: 'A text box, a Build button, and a result that appears below it.',
      },
      {
        view: 'chat',
        name: 'Chat',
        icon: Icon.Ask,
        what: 'Ask questions about the record and get answers with the words they came from.',
        when: 'When you want to understand something and do not know which tab to open.',
        looks: 'A conversation. Every answer shows its sources and says what it cannot tell you.',
      },
    ],
  },
  {
    title: 'Look at the record',
    intro: 'The raw material, and the tools for reading it.',
    entries: [
      {
        view: 'overview',
        name: 'Overview',
        icon: Icon.Overview,
        what: 'The big picture: who this is, how many documents there are, and what was found.',
        when: 'First, when you want to know what you are looking at.',
        looks: 'A few big numbers and a short summary.',
      },
      {
        view: 'timemachine',
        name: 'Time Machine',
        icon: Icon.TimeMachine,
        what: 'Slide through time and watch what changed. Pick two dates and see the difference.',
        when: 'When you want to know "when did this start?" or "what is new since last year?"',
        looks: 'A slider, and two lists side by side.',
      },
      {
        view: 'temporal',
        name: 'Intervals',
        icon: Icon.Measurements,
        what: 'How long things lasted. A medicine taken March to September is a bar, not a dot.',
        when: 'When you care about duration, or want to spot two medicines taken at once.',
        looks: 'Horizontal bars on a timeline.',
      },
      {
        view: 'graph',
        name: 'Health Graph',
        icon: Icon.Graph,
        what: 'A map of how things connect — which medicine is for which condition, which test checks which problem.',
        when: 'When you want to see the shape of the whole record at once.',
        looks: 'A network of dots and lines you can click.',
      },
      {
        view: 'records',
        name: 'Records',
        icon: Icon.Records,
        what: 'The actual documents. Click any sentence and it lights up to show what was read from it.',
        when: 'When you want to check the original wording yourself.',
        looks: 'Documents with highlighted lines.',
      },
      {
        view: 'measurements',
        name: 'Measurements',
        icon: Icon.Measurements,
        what: 'Every number in the record, each on its own chart with its normal range marked.',
        when: 'When you want to see a trend rather than a single reading.',
        looks: 'Small line charts, one per measurement.',
      },
      {
        view: 'debugger',
        name: 'Debugger',
        icon: Icon.Debugger,
        what: 'Where two documents disagree. It shows both and never picks a winner.',
        when: 'When something looks wrong, or two papers say different things.',
        looks: 'A list of disagreements, each with both sides quoted.',
      },
    ],
  },
];

GROUPS.push(
  {
    title: 'Understand the thinking',
    intro: 'Where the conclusions live, and how to question them.',
    entries: [
      {
        view: 'inference',
        name: 'Inference',
        icon: Icon.Inference,
        what: 'Every conclusion, with the whole chain of reasoning shown step by step.',
        when: 'When you want to know why the system believes something.',
        looks: 'A list of findings. Click one and its chain of steps opens.',
      },
      {
        view: 'ask',
        name: 'Ask',
        icon: Icon.Ask,
        what: 'Ask a question in plain English and get an answer with the sources listed.',
        when: 'When you have a specific question and do not want to hunt through tabs.',
        looks: 'A question box and answers underneath.',
      },
      {
        view: 'research',
        name: 'Research Mode',
        icon: Icon.Research,
        what: 'Outside knowledge, like published studies, kept strictly separate from your own record.',
        when: 'When you want context, without it being mixed into your data.',
        looks: 'External sources, clearly marked as not yours.',
      },
      {
        view: 'lab',
        name: 'Research Lab',
        icon: Icon.Inference,
        what: 'Test "what if". What if this document was missing? What if this rule were turned off?',
        when: 'When you want to know how much a piece of evidence matters.',
        looks: 'A tree of experiments, each showing exactly what changed.',
      },
    ],
  },
  {
    title: 'The platform',
    intro: 'What you can do with a finished result.',
    entries: [
      {
        view: 'quality',
        name: 'Record Quality',
        icon: Icon.Quality,
        what: 'Scores the paperwork itself on nine things, like whether dates are missing.',
        when: 'When the problem might be the records rather than the health.',
        looks: 'Nine scores with an explanation for each.',
      },
      {
        view: 'cohort',
        name: 'Cohort',
        icon: Icon.Cohort,
        what: 'Runs the same checks across many patients and shows which patterns are common.',
        when: 'When you are looking at a group rather than one person.',
        looks: 'A table of rules and how often they fired.',
      },
      {
        view: 'interop',
        name: 'Interop & Sharing',
        icon: Icon.Interop,
        what: 'Exports the record in standard formats, or makes a copy with personal details removed.',
        when: 'When you need to send the record to another system or another doctor.',
        looks: 'Export buttons and a preview of what would be shared.',
      },
    ],
  },
);

const WORDS: Array<[string, string]> = [
  ['Fact', 'One thing written in a document. "HbA1c: 8.9%" is a fact.'],
  ['Finding', 'A conclusion drawn from facts. "Blood sugar has been high for two years."'],
  ['Proof', 'The chain of steps that goes from facts to a finding.'],
  ['Span', 'The exact characters in a document that a fact was read from.'],
  ['Artifact', 'One finished result: the documents that were read, plus everything found.'],
  ['Rule', 'A check the system runs. "Has this monitoring test been done?"'],
  ['Derivation', 'Another word for a finding — the output of one rule.'],
  ['Identity', 'A long code that acts as a fingerprint for an artifact.'],
  ['Counterfactual', 'A "what if". It is never a fact about you.'],
];

const NEVER: Array<[string, string]> = [
  ['It never tells you what to do', 'No treatment advice. Not ever, not even when it looks obvious.'],
  ['It never diagnoses', 'It shows what the record says. Naming a disease is a doctor\u2019s job.'],
  ['It never makes things up', 'If something is not written in a document, it is not a finding.'],
  ['It never changes your record', 'Your documents are read, never edited.'],
  ['It never hides its sources', 'Every answer can be traced back to the words it came from.'],
  ['It says "I cannot answer that"', 'When a question is outside what the record supports, it says so plainly.'],
];


/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function HowItWorksView() {
  const { setView } = useStore();

  return (
    <div className="guide">
      <header className="guide-head">
        <div>
          <div className="guide-eyebrow">How it works</div>
          <h1 className="guide-title">Every conclusion comes with a receipt</h1>
          <p className="guide-lede">
            This reads medical records, finds the important things, and shows you the exact sentence
            in the exact document behind every single conclusion it reaches.
          </p>
        </div>
        <button type="button" className="guide-home" onClick={() => setView('builder')}>
          <Icon.Build size={14} />
          Back to the home page
        </button>
      </header>

      <section className="guide-idea">
        <h2 className="guide-h2">The one idea</h2>
        <p className="guide-body">
          Most software that reads medical records just tells you what it thinks. You have no way to
          check it. This is different. Every finding it produces comes with the words it came from.
          Click it, and you are looking at the actual line in the actual document.
        </p>
        <p className="guide-body">
          That is the whole point. A conclusion you cannot check is not much better than a guess, no
          matter how confident it sounds.
        </p>

        <div className="guide-example">
          <div className="guide-example-head">A real example</div>
          <p className="guide-example-finding">
            <strong>Finding:</strong> Blood sugar has been above target for about two years.
          </p>
          <p className="guide-example-source">
            <strong>Where it came from:</strong> &ldquo;HbA1c 8.9% (target &lt;7.0%)&rdquo; &mdash;
            Lab report, 14 March 2024, line 12
          </p>
          <p className="guide-example-note">
            The finding is a conclusion. The line underneath it is the reason. You can always see
            both.
          </p>
        </div>

        <p className="guide-rule">
          <Icon.Warning size={14} />
          <span>
            <strong>The rule that never changes:</strong> the computer is never allowed to invent. It
            can only point at what is written down.
          </span>
        </p>
      </section>

      <section className="guide-tabs">
        <h2 className="guide-h2">What each tab does</h2>
        <p className="guide-body">
          The workspace has {GROUPS.reduce((total, group) => total + group.entries.length, 0) + 1} tabs
          in total. This page describes the other{' '}
          {GROUPS.reduce((total, group) => total + group.entries.length, 0)}, grouped the same way as
          the sidebar. Every one of them is clickable — press it and you go straight there.
        </p>

        {GROUPS.map((group) => (
          <div key={group.title} className="guide-group">
            <div className="guide-group-head">
              <h3 className="guide-group-title">{group.title}</h3>
              <p className="guide-group-intro">{group.intro}</p>
            </div>

            <ul className="guide-cards">
              {group.entries.map((entry) => (
                <li key={entry.view}>
                  <button
                    type="button"
                    className="guide-card"
                    onClick={() => setView(entry.view)}
                    aria-label={`Open ${entry.name}`}
                  >
                    <span className="guide-card-head">
                      <span className="guide-card-icon">
                        <entry.icon size={16} />
                      </span>
                      <span className="guide-card-name">{entry.name}</span>
                      <span className="guide-card-go">Open &rarr;</span>
                    </span>
                    <span className="guide-card-line">
                      <span className="guide-card-key">What it is</span>
                      {entry.what}
                    </span>
                    <span className="guide-card-line">
                      <span className="guide-card-key">When to use it</span>
                      {entry.when}
                    </span>
                    <span className="guide-card-line">
                      <span className="guide-card-key">What you will see</span>
                      {entry.looks}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="guide-words">
        <h2 className="guide-h2">Words you will see</h2>
        <p className="guide-body">
          Nine words. Once you know these, the rest of the app reads like plain English.
        </p>
        <dl className="guide-glossary">
          {WORDS.map(([word, meaning]) => (
            <div key={word} className="guide-word">
              <dt>{word}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="guide-never">
        <h2 className="guide-h2">What it will never do</h2>
        <p className="guide-body">
          These are not settings. There is no switch to turn them off, and no version of this that
          behaves differently.
        </p>
        <ul className="guide-never-list">
          {NEVER.map(([title, detail]) => (
            <li key={title}>
              <Icon.Close size={13} />
              <span>
                <strong>{title}</strong>
                {detail}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="guide-remember">
        <p>
          <strong>If you remember one thing:</strong> if you cannot click it and see the words it
          came from, it is not a finding.
        </p>
      </section>

    </div>
  );
}

