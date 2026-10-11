// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { StoreProvider, useStore } from '../state/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* The sidebar's numbers must be accurate. The "Open questions" card     */
/* once showed the high-severity finding count under a questions label;  */
/* this locks in the fix so it cannot silently drift again.              */
/* ------------------------------------------------------------------ */

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const live: { openQuestions: number; highSeverity: number } = {
    openQuestions: 0,
    highSeverity: 0,
  };

  function Probe() {
    const store = useStore();
    live.openQuestions = store.questions.filter((q) => q.status !== 'dismissed').length;
    live.highSeverity = store.derivations.filter((d) => d.severity === 'high').length;
    return null;
  }

  await act(async () => {
    root.render(
      createElement(StoreProvider, null, createElement(Sidebar, null), createElement(Probe, null)),
    );
  });

  return { container, root, live };
}

describe('the sidebar', () => {
  it('labels "Open questions" with the real open-question count, not severity', async () => {
    const { container, root, live } = await mount();

    const card = Array.from(container.querySelectorAll('.side-card')).find((node) =>
      node.textContent?.includes('Open questions'),
    );
    expect(card).toBeTruthy();

    const value = Number(card!.querySelector('.metric-value')?.textContent);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBe(live.openQuestions);

    await act(async () => root.unmount());
  });
});
