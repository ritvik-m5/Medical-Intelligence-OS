import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, Panel } from '../components/Panel';
import { DocumentViewer } from '../components/DocumentViewer';
import { RecordCard } from '../components/RecordCard';
import { formatDate } from '../engine/text/normalize';
import { DOC_KIND_LABEL, type DocKind } from '../engine/types';
import { DOC_KIND_GLYPH, Icon } from '../components/Icon';
import { plural } from '../lib/format';
import { IntakePanel } from '../components/IntakePanel';
import { SessionPanel } from '../components/SessionPanel';
import { summarizeDocument } from '../engine/document/summarize';

/**
 * Records: the document library, the intake surface, and the extraction
 * inspector. Selecting a document shows it with every extracted fact
 * highlighted in place.
 */
export function RecordsView() {
  const { graph, focusDocId, setFocusDoc, userDocumentCount, derivations } = useStore();
  const [filter, setFilter] = useState<DocKind | 'all'>('all');
  const [query, setQuery] = useState('');

  const documents = useMemo(() => {
    const sorted = [...graph.documents].sort((a, b) => b.date.localeCompare(a.date));
    return sorted.filter((doc) => {
      if (filter !== 'all' && doc.kind !== filter) return false;
      if (!query.trim()) return true;
      const haystack = `${doc.title} ${doc.facility ?? ''} ${doc.author ?? ''} ${doc.text}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });
  }, [graph, filter, query]);

  const kinds = useMemo(
    () => Array.from(new Set(graph.documents.map((d) => d.kind))).sort(),
    [graph.documents],
  );

  const activeDocId = focusDocId ?? documents[0]?.id ?? null;

  const summary = useMemo(
    () => (activeDocId ? summarizeDocument(graph, activeDocId, derivations) : null),
    [graph, activeDocId, derivations],
  );

  return (
    <div className="view-inner">
      <IntakePanel />

      <SessionPanel />

      <div className="grid" style={{ gridTemplateColumns: '360px minmax(0, 1fr)', gap: 16 }}>
        <Panel
          title="Document library"
          sub={`${plural(graph.documents.length, 'document')}${userDocumentCount > 0 ? ` · ${userDocumentCount} added by you` : ''}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="field">
              <input
                type="search"
                placeholder="Search titles and full text…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <button
                type="button"
                className={`chip is-button${filter === 'all' ? ' is-ok' : ' is-muted'}`}
                onClick={() => setFilter('all')}
              >
                all
              </button>
              {kinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`chip is-button${filter === kind ? ' is-ok' : ' is-muted'}`}
                  onClick={() => setFilter(kind)}
                >
                  {kind.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 520,
                overflowY: 'auto',
              }}
            >
              {documents.map((doc) => {
                const factCount = graph.factsByDocument[doc.id]?.length ?? 0;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    className={`tl-body${activeDocId === doc.id ? '' : ''}`}
                    style={{
                      border: `1px solid ${activeDocId === doc.id ? 'var(--accent-line)' : 'var(--line)'}`,
                      background:
                        activeDocId === doc.id ? 'rgba(61,220,151,0.07)' : 'rgba(255,255,255,0.02)',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onClick={() => setFocusDoc(doc.id)}
                  >
                    <div className="tl-title">
                      <span className="mono dim" style={{ fontSize: 10 }}>
                        {DOC_KIND_GLYPH[doc.kind]}
                      </span>
                      <span style={{ fontWeight: 500 }}>{doc.title}</span>
                    </div>
                    <div className="tl-sub">
                      <span className="mono">{formatDate(doc.date)}</span> ·{' '}
                      {DOC_KIND_LABEL[doc.kind]} · {plural(factCount, 'fact')}
                      {doc.origin !== 'sample' && ' · imported by you'}
                    </div>
                  </button>
                );
              })}
              {documents.length === 0 && (
                <div className="empty">No document matches that filter.</div>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title={activeDocId ? graph.documents.find((d) => d.id === activeDocId)?.title : 'Extraction inspector'}
          sub="Highlighted text is exactly the character span stored on each fact"
          actions={
            activeDocId ? (
              <Chip tone="info">
                <Icon.Eye size={11} /> click any highlight
              </Chip>
            ) : null
          }
        >
          {activeDocId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {summary && <RecordCard summary={summary} />}
              <DocumentViewer docId={activeDocId} />
            </div>
          ) : (
            <div className="empty">Select a document.</div>
          )}
        </Panel>
      </div>
    </div>
  );
}
