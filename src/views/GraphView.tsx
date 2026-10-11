import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, Panel } from '../components/Panel';
import { GraphCanvas, KindLegend } from '../components/GraphCanvas';
import { computeLayout } from '../components/graphLayout';
import { useGraphInteraction } from '../components/graphInteraction';
import { evidenceForEntity } from '../engine/evidence';
import { factsFor } from '../engine/access';
import { formatDate } from '../engine/text/normalize';
import { plural, statusLabel } from '../lib/format';
import type { EntityKind } from '../engine/types';

const TOGGLEABLE: EntityKind[] = [
  'condition',
  'medication',
  'measurement',
  'vital',
  'procedure',
  'allergy',
  'immunization',
  'symptom',
  'social',
];

/**
 * The Temporal Health Graph, rendered from the same objects the engines reason
 * over. Inferred edges are drawn differently on purpose: a reader must be able to
 * tell what the documents said from what the engine added.
 */
export function GraphView() {
  const { graph, openEvidence, asOf } = useStore();
  const [visible, setVisible] = useState<Set<EntityKind>>(new Set(TOGGLEABLE));
  const [showLabels, setShowLabels] = useState(true);
  const [showInferred, setShowInferred] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layout = useMemo(() => computeLayout(graph, visible), [graph, visible]);
  const interaction = useGraphInteraction(layout.nodes);

  const selectedIndex = selectedId ? layout.nodes.findIndex((n) => n.id === selectedId) : -1;
  const selectedNode = selectedIndex >= 0 ? layout.nodes[selectedIndex] : null;

  const detail = useMemo(() => {
    if (!selectedNode) return null;
    const entity = graph.entities.find((e) => e.id === selectedNode.id);
    if (!entity) return null;
    const facts = factsFor(graph, entity.key).filter((f) => f.occurredAt <= asOf);
    const relations = graph.edges
      .filter(
        (edge) =>
          (edge.from === entity.id || edge.to === entity.id) &&
          (edge.kind === 'monitors' || edge.kind === 'treats' || edge.kind === 'co_occurs'),
      )
      .slice(0, 8)
      .map((edge) => {
        const otherId = edge.from === entity.id ? edge.to : edge.from;
        const other = graph.entities.find((e) => e.id === otherId);
        return { edge, other };
      });
    return {
      entity,
      facts,
      relations,
      evidence: evidenceForEntity(entity.key),
    };
  }, [selectedNode, graph, asOf]);

  const toggle = (kind: EntityKind) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <div className="view-inner">
      <Panel
        title="Graph"
        sub={`${layout.nodes.length} nodes · ${layout.links.length} edges · ${plural(graph.stats.entities, 'concept')} resolved from ${plural(graph.stats.facts, 'fact')}`}
        actions={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              className={`btn is-sm${showInferred ? ' is-primary' : ''}`}
              onClick={() => setShowInferred((v) => !v)}
            >
              Inferred edges
            </button>
            <button
              type="button"
              className={`btn is-sm${showLabels ? ' is-primary' : ''}`}
              onClick={() => setShowLabels((v) => !v)}
            >
              Labels
            </button>
            <button
              type="button"
              className="btn is-sm"
              onClick={() => interaction.setViewport({ scale: 0.58, offsetX: 0, offsetY: 0 })}
            >
              Reset view
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {TOGGLEABLE.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip${visible.has(kind) ? ' is-ok is-button' : ' is-muted is-button'}`}
              onClick={() => toggle(kind)}
            >
              {kind}
            </button>
          ))}
        </div>

        <GraphCanvas
          nodes={layout.nodes}
          links={layout.links}
          viewport={interaction.viewport}
          hovered={interaction.hovered}
          selectedId={selectedId}
          showLabels={showLabels}
          showInferred={showInferred}
          onHover={interaction.setHovered}
          onSelect={(index) => setSelectedId(index === null ? null : layout.nodes[index].id)}
          onPan={(offsetX, offsetY) => interaction.setViewport((v) => ({ ...v, offsetX, offsetY }))}
          onZoom={(scale) => interaction.setViewport((v) => ({ ...v, scale }))}
        />

        <div className="graph-hint" style={{ position: 'static', marginTop: 10 }}>
          Drag to pan, scroll to zoom, click a node to inspect it. Solid lines are relations the
          documents state; dashed and coloured lines are relations the engine inferred.
        </div>
      </Panel>

      <div className="grid grid-2">
        <Panel
          title="Node inspector"
          sub={
            selectedNode
              ? `${selectedNode.kind} · ${plural(selectedNode.factCount, 'documented statement')}`
              : 'Click any node in the graph'
          }
        >
          {!detail ? (
            <div className="empty">
              Nothing selected. Click a node to see every statement behind it, the relations the
              engine inferred, and the external reference material it links to.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15 }}>{detail.entity.label}</strong>
                <Chip tone="muted">{detail.entity.kind}</Chip>
                {detail.entity.category && <Chip tone="muted">{detail.entity.category}</Chip>}
              </div>

              <div className="grid grid-3">
                <div>
                  <div className="metric-label">First seen</div>
                  <div className="mono">{formatDate(detail.entity.firstSeen)}</div>
                </div>
                <div>
                  <div className="metric-label">Last seen</div>
                  <div className="mono">{formatDate(detail.entity.lastSeen)}</div>
                </div>
                <div>
                  <div className="metric-label">Mean confidence</div>
                  <div className="mono">{detail.entity.confidence.toFixed(2)}</div>
                </div>
              </div>

              <div>
                <div className="metric-label" style={{ marginBottom: 7 }}>
                  Statements ({detail.facts.length})
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}
                >
                  {detail.facts.map((fact) => (
                    <div
                      key={fact.id}
                      className="tl-body"
                      style={{ border: '1px solid var(--line)' }}
                      onClick={() =>
                        openEvidence({
                          title: fact.label,
                          subtitle: `${statusLabel(fact.status)} · ${formatDate(fact.occurredAt)}`,
                          factIds: [fact.id],
                          docId: fact.docId,
                        })
                      }
                    >
                      <div className="tl-title">
                        <span className="mono muted">{formatDate(fact.occurredAt)}</span>
                        {fact.valueNum !== undefined && (
                          <span className="mono">
                            {fact.valueNum} {fact.unit}
                          </span>
                        )}
                        <Chip tone={fact.status === 'discontinued' ? 'warn' : 'muted'}>
                          {statusLabel(fact.status)}
                        </Chip>
                        {fact.flags.includes('implausible_value') && (
                          <Chip tone="critical">flagged</Chip>
                        )}
                      </div>
                      <div className="tl-quote">{fact.quote}</div>
                    </div>
                  ))}
                  {detail.facts.length === 0 && (
                    <div className="dim" style={{ fontSize: 11.5 }}>
                      No statement for this concept exists on or before the current Time Machine date.
                    </div>
                  )}
                </div>
              </div>

              {detail.relations.length > 0 && (
                <div>
                  <div className="metric-label" style={{ marginBottom: 7 }}>
                    Inferred relations
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {detail.relations.map(({ edge, other }) => (
                      <Chip key={edge.id} tone={edge.inferred ? 'external' : 'muted'}>
                        {edge.kind} → {other?.label ?? 'unknown'}
                      </Chip>
                    ))}
                  </div>
                  <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
                    These relations come from a curated mapping, not from the documents. They are
                    marked inferred in the graph for exactly that reason.
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>


        <Panel
          title="External reference material"
          sub="Only shown when the selected concept has a mapped public source"
        >
          {!detail || detail.evidence.length === 0 ? (
            <div className="empty">
              Nothing is selected, or the selected concept has no mapped external source. In that
              case the product shows nothing rather than guessing.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {detail.evidence.map((item) => (
                <a
                  key={item.id}
                  className="answer-item"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="answer-item-label">
                    <span className="dot external" />
                    <span>{item.title}</span>
                    <span className="chip is-external">{item.source}</span>
                  </div>
                  <div className="answer-item-sub">{item.summary}</div>
                </a>
              ))}
              <div className="notice">
                <div>
                  <strong>This is not about the patient.</strong> It describes a class of medication
                  or a test in general, from a public source, and is kept outside the personal graph.
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Legend" sub="Colour is the concept. The line is the relation.">
        <KindLegend kinds={TOGGLEABLE} />
      </Panel>
    </div>
  );
}

