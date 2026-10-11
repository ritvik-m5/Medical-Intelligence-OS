import { useMemo } from 'react';
import { useStore } from '../state/store';
import { highlightDocument } from '../lib/highlight';
import { Chip, Confidence } from './Panel';
import { formatDate } from '../engine/text/normalize';
import { DOC_KIND_LABEL, FACT_TYPE_LABEL } from '../engine/types';
import { factTone, plural, statusLabel } from '../lib/format';

/**
 * Renders a source document with every extracted fact highlighted in place.
 *
 * This is the visual proof that the system reads documents rather than
 * paraphrasing them: the highlights are exactly the character spans stored on
 * the facts, so if a highlight looks wrong, the extraction is wrong and the user
 * can see it immediately.
 */
export function DocumentViewer({ docId }: { docId: string }) {
  const { graph, openEvidence } = useStore();
  const doc = graph.documents.find((d) => d.id === docId);

  const facts = useMemo(
    () => (doc ? graph.facts.filter((f) => f.docId === doc.id) : []),
    [doc, graph],
  );

  const segments = useMemo(() => (doc ? highlightDocument(doc, facts) : []), [doc, facts]);

  if (!doc) return <div className="empty">Select a document to inspect it.</div>;

  const byType = facts.reduce<Record<string, number>>((acc, fact) => {
    acc[fact.type] = (acc[fact.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Chip tone="info">{DOC_KIND_LABEL[doc.kind]}</Chip>
        <span className="mono muted">{formatDate(doc.date)}</span>
        {doc.facility && <span className="muted">· {doc.facility}</span>}
        {doc.author && <span className="muted">· {doc.author}</span>}
        <span style={{ marginLeft: 'auto' }}>
          <Confidence value={doc.quality} label={`quality ${doc.quality.toFixed(2)}`} />
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(byType).map(([type, count]) => (
          <Chip key={type} tone="muted">
            {plural(count, FACT_TYPE_LABEL[type as keyof typeof FACT_TYPE_LABEL])}
          </Chip>
        ))}
        {facts.length === 0 && <Chip tone="warn">No facts extracted from this document</Chip>}
      </div>

      <div className="doc-text">
        {segments.map((segment, index) =>
          segment.factId ? (
            <span
              key={index}
              className={`span-fact ${segment.kindClass ?? ''}${segment.flagged ? ' is-flagged' : ''}`}
              onClick={() => {
                const fact = facts.find((f) => f.id === segment.factId);
                if (!fact) return;
                openEvidence({
                  title: fact.label,
                  subtitle: `${FACT_TYPE_LABEL[fact.type]} · ${statusLabel(fact.status)} · ${doc.title}`,
                  factIds: [fact.id],
                  docId: doc.id,
                });
              }}
              title={`${FACT_TYPE_LABEL[facts.find((f) => f.id === segment.factId)!.type]} — click for evidence`}
            >
              {segment.text}
            </span>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </div>

      <div className="graph-legend" style={{ position: 'static' }}>
        <div className="graph-legend-row">
          <span className="dot info" /> measurement
          <span className="dot ok" style={{ marginLeft: 8 }} /> medication
          <span className="dot external" style={{ marginLeft: 8 }} /> condition
        </div>
        <div className="graph-legend-row">
          <span className="dot warn" /> procedure
          <span className="dot critical" style={{ marginLeft: 8 }} /> allergy
          <span className="dot muted" style={{ marginLeft: 8 }} /> other
        </div>
      </div>

      {facts.some((f) => f.flags.length > 0) && (
        <div className="notice is-warn">
          <div>
            <strong>Some lines in this document raised flags.</strong> Highlighted items with a
            dotted underline were read but questioned — open them to see exactly why.
          </div>
        </div>
      )}
    </div>
  );
}

export function FactToneDot({ tone }: { tone: ReturnType<typeof factTone> }) {
  return <span className={`dot ${tone}`} />;
}
