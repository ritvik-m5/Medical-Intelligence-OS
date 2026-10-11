import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, Notice, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import { AnswerView } from '../components/AnswerView';
import { SUGGESTED_QUESTIONS } from '../engine/query';
import { formatDate } from '../engine/text/normalize';

/**
 * Ask.
 *
 * The answer is produced by planning a query over the structured graph, not by
 * generating prose from a language model. The plan, the cited lines and the
 * coverage are all shown, because an answer nobody can audit is worth nothing in
 * a medical record.
 */
export function AskView() {
  const { turns, askQuestion, clearTurns, asOf, graph, openEvidence } = useStore();
  const [question, setQuestion] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (!question.trim()) return;
    askQuestion(question);
    setQuestion('');
  };

  return (
    <div className="view-inner">
      <Panel
        title="Ask the record"
        sub={`Answers are computed from ${graph.stats.facts} provenanced facts and obey the Time Machine date (${formatDate(asOf)})`}
        actions={
          turns.length > 0 ? (
            <button type="button" className="btn is-sm" onClick={clearTurns}>
              Clear
            </button>
          ) : null
        }
      >
        <div className="ask-input">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Show me everything related to cholesterol — or: are there any conflicts in my medication list?"
            rows={2}
          />
          <button
            type="button"
            className="btn is-primary"
            onClick={submit}
            disabled={!question.trim()}
          >
            <Icon.Ask size={14} />
            Ask
          </button>
        </div>

        <div className="suggestion-list" style={{ marginTop: 12 }}>
          {SUGGESTED_QUESTIONS.map((suggestion) => (
            <Chip key={suggestion} tone="muted" onClick={() => askQuestion(suggestion)}>
              {suggestion}
            </Chip>
          ))}
        </div>
      </Panel>

      <div className="ask-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {turns.length === 0 && (
            <Panel title="Nothing asked yet">
              <div className="empty">
                Ask a question above, or pick one of the suggestions. Every answer shows the steps
                the engine took, the exact lines it cited, and what it could not establish.
              </div>
            </Panel>
          )}

          {turns.map((turn) => (
            <div key={turn.id} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                className="panel"
                style={{ borderColor: 'var(--accent-line)', background: 'rgba(61,220,151,0.05)' }}
              >
                <div className="panel-body" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="dot ok" />
                    <span style={{ fontSize: 13.5, fontWeight: 550 }}>{turn.question}</span>
                    <span className="mono dim" style={{ marginLeft: 'auto', fontSize: 10.5 }}>
                      answered as of {asOf}
                    </span>
                  </div>
                </div>
              </div>

              {turn.error ? (
                <Notice tone="critical">
                  <strong>The query engine could not answer that.</strong> {turn.error}
                </Notice>
              ) : turn.answer ? (
                <AnswerView answer={turn.answer} />
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel title="How this differs from a chatbot">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 12.5,
                lineHeight: 1.65,
                color: 'var(--text-2)',
              }}
            >
              <div>
                <strong style={{ color: 'var(--text)' }}>It queries, it does not recall.</strong> The
                question is parsed into an intent and a concept, and the answer is assembled from
                facts that already exist in the graph.
              </div>
              <div>
                <strong style={{ color: 'var(--text)' }}>Every statement has a span.</strong> Each
                claim is tied to a document, a date, and the exact characters it was read from.
              </div>
              <div>
                <strong style={{ color: 'var(--text)' }}>Outside knowledge is fenced off.</strong>{' '}
                General medical reference material is labelled, linked to its source, and counted
                separately from your own record.
              </div>
              <div>
                <strong style={{ color: 'var(--text)' }}>It says what it does not know.</strong>{' '}
                Absence of documentation, unit mismatches and low-confidence extractions are stated
                rather than smoothed over.
              </div>
            </div>
          </Panel>

          <Panel title="Coverage">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="stat-row">
                <span>Documents</span>
                <span>{graph.stats.documents}</span>
              </div>
              <div className="stat-row">
                <span>Facts</span>
                <span>{graph.stats.facts}</span>
              </div>
              <div className="stat-row">
                <span>Concepts</span>
                <span>{graph.stats.entities}</span>
              </div>
              <div className="stat-row">
                <span>Range</span>
                <span>
                  {graph.stats.spanStart} → {graph.stats.spanEnd}
                </span>
              </div>
              <div className="stat-row">
                <span>Mean confidence</span>
                <span>{graph.stats.meanConfidence.toFixed(2)}</span>
              </div>
            </div>
            <hr className="hairline" style={{ margin: '10px 0' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {graph.documents.slice(0, 8).map((doc) => (
                <Chip
                  key={doc.id}
                  tone="muted"
                  onClick={() =>
                    openEvidence({
                      title: doc.title,
                      subtitle: doc.kind.replace(/_/g, ' '),
                      factIds: [],
                      docId: doc.id,
                    })
                  }
                >
                  {doc.title}
                </Chip>
              ))}
              {graph.documents.length > 8 && (
                <Chip tone="muted">+{graph.documents.length - 8} more</Chip>
              )}
            </div>
          </Panel>

          <Notice>
            <strong>Not a medical device.</strong> This system organises, explains and cites your own
            documents. It does not diagnose, does not recommend treatment, and does not replace a
            clinician reading the original records.
          </Notice>
        </div>
      </div>
    </div>
  );
}

