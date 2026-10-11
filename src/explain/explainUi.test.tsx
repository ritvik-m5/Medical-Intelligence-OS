// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ExplainChat } from '../components/builder/ExplainChat';
import { LocalBuildBackend } from '../builder/backend';
import type { BuildArtifact } from '../builder/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* The chat surface                                                    */
/*                                                                    */
/* The claim being tested is "the chatbot works", and the harder half  */
/* of that is the discipline around it: it works with no model at all, */
/* it says which of the two answered, and an unreachable model is      */
/* reported rather than swallowed.                                      */
/* ------------------------------------------------------------------ */

const backend = new LocalBuildBackend({ pace: 0 });
let artifact: BuildArtifact;

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(ExplainChat, { artifact }));
  });

  return { container, root };
}

async function settleFor(
  container: HTMLElement,
  predicate: (container: HTMLElement) => boolean,
  timeout = 4000,
): Promise<void> {
  const started = Date.now();
  while (!predicate(container)) {
    if (Date.now() - started > timeout) {
      throw new Error(`Timed out. Text was: ${(container.textContent ?? '').slice(0, 400)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
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

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  artifact = await backend.run({ prompt: 'diabetes monitoring', pace: 0 }, () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the chat surface', () => {
  it('works with no model at all, and says so', async () => {
    const { container, root } = await mount();

    expect(container.querySelector('.explain-backend')?.textContent).toBe('engine only');
    expect(container.querySelector('.explain-backend')?.className).toContain('is-grounded');

    await act(async () => root.unmount());
  });

  it('answers a question from the engine alone', async () => {
    const { container, root } = await mount();

    await click(withText(container, '.explain-question', 'Why did'));
    await settleFor(container, (node) => node.querySelector('.explain-answer') !== null);

    const answer = container.querySelector('.explain-answer')!;
    expect(answer.querySelector('.explain-para')?.textContent?.length).toBeGreaterThan(20);
    // Real sources, from the engine.
    expect(answer.querySelectorAll('.explain-source').length).toBeGreaterThan(0);
    expect(answer.textContent).toContain('wording by the engine');

    await act(async () => root.unmount());
  });

  it('offers the model as something the reader turns on, off by default', async () => {
    const { container, root } = await mount();

    const toggle = container.querySelector<HTMLInputElement>('.explain-model-toggle input');
    expect(toggle).not.toBeNull();
    expect(toggle!.checked).toBe(false);
    // Nothing to configure until it is on.
    expect(container.querySelector('.explain-model-controls')).toBeNull();

    await act(async () => root.unmount());
  });

  it('shows the endpoint controls once the model is on', async () => {
    const { container, root } = await mount();

    await click(container.querySelector('.explain-model-toggle input')!);
    await settleFor(container, (node) => node.querySelector('.explain-model-controls') !== null);

    expect(container.querySelector('.explain-backend')?.textContent).toBe('model prose');

    await click(withText(container, '.explain-model-link', 'Settings'));
    await settleFor(container, (node) => node.querySelector('.explain-model-settings') !== null);

    // The default endpoint is this app's own origin, which needs no setup.
    const endpoint = container.querySelector<HTMLInputElement>('.explain-model-settings input')!;
    expect(endpoint.value).toBe('/llm');

    await act(async () => root.unmount());
  });

  it('reports an unreachable model calmly, and still answers', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    const { container, root } = await mount();
    await click(container.querySelector('.explain-model-toggle input')!);
    await settleFor(container, (node) => node.querySelector('.explain-model-controls') !== null);

    await click(withText(container, '.explain-model-link', 'Test connection'));
    await settleFor(container, (node) => node.querySelector('.explain-model-status') !== null);

    const status = container.querySelector('.explain-model-status')!;
    expect(status.className).toContain('is-bad');
    expect(status.textContent).toContain('Could not reach');

    // And a question still gets a real answer, from the engine.
    await click(withText(container, '.explain-question', 'Summarise'));
    await settleFor(container, (node) => node.querySelector('.explain-answer') !== null);

    const answer = container.querySelector('.explain-answer')!;
    expect(answer.textContent).toContain('The language model was not used');
    expect(answer.querySelectorAll('.explain-source').length).toBeGreaterThan(0);

    await act(async () => root.unmount());
  });

  it('reports a reachable model and offers its models to pick from', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: [{ id: 'llama3.2:latest' }, { id: 'qwen2.5' }] }),
    }) as unknown as Response);

    const { container, root } = await mount();
    await click(container.querySelector('.explain-model-toggle input')!);
    await settleFor(container, (node) => node.querySelector('.explain-model-controls') !== null);

    await click(withText(container, '.explain-model-link', 'Test connection'));
    await settleFor(container, (node) => node.querySelector('.explain-model-status') !== null);

    const status = container.querySelector('.explain-model-status')!;
    expect(status.className).toContain('is-ok');
    expect(status.textContent).toContain('2 models');

    await click(withText(container, '.explain-model-link', 'Settings'));
    await settleFor(container, (node) => node.querySelector('datalist') !== null);
    expect(container.querySelectorAll('datalist option').length).toBe(2);

    await act(async () => root.unmount());
  });
});

