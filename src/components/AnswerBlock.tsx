import { useStore } from '../state/store';
import { Icon } from './Icon';
import type { AnswerBlock } from '../engine/types';
import { ALL_EVIDENCE } from '../engine/evidence';

export function Block({ block }: { block: AnswerBlock }) {
  const { openEvidence, setFocusDoc, setView } = useStore();

  const wrapper = (children: React.ReactNode, extraClass = '') => (
    <div className={`answer-block${extraClass}`}>{children}</div>
  );

  const title = block.title ? (
    <div className="answer-block-title">
      {block.kind === 'warning' && <Icon.Warning size={13} />}
      {block.kind === 'evidence' && <Icon.Link size={13} />}
      {block.title}
    </div>
  ) : null;

  if (block.kind === 'text') {
    return wrapper(
      <>
        {title}
        <div className="answer-text">{block.text}</div>
      </>,
    );
  }

  if (block.kind === 'metric' && block.metrics) {
    return wrapper(
      <>
        {title}
        <div className="answer-metrics">
          {block.metrics.map((metric) => (
            <div key={metric.label}>
              <div className="answer-metric-label">{metric.label}</div>
              <div
                className="answer-metric-value"
                style={{ color: metric.tone ? `var(--${metric.tone})` : undefined }}
              >
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </>,
    );
  }

  if (block.kind === 'table' && block.rows && block.columns) {
    return wrapper(
      <>
        {title}
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {block.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cellIndex === 0 ? 'is-primary' : ''}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>,
    );
  }

  if (
    (block.kind === 'list' || block.kind === 'timeline' || block.kind === 'chart') &&
    block.items
  ) {
    return wrapper(
      <>
        {title}
        <div className="answer-items">
          {block.items.map((item, index) => (
            <div
              className="answer-item"
              key={index}
              onClick={() => {
                if (item.factId) {
                  openEvidence({ title: item.label, factIds: [item.factId] });
                } else if (block.docIds?.length) {
                  setFocusDoc(block.docIds[0]);
                  setView('records');
                }
              }}
            >
              <div className="answer-item-label">
                {item.tone && <span className={`dot ${item.tone}`} />}
                <span>{item.label}</span>
                {item.value && <span className="mono muted">{item.value}</span>}
              </div>
              {item.sub && <div className="answer-item-sub">{item.sub}</div>}
            </div>
          ))}
        </div>
      </>,
    );
  }

  if (block.kind === 'evidence' && block.items) {
    return wrapper(
      <>
        {title}
        <div className="answer-items">
          {block.items.map((item, index) => {
            const evidence = ALL_EVIDENCE.find((e) => e.id === block.evidenceIds?.[index]);
            return (
              <a
                className="answer-item"
                key={index}
                href={evidence?.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ textDecoration: 'none' }}
              >
                <div className="answer-item-label">
                  <span className="dot external" />
                  <span>{item.label}</span>
                  <span className="chip is-external">{item.value}</span>
                  <Icon.Link size={12} />
                </div>
                {item.sub && <div className="answer-item-sub">{item.sub}</div>}
              </a>
            );
          })}
        </div>
      </>,
      ' is-evidence',
    );
  }

  if (block.kind === 'warning') {
    return wrapper(
      <>
        {title}
        <div className="answer-text">{block.text}</div>
      </>,
      ' is-warning',
    );
  }

  if (block.kind === 'provenance') {
    return wrapper(
      <>
        {title}
        <div className="answer-text">{block.text}</div>
      </>,
      ' is-provenance',
    );
  }

  return null;
}
