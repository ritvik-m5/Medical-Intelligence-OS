// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatView } from './ChatView';
import { StoreProvider, useStore } from '../state/store';
import { contextForFinding } from '../ai/context';
import type { AIContext } from '../ai/context';
import { seedSampleRecord } from '../state/seedRecord';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* The contextual AI handoff                                           */
/*                                                                    */
/* The regression that caused this work: a view must hand the AI a      */
/* structured object, never raw rule prose. The composer shows a chip    */
/* naming the object, and "what does this mean" resolves to it.          */
/* ------------------------------------------------------------------ */

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const live: {
    askAbout: ((c: AIContext) => void) | null;
    aiContext: AIContext | null;
    finding: AIContext | null;
  } = { askAbout: null, aiContext: null, finding: null };

  function Probe() {
    const store = useStore();
    live.askAbout = store.askAbout;
    live.aiContext = store.aiContext;
    if (!live.finding && store.derivations.length > 0) {
      live.finding = contextForFinding(
        store.engine.identity.artifactId,
        store.asOf,
        store.derivations[0],
      );
    }
    return null;
  }

  await act(async () => {
    root.render(
      createElement(StoreProvider, null, createElement(ChatView, null), createElement(Probe, null)),
    );
  });

  return { container, root, live };
}

async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function settleFor(container: HTMLElement, predicate: (n: HTMLElement) => boolean) {
  const started = Date.now();
  while (!predicate(container)) {
    if (Date.now() - started > 6000) throw new Error('Timed out waiting for chat to settle.');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

beforeEach(() => {
  localStorage.clear();
  seedSampleRecord();
  vi.restoreAllMocks();
});

describe('the contextual AI handoff', () => {
  it('shows the object as a chip, never as pasted rule prose', async () => {
    const { container, root, live } = await mount();
    const finding = live.finding!;
    expect(finding).toBeTruthy();

    await act(async () => {
      live.askAbout!(finding);
    });

    await settleFor(container, (n) => n.querySelector('.chat-dock-context-chip') !== null);

    const chip = container.querySelector('.chat-dock-context-chip')!;
    expect(chip.textContent).toContain(finding.title);
    expect(chip.textContent).toContain('Finding');
    // The raw UI prose must not leak into the context.
    expect(chip.textContent).not.toContain('Rule applied');

    await act(async () => root.unmount());
  });

  it('resolves "what does this mean" to the focused finding', async () => {
    const { container, root, live } = await mount();
    const finding = live.finding!;

    await act(async () => {
      live.askAbout!(finding);
    });
    await settleFor(container, (n) => n.querySelector('.chat-dock-context-chip') !== null);

    const input = container.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(input, 'what does this mean');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(container.querySelector('.chat-send')!);
    await settleFor(container, (n) => n.querySelector('.chat-reply') !== null);

    // The reply names the finding, not the pasted prose.
    expect(container.textContent).toContain(finding.title);

    await act(async () => root.unmount());
  });

  it('offers finding-specific questions when arriving from a finding', async () => {
    const { container, root, live } = await mount();

    await act(async () => {
      live.askAbout!(live.finding!);
    });
    await settleFor(container, (n) => n.querySelector('.chat-dock-context-chip') !== null);

    expect(container.textContent).toContain('Explain this');
    expect(container.textContent).toContain('Show the evidence');

    await act(async () => root.unmount());
  });

  it('removes the context when asked', async () => {
    const { container, root, live } = await mount();

    await act(async () => {
      live.askAbout!(live.finding!);
    });
    await settleFor(container, (n) => n.querySelector('.chat-dock-context-chip') !== null);
    expect(container.querySelector('.chat-dock-context-chip')).not.toBeNull();

    await click(container.querySelector('.chat-dock-context-clear')!);
    await settleFor(container, (n) => n.querySelector('.chat-dock-context-chip') === null);
    expect(container.querySelector('.chat-dock-context-chip')).toBeNull();

    await act(async () => root.unmount());
  });
});
