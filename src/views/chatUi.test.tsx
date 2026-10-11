// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatView } from './ChatView';
import { StoreProvider, useStore } from '../state/store';
import { seedSampleRecord } from '../state/seedRecord';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* The chat page                                                       */
/*                                                                    */
/* Mounted over the real store, so every number in the header and every */
/* sentence in a reply comes from a genuine derivation. The assertions  */
/* are about what makes it a product rather than a chatbot: the record  */
/* is stated up front, answers carry their sources and their limits,    */
/* and there is always something real to do next.                       */
/* ------------------------------------------------------------------ */

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const live: {
    view: string;
    setView: ((view: string) => void) | null;
    mobileNavOpen: boolean;
  } = {
    view: '',
    setView: null,
    mobileNavOpen: false,
  };

  function Probe() {
    const store = useStore();
    live.view = store.view;
    live.setView = store.setView as (view: string) => void;
    live.mobileNavOpen = store.mobileNavOpen;
    return null;
  }

  await act(async () => {
    root.render(
      createElement(StoreProvider, null, createElement(ChatView, null), createElement(Probe, null)),
    );
  });

  return { container, root, live };
}

async function settleFor(
  container: HTMLElement,
  predicate: (container: HTMLElement) => boolean,
  timeout = 6000,
): Promise<void> {
  const started = Date.now();
  while (!predicate(container)) {
    if (Date.now() - started > timeout) {
      throw new Error(`Timed out. Text was: ${(container.textContent ?? '').slice(0, 500)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function withText(container: HTMLElement, selector: string, text: string) {
  const target = Array.from(container.querySelectorAll(selector)).find((node) =>
    (node.textContent ?? '').includes(text),
  );
  if (!target) throw new Error(`No ${selector} containing "${text}"`);
  return target;
}

/** Ask a question through the composer and wait for the reply. */
async function ask(container: HTMLElement, question: string) {
  const input = container.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, question);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(container.querySelector('.chat-send')!);
  await settleFor(container, (node) => node.querySelector('.chat-reply') !== null);
}

beforeEach(() => {
  localStorage.clear();
  seedSampleRecord();
  vi.restoreAllMocks();
});

describe('the chat page', () => {
  it('shows a compact record summary in the chat toolbar', async () => {
    const { container, root } = await mount();

    const meta = container.querySelector('.chat-toolbar-meta')?.textContent ?? '';
    expect(meta).toContain('Hi, Alex');
    expect(meta).toMatch(/\d+ docs/);
    expect(meta).toMatch(/\d+ facts/);

    await act(async () => root.unmount());
  });

  it('opens with questions this record can answer', async () => {
    const { container, root } = await mount();

    expect(container.querySelectorAll('.chat-opening').length).toBeGreaterThan(2);
    expect(container.querySelector('.chat-empty-lede')?.textContent).toContain('health record');

    await act(async () => root.unmount());
  });

  it('answers with the engine prose and a receipt', async () => {
    const { container, root } = await mount();
    await ask(container, 'What changed?');

    const reply = container.querySelector('.chat-reply')!;
    expect(reply.querySelector('.chat-para')?.textContent?.length).toBeGreaterThan(20);
    expect(reply.querySelector('.chat-badge')?.textContent).toBe('Engine-derived');

    // The receipt says the engine wrote it, and carries the real identity.
    const receipt = reply.querySelector('.receipt')!;
    expect(receipt.querySelector('.receipt-flag')?.textContent).toContain('engine wrote this');
    expect(receipt.textContent).toMatch(/MM-[0-9A-F]{4}-[0-9A-F]{4}/);
    expect(receipt.textContent).toContain('Model used');

    await act(async () => root.unmount());
  });

  it('says what the answer does not establish', async () => {
    const { container, root } = await mount();
    await ask(container, 'What changed?');

    const limits = container.querySelector('.chat-not-answered');
    expect(limits).not.toBeNull();
    expect(limits?.textContent).toContain('What this does not establish');
    expect(limits?.textContent?.length).toBeGreaterThan(60);

    await act(async () => root.unmount());
  });

  it('orders answers first, actions and evidence before limitations', async () => {
    const { container, root } = await mount();
    await ask(container, 'What changed?');

    const reply = container.querySelector('.chat-reply')!;
    const order = Array.from(reply.children).map((child) =>
      child.classList.contains('chat-answer')
        ? 'answer'
        : child.classList.contains('chat-reply-meta')
          ? 'meta'
          : child.classList.contains('chat-actions')
            ? 'actions'
            : child.classList.contains('chat-sources')
              ? 'sources'
              : child.classList.contains('chat-not-answered')
                ? 'limitations'
                : child.classList.contains('receipt')
                  ? 'receipt'
                  : 'other',
    );
    expect(order.indexOf('answer')).toBeLessThan(order.indexOf('meta'));
    expect(order.indexOf('actions')).toBeLessThan(order.indexOf('limitations'));

    await act(async () => root.unmount());
  });

  it('lists the sources behind the answer', async () => {
    const { container, root } = await mount();
    await ask(container, 'What changed?');

    const sources = container.querySelectorAll('.chat-source');
    expect(sources.length).toBeGreaterThan(0);
    for (const source of Array.from(sources)) {
      expect(source.querySelector('.chat-source-kind')?.textContent?.length).toBeGreaterThan(0);
      expect(source.querySelector('.chat-source-label')?.textContent?.length).toBeGreaterThan(0);
    }

    await act(async () => root.unmount());
  });

  it('offers a real action, and takes you there', async () => {
    const { container, root, live } = await mount();
    await ask(container, 'What changed?');

    await click(withText(container, '.chat-action', 'Time Machine'));

    expect(live.view).toBe('timemachine');

    await act(async () => root.unmount());
  });

  it('offers follow-up questions that build on the answer', async () => {
    const { container, root } = await mount();
    await ask(container, 'What changed?');

    const followUps = container.querySelectorAll('.chat-followup');
    expect(followUps.length).toBeGreaterThan(0);

    // And asking one works, producing a second reply.
    await click(followUps[0]);
    await settleFor(container, (node) => node.querySelectorAll('.chat-reply').length >= 2);

    await act(async () => root.unmount());
  });

  it('enables the model by default and still answers from the engine when unreachable', async () => {
    const { container, root } = await mount();

    expect(container.textContent).toContain('Medical Memory AI');
    expect(container.querySelector('.chat-dock')).not.toBeNull();

    await ask(container, 'Hi');
    const reply = container.querySelector('.chat-reply')!;
    expect(reply.textContent).toContain('Medical Memory');
    expect(reply.textContent).not.toContain('not answered');

    await act(async () => root.unmount());
  });

  it('opens navigation from the chat toolbar menu button', async () => {
    const { container, root, live } = await mount();

    expect(live.mobileNavOpen).toBe(false);
    await click(container.querySelector('.chat-toolbar .nav-toggle')!);
    expect(live.mobileNavOpen).toBe(true);

    await act(async () => root.unmount());
  });
});

