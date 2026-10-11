// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { HowItWorksView } from './HowItWorksView';
import { StoreProvider, useStore } from '../state/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* The guide                                                           */
/*                                                                    */
/* The page exists to be understood, so the tests assert the things     */
/* that make it understandable: every tab is listed, every card says    */
/* the same three things, the language stays plain, and there is a way  */
/* home. A guide that quietly omits a tab is worse than no guide.       */
/* ------------------------------------------------------------------ */

/** Mount the guide inside the real store, so navigation actually works. */
async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  /*
   * Read the live view rather than counting renders.
   *
   * React skips a re-render when state is unchanged, so a probe that pushed the
   * view on every render would see nothing when the target view is already
   * current. Reading the store's value is what actually tests navigation.
   */
  const live: { view: string; setView: ((view: string) => void) | null } = {
    view: '',
    setView: null,
  };

  function Probe() {
    const store = useStore();
    live.view = store.view;
    live.setView = store.setView as (view: string) => void;
    return null;
  }

  await act(async () => {
    root.render(
      createElement(
        StoreProvider,
        null,
        createElement(HowItWorksView, null),
        createElement(Probe, null),
      ),
    );
  });

  return { container, root, live };
}

async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function buttonWith(container: HTMLElement, selector: string, text: string) {
  const target = Array.from(container.querySelectorAll(selector)).find((node) =>
    (node.textContent ?? '').includes(text),
  );
  if (!target) throw new Error(`No ${selector} containing "${text}"`);
  return target;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the how-it-works page', () => {
  it('opens with the one idea, stated plainly', async () => {
    const { container, root } = await mount();

    expect(container.querySelector('.guide-title')?.textContent).toContain(
      'Every conclusion comes with a receipt',
    );
    // The worked example is the shape the whole page rests on.
    const example = container.querySelector('.guide-example');
    expect(example?.querySelector('.guide-example-finding')?.textContent).toContain('Finding:');
    expect(example?.querySelector('.guide-example-source')?.textContent).toContain(
      'Where it came from',
    );

    await act(async () => root.unmount());
  });

  it('explains every tab in the application', async () => {
    const { container, root } = await mount();

    const cards = Array.from(container.querySelectorAll('.guide-card')).map(
      (node) => node.querySelector('.guide-card-name')?.textContent ?? '',
    );

    for (const name of [
      'Home',
      'What is this',
      'Reset',
      'Builder',
      'Chat',
      'Overview',
      'Time Machine',
      'Intervals',
      'Health Graph',
      'Records',
      'Measurements',
      'Debugger',
      'Inference',
      'Ask',
      'Research Mode',
      'Research Lab',
      'Record Quality',
      'Cohort',
      'Interop & Sharing',
    ]) {
      expect(cards).toContain(name);
    }

    expect(cards).toHaveLength(19);

    await act(async () => root.unmount());
  });

  it('says the same three things about every tab', async () => {
    const { container, root } = await mount();

    for (const card of Array.from(container.querySelectorAll('.guide-card'))) {
      const keys = Array.from(card.querySelectorAll('.guide-card-key')).map(
        (node) => node.textContent,
      );
      expect(keys).toEqual(['What it is', 'When to use it', 'What you will see']);
    }

    await act(async () => root.unmount());
  });

  it('stays in plain language', async () => {
    const { container, root } = await mount();

    /*
     * The brief was "simple enough for a tenth grader". Jargon is what breaks
     * that, so the check is for jargon rather than for a reading score — a word
     * list is testable and a reading score is not.
     *
     * The glossary is exempt, and that is the point of it: the prose avoids these
     * words, and the one place they appear is where they are explained.
     */
    const prose = container.querySelector('.guide')!.cloneNode(true) as HTMLElement;
    prose.querySelector('.guide-words')?.remove();
    const text = (prose.textContent ?? '').toLowerCase();

    for (const jargon of ['derivation', 'entity', 'provenance', 'deterministic', 'idempotent']) {
      expect(text).not.toContain(jargon);
    }

    // And the words that are explained really are explained.
    const glossary = container.querySelector('.guide-words')!;
    expect(glossary.textContent).toContain('Words you will see');
    expect(glossary.querySelectorAll('.guide-word').length).toBeGreaterThanOrEqual(9);
    for (const word of ['derivation', 'artifact', 'counterfactual']) {
      expect(glossary.textContent?.toLowerCase()).toContain(word);
    }

    await act(async () => root.unmount());
  });

  it('states what the system will never do', async () => {
    const { container, root } = await mount();

    const limits = Array.from(container.querySelectorAll('.guide-never-list li')).map(
      (node) => node.textContent ?? '',
    );
    expect(limits.length).toBe(6);
    expect(limits.join(' ')).toContain('never tells you what to do');
    expect(limits.join(' ')).toContain('never diagnoses');
    expect(limits.join(' ')).toContain('never makes things up');

    await act(async () => root.unmount());
  });

  it('has a way back to the home page', async () => {
    const { container, root } = await mount();

    const homes = container.querySelectorAll('.guide-home');
    expect(homes.length).toBe(1);
    expect(homes[0].textContent).toContain('Back to the home page');

    await act(async () => root.unmount());
  });

  it('actually goes home when the button is pressed', async () => {
    const { container, root, live } = await mount();

    // Start somewhere else, so going home is a real change of view.
    await act(async () => live.setView?.('lab'));
    expect(live.view).toBe('lab');

    await click(container.querySelector('.guide-home')!);

    expect(live.view).toBe('builder');

    await act(async () => root.unmount());
  });

  it('navigates to a tab when its card is pressed', async () => {
    const { container, root, live } = await mount();

    await click(buttonWith(container, '.guide-card', 'Time Machine'));

    expect(live.view).toBe('timemachine');

    await act(async () => root.unmount());
  });

  it('groups the tabs the way the sidebar does', async () => {
    const { container, root } = await mount();

    const groups = Array.from(container.querySelectorAll('.guide-group-title')).map(
      (node) => node.textContent,
    );
    expect(groups).toEqual([
      'Start here',
      'Look at the record',
      'Understand the thinking',
      'The platform',
    ]);

    await act(async () => root.unmount());
  });
});

