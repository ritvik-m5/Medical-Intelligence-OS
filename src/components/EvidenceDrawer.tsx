import { useMemo } from 'react';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { Chip, Confidence } from './Panel';
import { quoteWithContext } from '../lib/highlight';
import { flagLabels, flagTone, formatValue, referenceRangeText, statusLabel } from '../lib/format';
import { formatDate } from '../engine/text/normalize';
import { DOC_KIND_LABEL, FACT_TYPE_LABEL, type Fact } from '../engine/types';

/** What the stored character span covers — set at read time, never broadened. */
function spanCoverage(fact: Fact): string {
  const entitySpan =
    typeof fact.attrs.entitySpanStart === 'number' &&
    typeof fact.attrs.entitySpanEnd === 'number' &&
    typeof fact.attrs.valueSpanStart === 'number' &&
    typeof fact.attrs.valueSpanEnd === 'number' &&
    fact.span[0] === fact.attrs.valueSpanStart &&
    fact.span[1] === fact.attrs.valueSpanEnd;
  if (entitySpan) return 'value, flag, unit and reference interval';
  if (fact.valueNum !== undefined) return 'stated value';
  return 'concept name';
}

/**
 * The evidence drawer.
 *
 * Every number in the product opens this. It answers the only question that
 * matters for trust: which characters, in which document, produced this?
 */
export function EvidenceDrawer() {
  const { evidence, closeEvidence, graph, setView, setFocusDoc } = useStore();

  const facts = useMemo(() => {
    if (!evidence) return [];
    const ids = new Set(evidence.factIds);
    return graph.facts.filter((f) => ids.has(f.id));
  }, [evidence, graph]);

  const lineage = useMemo(() => {
    if (!evidence) return [];
    const ids = new Set(facts.map((f) => f.docId));
    if (evidence.docId) ids.add(evidence.docId);
    return graph.documents.filter((d) => ids.has(d.id));
  }, [evidence, facts, graph]);

  if (!evidence) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={closeEvidence} role="presentation" />
      <aside className="drawer" aria-label="Evidence">
        <header className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="panel-title">{evidence.title}</div>
            {evidence.subtitle && <div className="panel-sub">{evidence.subtitle}</div>}
          </div>
          <button type="button" className="drawer-close" onClick={closeEvidence} aria-label="Close">
            <Icon.Close size={16} />
          </button>
        </header>

        <div className="drawer-body">
          {facts.length === 0 && (
            <div className="empty">
              No fact is attached to this item. That is itself information: the system has nothing
              to cite, so it asserts nothing.
            </div>
          )}

          {facts.map((fact) => {
            const doc = graph.documents.find((d) => d.id === fact.docId);
            const context = doc ? quoteWithContext(doc, fact.span) : null;
            return (
              <div className="evidence-fact" key={fact.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13.5 }}>{fact.label}</strong>
                  <Chip tone="info">{FACT_TYPE_LABEL[fact.type]}</Chip>
                  <Chip tone={fact.status === 'discontinued' ? 'warn' : 'muted'}>
                    {statusLabel(fact.status)}
                  </Chip>
                  <span style={{ marginLeft: 'auto' }}>
                    <Confidence value={fact.confidence} />
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 15, color: 'var(--text)' }}>
                    {formatValue(fact)}
                  </span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    range {referenceRangeText(fact)}
                    {fact.attrs.referenceRangeSource === 'illustrative-typical' &&
                      ' (typical — not from the document)'}
                  </span>
                </div>

                {context && (
                  <div className="evidence-quote">
                    {context.before}
                    <mark>{context.quote}</mark>
                    {context.after}
                  </div>
                )}

                <dl className="kv">
                  <dt>Document</dt>
                  <dd>
                    {doc?.title ?? 'unknown'} · {doc ? DOC_KIND_LABEL[doc.kind] : ''}
                  </dd>
                  <dt>Document date</dt>
                  <dd className="mono">{doc ? formatDate(doc.date) : fact.occurredAt}</dd>
                  <dt>Fact date</dt>
                  <dd className="mono">{formatDate(fact.occurredAt)}</dd>
                  <dt>Character span</dt>
                  <dd className="mono">
                    [{fact.span[0]}, {fact.span[1]}] · {fact.span[1] - fact.span[0]} chars
                  </dd>
                  <dt>Span covers</dt>
                  <dd className="mono">{spanCoverage(fact)}</dd>
                  {typeof fact.attrs.entitySpanStart === 'number' &&
                    typeof fact.attrs.entitySpanEnd === 'number' && (
                      <>
                        <dt>Concept span</dt>
                        <dd className="mono">
                          [{fact.attrs.entitySpanStart}, {fact.attrs.entitySpanEnd}] · names the concept
                        </dd>
                        <dt>Value span</dt>
                        <dd className="mono">
                          [{fact.attrs.valueSpanStart}, {fact.attrs.valueSpanEnd}] · value, flag, unit and reference
                          interval
                        </dd>
                      </>
                    )}
                  <dt>Extractor</dt>
                  <dd className="mono">{fact.extractor}</dd>
                  <dt>Section</dt>
                  <dd className="mono">{fact.sectionKind.replace(/_/g, ' ')}</dd>
                  <dt>Quoted line</dt>
                  <dd className="mono" style={{ fontSize: 11.5 }}>
                    {fact.quote}
                  </dd>
                </dl>

                {fact.flags.length > 0 && (
                  <div>
                    <div className="metric-label" style={{ marginBottom: 6 }}>
                      Flags raised while reading this line
                    </div>
                    <div className="flag-list">
                      {fact.flags.map((flag) => (
                        <Chip key={flag} tone={flagTone(flag)}>
                          {flagLabels([flag])[0]}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {doc && (
                  <button
                    type="button"
                    className="btn is-sm"
                    onClick={() => {
                      setFocusDoc(doc.id);
                      setView('records');
                      closeEvidence();
                    }}
                  >
                    <Icon.Eye size={13} />
                    Open source document
                  </button>
                )}
              </div>
            );
          })}
          {lineage.length > 0 && (
            <div className="side-card">
              <div className="metric-label" style={{ marginBottom: 7 }}>
                Document lineage
              </div>
              <div className="tl">
                {lineage.map((doc) => (
                  <div className="tl-row" key={doc.id}>
                    <div className="tl-date">{formatDate(doc.date)}</div>
                    <div className="tl-marker">
                      <span className="tl-dot is-info" />
                    </div>
                    <div className="tl-body" onClick={() => setFocusDoc(doc.id)}>
                      <div className="tl-title">{doc.title}</div>
                      <div className="tl-sub">
                        {DOC_KIND_LABEL[doc.kind]}
                        {doc.facility ? ` · ${doc.facility}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
