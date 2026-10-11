import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphNode } from './graphLayout';

export interface CanvasViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Pan, zoom and hit-testing for the graph canvas. */
export function useGraphInteraction(nodes: GraphNode[]) {
  const [viewport, setViewport] = useState<CanvasViewport>({ scale: 0.58, offsetX: 0, offsetY: 0 });
  const [hovered, setHovered] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const toCanvas = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => ({
      x: (clientX - rect.left - rect.width / 2 - viewport.offsetX) / viewport.scale,
      y: (clientY - rect.top - rect.height / 2 - viewport.offsetY) / viewport.scale,
    }),
    [viewport],
  );

  const pick = useCallback(
    (clientX: number, clientY: number, rect: DOMRect): number | null => {
      const point = toCanvas(clientX, clientY, rect);
      let best: number | null = null;
      let bestDist = Infinity;
      nodes.forEach((node, index) => {
        const dx = node.x - point.x;
        const dy = node.y - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < node.radius + 8 && dist < bestDist) {
          best = index;
          bestDist = dist;
        }
      });
      return best;
    },
    [nodes, toCanvas],
  );

  return { viewport, setViewport, hovered, setHovered, drag, pick };
}

/** Observe an element's size so the canvas can size itself. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
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
  return { ref, size };
}
