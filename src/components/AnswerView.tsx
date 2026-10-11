import { useStore } from '../state/store';
import { Icon } from './Icon';
import { Chip, Confidence } from './Panel';
import { Block } from './AnswerBlock';
import { formatDate } from '../engine/text/normalize';
import type { Answer } from '../engine/types';

/** Renders a planned answer: plan, blocks, citations, coverage, limitations. */
export function AnswerView({ answer }: { answer: Answer }) {
  const { openEvidence, researchAbout } = useStore();
  const total = Math.max(1, answer.separation.personalFacts + answer.separation.externalEvidence);

  return (
    <div className="answer">
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">How this was answered</div>
            <div className="panel-sub">
              intent <span className="mono">{answer.intent.replace(/_/g, ' ')}</span> · confidence{' '}
              <span className="mono">{answer.confidence.toFixed(2)}</span>
            </div>
          </div>
          <div className="panel-head-actions">
            <Chip tone={answer.separation.externalEvidence > 0 ? 'external' : 'ok'}>
              {answer.separation.personalFacts} personal · {answer.separation.externalEvidence} external
            </Chip>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="plan-list">
            {answer.plan.map((step, index) => (
              <div className="plan-step" key={index}>
                <span className="plan-index">{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>

          <div className="separation-bar">
            <div
              className="separation-seg is-personal"
              style={{ width: `${(answer.separation.personalFacts / total) * 100}%` }}
            />
            <div
              className="separation-seg is-external"
              style={{ width: `${(answer.separation.externalEvidence / total) * 100}%` }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
            {answer.separation.note}
          </div>
        </div>
      </div>

      {answer.blocks.map((block) => (
        <Block key={block.id} block={block} />
      ))}

      {answer.citations.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              Sources ({answer.citations.length} quoted{' '}
              {answer.citations.length === 1 ? 'line' : 'lines'})
            </div>
          </div>
          <div className="panel-body">
            <div className="citation-list">
              {answer.citations.map((citation) => (
                <button
                  type="button"
                  className="citation"
                  key={citation.id}
                  onClick={() =>
                    openEvidence({
                      title: citation.label,
                      subtitle: `${citation.docTitle} · ${formatDate(citation.docDate)}`,
                      factIds: citation.factId ? [citation.factId] : [],
                      docId: citation.docId,
                    })
                  }
                >
                  <span className="citation-head">
                    <Icon.Quote size={12} />
                    <strong>{citation.docTitle}</strong>
                    <span className="mono muted">{formatDate(citation.docDate)}</span>
                    <span className="mono dim">
                      [{citation.span[0]}, {citation.span[1]}]
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      <Confidence value={citation.confidence} />
                    </span>
                  </span>
                  <span className="citation-quote">{citation.quote}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">What this answer cannot tell you</div>
          <div className="panel-head-actions">
            <Chip tone="muted">
              {answer.coverage.documentsSearched} documents searched
              {answer.coverage.dateRange
                ? ` · ${answer.coverage.dateRange[0]} → ${answer.coverage.dateRange[1]}`
                : ''}
            </Chip>
          </div>
        </div>
        <div className="panel-body">
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: 'var(--text-3)',
              fontSize: 12.5,
              lineHeight: 1.75,
            }}
          >
            {answer.limitations.map((limitation, index) => (
              <li key={index}>{limitation}</li>
            ))}
          </ul>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn is-sm"
              onClick={() => researchAbout(null, answer.question)}
            >
              <Icon.Research size={13} />
              Open Research Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
