// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { HomeView } from './HomeView';
import { WhatIsThisView } from './WhatIsThisView';
import { ResetView } from './ResetView';
import { StoreProvider, useStore, type ExplainDepth } from '../state/store';
import { seedSampleRecord } from '../state/seedRecord';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
  seedSampleRecord();
});

async function mount(view: () => ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const live: { explainDepth: ExplainDepth } = { explainDepth: 'plain' };

  function Probe() {
    const store = useStore();
    live.explainDepth = store.explainDepth;
    return null;
  }

  await act(async () => {
    root.render(
      createElement(StoreProvider, null, createElement(view, null), createElement(Probe, null)),
    );
  });

  return { container, root, live };
}

describe('Home', () => {
  it('greets the patient and offers four doorways', async () => {
    const { container, root } = await mount(HomeView);

    expect(container.textContent).toContain('Hi, Alex');
    expect(container.querySelectorAll('.home-area').length).toBe(4);
    expect(container.textContent).toContain('Ask Medical Memory');
    expect(container.textContent).toContain('Recent changes');
    expect(container.textContent).toContain('Open questions');
    expect(container.textContent).toContain('Your record');

    await act(async () => root.unmount());
  });

  it('shows recent changes and open questions from the record', async () => {
    const { container, root } = await mount(HomeView);

    // The synthetic record has both documented changes and open questions.
    expect(container.querySelectorAll('.home-item').length).toBeGreaterThan(0);

    await act(async () => root.unmount());
  });
});

describe('What is this', () => {
  it('offers three explanation depths and renders five sections', async () => {
    const { container, root } = await mount(WhatIsThisView);

    expect(container.querySelectorAll('.depth-option').length).toBe(3);
    expect(container.querySelectorAll('.whatis-section').length).toBe(5);

    await act(async () => root.unmount());
  });

  it('changes the words when the depth changes, without changing the engine', async () => {
    const { container, root, live } = await mount(WhatIsThisView);

    // Default is plain English.
    expect(container.textContent).toContain('fragmented');

    // Switch to "Explain like I'm 10" — the same claim, simpler words.
    const simple = Array.from(container.querySelectorAll('.depth-option')).find((b) =>
      b.textContent?.includes('10'),
    );
    await act(async () => {
      simple!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(live.explainDepth).toBe('simple');
    expect(container.textContent).toContain('careful librarian');
    expect(container.textContent).not.toContain('fragmented');

    // Switch to technical — provenance and rules come to the front.
    const technical = Array.from(container.querySelectorAll('.depth-option')).find((b) =>
      b.textContent?.includes('Technical'),
    );
    await act(async () => {
      technical!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(live.explainDepth).toBe('technical');
    expect(container.textContent).toContain('deterministic rules');

    await act(async () => root.unmount());
  });
});

describe('Reset', () => {
  it('lists every destructive action with an explicit confirmation step', async () => {
    const { container, root } = await mount(ResetView);

    expect(container.querySelectorAll('.reset-card').length).toBe(4);
    expect(container.textContent).toContain('Clear the imported record');
    expect(container.textContent).toContain('Delete the saved record');
    expect(container.textContent).toContain('Clear the conversation');
    expect(container.textContent).toContain('Clear the audit log');

    await act(async () => root.unmount());
  });

  it('does not run an action until it is confirmed', async () => {
    const { container, root } = await mount(ResetView);

    // The first destructive action is a two-step control.
    const first = container.querySelector('.reset-card')!;
    expect(first.textContent).not.toContain('Cancel');

    const trigger = first.querySelector('button')!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Now it asks for confirmation before doing anything.
    expect(first.textContent).toContain('Cancel');

    await act(async () => root.unmount());
  });
});
