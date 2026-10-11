import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_COLOR, type GraphLink, type GraphNode } from './graphLayout';

export interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  viewport: { scale: number; offsetX: number; offsetY: number };
  hovered: number | null;
  selectedId: string | null;
  showLabels: boolean;
  showInferred: boolean;
  onHover: (index: number | null) => void;
  onSelect: (index: number | null) => void;
  onPan: (offsetX: number, offsetY: number) => void;
  onZoom: (scale: number) => void;
}

const LINK_STYLE: Record<string, { color: string; width: number; dash?: number[] }> = {
  co_occurs: { color: 'rgba(148, 163, 184, 0.16)', width: 0.7, dash: [3, 4] },
  monitors: { color: 'rgba(56, 189, 248, 0.42)', width: 1.1 },
  treats: { color: 'rgba(61, 220, 151, 0.42)', width: 1.1 },
  contradicts: { color: 'rgba(255, 92, 122, 0.65)', width: 1.4 },
  changed_from: { color: 'rgba(255, 180, 87, 0.6)', width: 1.3 },
  document_of: { color: 'rgba(148, 163, 184, 0.1)', width: 0.6 },
  class_of: { color: 'rgba(167, 139, 250, 0.4)', width: 1 },
};

/** Reader-facing edge key. Swatches use the same hues as the canvas, at a strength that stays visible on the panel. */
const EDGE_KEY: Array<{ label: string; color: string; dashed?: boolean }> = [
  { label: 'treats', color: 'rgba(61, 220, 151, 0.95)' },
  { label: 'monitors', color: 'rgba(56, 189, 248, 0.95)' },
  { label: 'contradicts', color: 'rgba(255, 92, 122, 0.95)' },
  { label: 'changed', color: 'rgba(255, 180, 87, 0.95)' },
  { label: 'same class', color: 'rgba(167, 139, 250, 0.95)' },
  { label: 'co-occurrence', color: 'rgba(186, 198, 214, 0.8)', dashed: true },
];

export function GraphCanvas(props: GraphCanvasProps) {
  const {
    nodes,
    links,
    viewport,
    hovered,
    selectedId,
    showLabels,
    showInferred,
    onHover,
    onSelect,
    onPan,
    onZoom,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  const dragState = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    if (typeof ResizeObserver === 'undefined') {
      setSize({ width: element.clientWidth, height: element.clientHeight });
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  const neighborSet = useMemo(() => {
    if (hovered === null) return null;
    const set = new Set<number>([hovered]);
    for (const link of links) {
      if (link.source === hovered) set.add(link.target);
      if (link.target === hovered) set.add(link.source);
    }
    return set;
  }, [hovered, links]);

  const selectedIndex = useMemo(
    () => (selectedId ? nodes.findIndex((n) => n.id === selectedId) : -1),
    [nodes, selectedId],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    ctx.save();
    ctx.translate(size.width / 2 + viewport.offsetX, size.height / 2 + viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);
    const s = viewport.scale;

    for (const link of links) {
      if (!showInferred && link.inferred && link.kind !== 'document_of') continue;
      const a = nodes[link.source];
      const b = nodes[link.target];
      if (!a || !b) continue;
      const dimmed =
        neighborSet !== null && !(neighborSet.has(link.source) && neighborSet.has(link.target));
      const style = LINK_STYLE[link.kind] ?? { color: 'rgba(148,163,184,0.2)', width: 0.8 };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = dimmed ? 'rgba(148,163,184,0.05)' : style.color;
      ctx.lineWidth = (dimmed ? 0.5 : style.width) / s;
      ctx.setLineDash(style.dash ? style.dash.map((d) => d / s) : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    nodes.forEach((node, index) => {
      const dimmed = neighborSet !== null && !neighborSet.has(index);
      const color = KIND_COLOR[node.kind] ?? '#94a3b8';
      const isHovered = hovered === index;
      const isSelected = selectedIndex === index;

      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 7 / s, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'rgba(61,220,151,0.16)' : 'rgba(255,255,255,0.08)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = dimmed ? 'rgba(148,163,184,0.22)' : color;
      ctx.globalAlpha = node.kind === 'person' ? 1 : 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (node.kind === 'person') {
        ctx.strokeStyle = 'rgba(61,220,151,0.7)';
        ctx.lineWidth = 2 / s;
        ctx.stroke();
      }

      const shouldLabel =
        !dimmed &&
        (isHovered || isSelected || (showLabels && (node.radius > 7 || node.kind === 'person')));
      if (shouldLabel) {
        ctx.font = `${isHovered || isSelected ? 12 : 10.5}px -apple-system, Inter, sans-serif`;
        ctx.fillStyle = isHovered || isSelected ? '#ffffff' : 'rgba(232,237,244,0.82)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = node.label.length > 34 ? `${node.label.slice(0, 32)}…` : node.label;
        ctx.fillText(label, node.x, node.y + node.radius + 4 / s);
      }
    });

    ctx.restore();
  }, [
    nodes,
    links,
    viewport,
    hovered,
    selectedId,
    size,
    neighborSet,
    selectedIndex,
    showLabels,
    showInferred,
  ]);


  const hitTest = (clientX: number, clientY: number, rect: DOMRect): number | null => {
    const px = (clientX - rect.left - rect.width / 2 - viewport.offsetX) / viewport.scale;
    const py = (clientY - rect.top - rect.height / 2 - viewport.offsetY) / viewport.scale;
    let best: number | null = null;
    let bestDist = Infinity;
    nodes.forEach((node, index) => {
      const dx = node.x - px;
      const dy = node.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.radius + 8 && dist < bestDist) {
        best = index;
        bestDist = dist;
      }
    });
    return best;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = hitTest(event.clientX, event.clientY, rect);
    if (hit !== null) {
      onSelect(hit);
      return;
    }
    onSelect(null);
    dragState.current = {
      x: event.clientX,
      y: event.clientY,
      ox: viewport.offsetX,
      oy: viewport.offsetY,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragState.current) {
      onPan(
        dragState.current.ox + (event.clientX - dragState.current.x),
        dragState.current.oy + (event.clientY - dragState.current.y),
      );
      return;
    }
    onHover(hitTest(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()));
  };

  const handlePointerUp = () => {
    dragState.current = null;
    setDragging(false);
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const next = Math.max(0.2, Math.min(2.6, viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
    onZoom(next);
  };

  return (
    <div className="graph-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        style={{ cursor: dragging ? 'grabbing' : hovered !== null ? 'pointer' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          onHover(null);
          handlePointerUp();
        }}
        onWheel={handleWheel}
      />
    </div>
  );
}

export function KindLegend({ kinds }: { kinds: string[] }) {
  return (
    <div className="graph-key">
      <div className="graph-key-block">
        <div className="graph-key-kicker">Concepts</div>
        <div className="graph-key-items">
          {kinds.map((kind) => {
            const color = KIND_COLOR[kind as keyof typeof KIND_COLOR] ?? '#94a3b8';
            return (
              <div className="graph-key-item" key={kind}>
                <span
                  className="graph-key-dot"
                  style={{ background: color, boxShadow: `0 0 0 3px ${color}33` }}
                />
                {kind}
              </div>
            );
          })}
        </div>
      </div>
      <div className="graph-key-block">
        <div className="graph-key-kicker">Relations</div>
        <div className="graph-key-items is-edges">
          {EDGE_KEY.map((edge) => (
            <div className="graph-key-item" key={edge.label}>
              <span
                className={`graph-key-line${edge.dashed ? ' is-dashed' : ''}`}
                style={{ borderTopColor: edge.color }}
              />
              {edge.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
