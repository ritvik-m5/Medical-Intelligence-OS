import { useMemo } from 'react';
import { useStore, type ViewId } from '../state/store';
import { ReceiptView, artifactReceipt } from './Receipt';
import { Icon } from './Icon';
import { CATEGORY_LABEL, GRADE_LABEL } from '../engine/derive/types';
import { CONTRADICTION_LABEL } from '../engine/types';
import { formatDate } from '../engine/text/normalize';
import { nextStatus, type QuestionStatus } from '../engine/questions';

/* ------------------------------------------------------------------ */
/* The State of the Record                                             */
/*                                                                    */
/* One question, five answers: what does this record establish, what    */
/* changed, what conflicts, what is uncertain, and what is still open.  */
/*                                                                    */
/* Nothing here is decorative. Every line is read from the artifact and */
/* every line is a link to the evidence or proof that produced it.      */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<QuestionStatus, string> = {
  open: 'open',
  investigating: 'investigating',
  answered: 'answered',
  dismissed: 'dismissed',
};

export function StateOfRecord() {
  const store = useStore();
  const {
    graph,
    snapshot,
    derivations,
    changes,
    contradictions,
    quality,
    questions,
    engine,
    asOf,
    openEvidence,
    openProof,
    setView,
    setQuestionStatus,
  } = store;

  const receipt = useMemo(
    () => artifactReceipt(engine.identity, graph, derivations, engine.verification),
    [engine, graph, derivations],
  );

  const activeConditions = snapshot.conditions.filter((condition) => condition.status === 'active');
  const activeMedications = snapshot.medications.filter((medication) => medication.status === 'active');
  const openQuestions = questions.filter((question) => question.status !== 'dismissed');
  const nonGapConflicts = contradictions.filter((entry) => entry.kind !== 'documentation_gap');
  const uncertainFindings = derivations.filter(
    (derivation) => derivation.grade === 'C' || derivation.grade === 'D',
  );
  const flaggedFacts = graph.facts.filter((fact) => fact.flags.length > 0).length;
  const weakDimensions = quality.dimensions.filter((dimension) => dimension.score < 70);
  const realChanges = changes.filter((change) => change.kind !== 'new_document');

  return (
    <div className="sor">
      <header className="sor-head">
        <div>
          <div className="sor-eyebrow">State of the record</div>
          <h1 className="sor-title">What this record establishes</h1>
          <p className="sor-sub">
            Documented as of {formatDate(asOf)}. Every item below links to the evidence or proof that
            produced it.
          </p>
        </div>
        <ReceiptView receipt={receipt} />
      </header>

      <Established conditions={activeConditions} medications={activeMedications} openEvidence={openEvidence} />

      <Changed changes={realChanges} openEvidence={openEvidence} />

      <Conflicted conflicts={nonGapConflicts} documentCount={graph.documents.length} openEvidence={openEvidence} />

      <Uncertain
        findings={uncertainFindings}
        dimensions={weakDimensions}
        flaggedFacts={flaggedFacts}
        openProof={openProof}
        setView={setView}
      />

      <Questions
        questions={openQuestions}
        setView={setView}
        setQuestionStatus={setQuestionStatus}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The five sections                                                   */
/* ------------------------------------------------------------------ */

interface EvidenceOpener {
  openEvidence: (request: { title: string; subtitle?: string; factIds: string[]; docId?: string }) => void;
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="sor-section-head">
      <h2 className="sor-section-title">{title}</h2>
      <span className="sor-section-note">{note}</span>
    </div>
  );
}

function Established({
  conditions,
  medications,
  openEvidence,
}: {
  conditions: Array<{ entityKey: string; label: string; since: string; factIds: string[] }>;
  medications: Array<{
    entityKey: string;
    label: string;
    since: string;
    factIds: string[];
    latestDose?: string;
  }>;
} & EvidenceOpener) {
  const count = conditions.length + medications.length;
  return (
    <section className="sor-section">
      <SectionHead title="Established" note={`${count} active`} />
      {count === 0 ? (
        <EvidenceState
          searched="all documents for an active condition or medication"
          found="nothing documented as currently active"
          cannot="conclude nothing is active — only that no document here says so"
        />
      ) : (
        <div className="sor-list">
          {conditions.slice(0, 4).map((condition) => (
            <button
              key={condition.entityKey}
              type="button"
              className="sor-item"
              onClick={() =>
                openEvidence({ title: condition.label, subtitle: 'Condition', factIds: condition.factIds })
              }
            >
              <span className="sor-item-kind">condition</span>
              <span className="sor-item-label">{condition.label}</span>
              <span className="sor-item-meta">since {formatDate(condition.since)}</span>
              <span className="sor-item-go">evidence →</span>
            </button>
          ))}
          {medications.slice(0, 4).map((medication) => (
            <button
              key={medication.entityKey}
              type="button"
              className="sor-item"
              onClick={() =>
                openEvidence({ title: medication.label, subtitle: 'Medication', factIds: medication.factIds })
              }
            >
              <span className="sor-item-kind">medication</span>
              <span className="sor-item-label">{medication.label}</span>
              <span className="sor-item-meta">
                {medication.latestDose ?? 'dose not stated'} · since {formatDate(medication.since)}
              </span>
              <span className="sor-item-go">evidence →</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Changed({
  changes,
  openEvidence,
}: {
  changes: Array<{
    id: string;
    kind: string;
    entityLabel: string;
    deltaText: string;
    fromFactId?: string;
    toFactId?: string;
  }>;
} & EvidenceOpener) {
  return (
    <section className="sor-section">
      <SectionHead title="Changed" note={`${changes.length} documented changes`} />
      {changes.length === 0 ? (
        <EvidenceState
          searched="the window for any statement describing the same thing differently at two dates"
          found="no documented change"
          cannot="conclude nothing happened — only that no change was written down"
        />
      ) : (
        <div className="sor-list">
          {changes.slice(0, 5).map((change) => (
            <button
              key={change.id}
              type="button"
              className="sor-item"
              onClick={() =>
                openEvidence({
                  title: `${change.entityLabel} — ${change.kind.replace(/_/g, ' ')}`,
                  subtitle: change.deltaText,
                  factIds: [change.fromFactId, change.toFactId].filter(Boolean) as string[],
                })
              }
            >
              <span className="sor-item-kind">change</span>
              <span className="sor-item-label">{change.entityLabel}</span>
              <span className="sor-item-meta">{change.deltaText}</span>
              <span className="sor-item-go">source →</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}


function Conflicted({
  conflicts,
  documentCount,
  openEvidence,
}: {
  conflicts: Array<{ id: string; kind: string; title: string; detail: string; factIds: string[] }>;
  documentCount: number;
} & EvidenceOpener) {
  return (
    <section className="sor-section">
      <SectionHead title="Conflicted" note={`${conflicts.length} open contradictions`} />
      {conflicts.length === 0 ? (
        <EvidenceState
          searched={`${documentCount} documents for any pair of statements that disagree`}
          found="no contradiction"
          cannot="conclude the record is correct — only that nothing in it contradicts anything else in it"
        />
      ) : (
        <div className="sor-list">
          {conflicts.slice(0, 4).map((contradiction) => {
            const label = CONTRADICTION_LABEL[contradiction.kind as keyof typeof CONTRADICTION_LABEL];
            return (
              <button
                key={contradiction.id}
                type="button"
                className="sor-item"
                onClick={() =>
                  openEvidence({
                    title: contradiction.title,
                    subtitle: label,
                    factIds: contradiction.factIds,
                  })
                }
              >
                <span className="sor-item-kind">conflict</span>
                <span className="sor-item-label">{label}</span>
                <span className="sor-item-meta">{contradiction.detail}</span>
                <span className="sor-item-go">both sides →</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}


function Uncertain({
  findings,
  dimensions,
  flaggedFacts,
  openProof,
  setView,
}: {
  findings: Array<{ id: string; grade: string; title: string }>;
  dimensions: Array<{ id: string; label: string; score: number }>;
  flaggedFacts: number;
  openProof: (derivationId: string) => void;
  setView: (view: 'quality') => void;
}) {
  return (
    <section className="sor-section">
      <SectionHead
        title="Uncertain"
        note={`${findings.length} findings on weak evidence · ${flaggedFacts} flagged facts`}
      />
      {findings.length === 0 && dimensions.length === 0 ? (
        <EvidenceState
          searched="every finding for grade C or D evidence and every quality dimension below 70"
          found="nothing weak"
          cannot="conclude the record is complete — only that nothing in it reads as weakly supported"
        />
      ) : (
        <div className="sor-list">
          {findings.slice(0, 4).map((derivation) => (
            <button
              key={derivation.id}
              type="button"
              className="sor-item"
              onClick={() => openProof(derivation.id)}
            >
              <span className="sor-item-kind">grade {derivation.grade}</span>
              <span className="sor-item-label">{derivation.title}</span>
              <span className="sor-item-meta">
                {GRADE_LABEL[derivation.grade as keyof typeof GRADE_LABEL]}
              </span>
              <span className="sor-item-go">proof →</span>
            </button>
          ))}
          {dimensions.slice(0, 2).map((dimension) => (
            <button
              key={dimension.id}
              type="button"
              className="sor-item"
              onClick={() => setView('quality')}
            >
              <span className="sor-item-kind">quality</span>
              <span className="sor-item-label">{dimension.label}</span>
              <span className="sor-item-meta">{dimension.score}%</span>
              <span className="sor-item-go">scorecard →</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}



function Questions({
  questions,
  setView,
  setQuestionStatus,
}: {
  questions: Array<{
    id: string;
    category: string;
    question: string;
    evidence: string;
    destination: 'debugger' | 'quality' | 'inference' | 'records' | 'timemachine' | 'lab';
    status: QuestionStatus;
  }>;
  setView: (view: ViewId) => void;
  setQuestionStatus: (id: string, status: QuestionStatus) => void;
}) {
  return (
    <section className="sor-section">
      <SectionHead title="Open questions" note={`${questions.length} the record cannot answer`} />
      {questions.length === 0 ? (
        <EvidenceState
          searched="the artifact for a conflict, a gap, weak evidence, an inferred-but-unstated finding, or an unpinned change"
          found="no open question"
          cannot="conclude every question has been answered — only that nothing in this record raises one it cannot settle"
        />
      ) : (
        <div className="sor-questions">
          {questions.slice(0, 6).map((question) => (
            <div key={question.id} className="sor-question">
              <span className={`sor-question-cat is-${question.category}`}>
                {CATEGORY_LABEL[question.category as keyof typeof CATEGORY_LABEL]}
              </span>
              <div className="sor-question-body">
                <div className="sor-question-text">{question.question}</div>
                <div className="sor-question-evidence">{question.evidence}</div>
              </div>
              <div className="sor-question-actions">
                <button
                  type="button"
                  className="sor-question-go"
                  onClick={() => setView(question.destination)}
                  title="Investigate"
                >
                  <Icon.Play size={11} />
                  investigate
                </button>
                <button
                  type="button"
                  className={`sor-question-status is-${question.status}`}
                  onClick={() => setQuestionStatus(question.id, nextStatus(question.status))}
                  title="Advance: open → investigating → answered → dismissed"
                >
                  {STATUS_LABEL[question.status]}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* An empty state that is an evidence state                            */
/*                                                                    */
/* Every one says three things: what was searched, what was found, and  */
/* what that absence does and does not allow a reader to conclude.       */
/* ------------------------------------------------------------------ */

function EvidenceState({
  searched,
  found,
  cannot,
}: {
  searched: string;
  found: string;
  cannot: string;
}) {
  return (
    <div className="sor-evidence-state">
      <Icon.Check size={14} />
      <div>
        <strong>{found}.</strong>
        <p>
          {searched}. This does <em>not</em> {cannot}.
        </p>
      </div>
    </div>
  );
}
