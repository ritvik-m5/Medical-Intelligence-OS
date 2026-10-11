// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import App from './App';
import { seedSampleRecord } from './state/seedRecord';

// Tell React this is a test environment so act() is honoured and the warning goes away.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Full DOM mount test.
 *
 * This runs the real component tree with effects enabled, so it exercises the
 * things a server render cannot: the canvas layout, the resize observers, the
 * Time Machine slider, the evidence drawer and every view switch. It is the
 * closest thing to opening the app without a browser.
 *
 * The workspace no longer ships with a built-in record: it opens on an empty
 * landing and unlocks once documents are imported. Tests seed the sample corpus
 * into the browser's persisted record first, so the store restores a real record
 * on mount exactly as it would for a returning reader. The builder itself is
 * covered by `src/builder/builderUi.test.tsx`.
 */
async function mountApp(options: { seed?: boolean } = {}) {
  const { seed = true } = options;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  if (seed) {
    seedSampleRecord();
  }

  await act(async () => {
    root.render(createElement(App));
  });

  return { container, root };
}

function buttonWith(container: HTMLElement, text: string) {
  const target = Array.from(container.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').includes(text),
  );
  if (!target) throw new Error(`No button containing "${text}"`);
  return target;
}

/**
 * Wait until a condition holds, letting React and any lazy import settle.
 *
 * The workspace views are code-split, so a click switches the view synchronously
 * but the component arrives a tick later. Polling inside `act` is the honest way
 * to wait for that without reaching into React internals.
 */
async function settle(
  container: HTMLElement,
  predicate: (container: HTMLElement) => boolean,
  label = 'the view',
): Promise<void> {
  const started = Date.now();
  while (!predicate(container)) {
    if (Date.now() - started > 3000) throw new Error(`Timed out waiting for ${label}.`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

/** Click a sidebar entry and wait for the lazily-loaded view to arrive. */
async function openView(container: HTMLElement, label: string): Promise<void> {
  const button = buttonWith(container, label);
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle(container, (node) => node.querySelector('.view-loading') === null, label);
}

/** How much text the view itself rendered, excluding the surrounding chrome. */
function viewText(container: HTMLElement): number {
  return (container.querySelector('.view')?.textContent ?? '').trim().length;
}

describe('application mount', () => {
  it('opens on the empty Home landing when no record exists', async () => {
    localStorage.clear();
    const { container, root } = await mountApp({ seed: false });

    // The Home view is code-split; wait for it to arrive.
    await settle(container, (node) => node.querySelector('.starthere-drop') !== null, 'home');

    // No record: the Home view shows the drop zone, the workspace chrome is
    // present, and the record-dependent tabs are locked until files are dropped.
    expect(container.textContent).toContain('Start here');
    expect(container.querySelector('.sidebar')).not.toBeNull();
    expect(container.querySelector('.nav-item.is-locked')).not.toBeNull();

    await act(async () => root.unmount());
  }, 20000);

  it('opens into the workspace once a record exists', async () => {
    const { container, root } = await mountApp();
    expect(container.textContent).toContain('Medical Memory');
    // The workspace chrome is present, and the sidebar records the record.
    expect(container.querySelector('.sidebar')).not.toBeNull();
    expect(container.textContent).toContain('Your record');
    // The workspace lands on Home, so wait for its areas to arrive (the view
    // is code-split) and confirm all four doorways.
    await settle(container, (node) => node.querySelectorAll('.home-area').length === 4, 'home');
    expect(container.querySelectorAll('.home-area').length).toBe(4);
    await act(async () => root.unmount());
  }, 30000);

  it('opens every view and renders its own content', async () => {
    const { container, root } = await mountApp();
    const views = [
      'Home',
      'What is this',
      'Reset',
      'Time Machine',
      'Intervals',
      'Health Graph',
      'Records',
      'Measurements',
      'Debugger',
      'Inference',
      'Ask',
      'Research Mode',
      'Record Quality',
      'Cohort',
      'Interop & Sharing',
      'Overview',
    ];
    for (const view of views) {
      await openView(container, view);
      // The fallback is about twelve characters, so this only passes when the
      // view component itself has actually rendered.
      expect(viewText(container), `${view} rendered nothing`).toBeGreaterThan(200);
    }
    await act(async () => root.unmount());
  }, 60000);

  it('shows the State of the Record as the Overview landing page', async () => {
    const { container, root } = await mountApp();
    await openView(container, 'Overview');

    // The five sections, in the journey order the product is built around.
    const order = container.textContent;
    for (const heading of ['Established', 'Changed', 'Conflicted', 'Uncertain', 'Open questions']) {
      expect(order, `missing section ${heading}`).toContain(heading);
    }
    // The record questions carry a status the reader can advance.
    expect(container.querySelectorAll('.sor-question').length).toBeGreaterThan(0);
    // And a receipt, generated from the artifact rather than written by hand.
    expect(container.querySelector('.receipt')).not.toBeNull();

    await act(async () => root.unmount());
  }, 30000);

  it('toggles the navigation on small screens and closes it on navigation', async () => {
    const { container, root } = await mountApp();

    const toggle = container.querySelector('.nav-toggle');
    expect(toggle).not.toBeNull();

    // Closed by default.
    expect(container.querySelector('.shell.nav-open')).toBeNull();

    // Open it.
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.shell.nav-open')).not.toBeNull();
    expect(container.querySelector('.sidebar.is-open')).not.toBeNull();

    // Choosing a view closes it again.
    const records = buttonWith(container, 'Records');
    await act(async () => {
      records.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.shell.nav-open')).toBeNull();

    // The backdrop also closes it.
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.shell.nav-open')).not.toBeNull();
    const backdrop = container.querySelector('.nav-backdrop');
    await act(async () => {
      backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.shell.nav-open')).toBeNull();

    await act(async () => root.unmount());
  }, 30000);

  it('shows the live engine status in the workspace and opens the inspector', async () => {
    const { container, root } = await mountApp();

    const pill = container.querySelector('.engine-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain('Live engine');
    expect(container.querySelector('.engine-pill.is-verified')).not.toBeNull();

    await act(async () => {
      pill!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Engine artifact');
    // The workspace inspector verifies the workspace graph, which includes the
    // contradictions the Debugger shows.
    expect(container.querySelectorAll('.inspector-check').length).toBe(6);
    expect(container.querySelectorAll('.inspector-check.is-bad').length).toBe(0);

    await act(async () => root.unmount());
  }, 30000);

  it('opens a proof from the inspector, in the view that shows it', async () => {
    const { container, root } = await mountApp();

    await act(async () => {
      container
        .querySelector('.engine-pill')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // The derivations are clickable rows with a severity class; the documents are
    // clickable too now, so target a derivation specifically.
    const derivation = container.querySelector<HTMLButtonElement>(
      '.inspector-row.is-high, .inspector-row.is-medium, .inspector-row.is-low',
    );
    expect(derivation).not.toBeNull();
    await act(async () => {
      derivation!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // The inspector closes, the Inference view loads, and the proof renders.
    expect(container.textContent).not.toContain('Engine artifact');
    await settle(container, (node) => node.querySelector('.view-loading') === null, 'Inference');
    expect(container.querySelector('.topbar-title h1')?.textContent).toBe('Inference Board');
    expect(container.querySelector('.proof-canvas')).not.toBeNull();
    expect(container.querySelectorAll('.proof-node-label').length).toBeGreaterThan(1);

    await act(async () => root.unmount());
  }, 30000);

  it('saves imported documents and restores them on the next visit', async () => {
    const first = await mountApp();
    await openView(first.container, 'Records');

    const titleInput = first.container.querySelector<HTMLInputElement>(
      '.intake-form input',
    )!;
    const textArea = first.container.querySelector<HTMLTextAreaElement>(
      '.intake-form textarea, textarea',
    )!;
    const setInput = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    const setArea = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;

    await act(async () => {
      setInput?.call(titleInput, 'Outside lipid panel');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      setArea?.call(
        textArea,
        'Cholesterol: 5.4 mmol/L (reference range 0-5.0)\nHDL: 1.1 mmol/L',
      );
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      buttonWith(first.container, 'Extract and add to the graph').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    // The corpus is written to local storage, not the graph.
    const saved = localStorage.getItem('medical-memory.record.v1');
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved!);
    expect(parsed.version).toBe(1);
    const imported = parsed.documents.find((doc: { title: string }) => doc.title === 'Outside lipid panel');
    expect(imported).toBeTruthy();
    expect(imported.text).toContain('Cholesterol: 5.4');
    // Nothing derived was stored.
    expect(JSON.stringify(parsed)).not.toContain('derivations');

    await act(async () => first.root.unmount());

    // A fresh mount restores it (without re-seeding), and the graph is re-derived.
    const second = await mountApp({ seed: false });
    await openView(second.container, 'Records');
    expect(second.container.textContent).toContain('Outside lipid panel');

    await act(async () => second.root.unmount());
    localStorage.clear();
  }, 40000);

  it('forgets a saved record on request', async () => {
    const { container, root } = await mountApp();
    await openView(container, 'Records');

    const titleInput = container.querySelector<HTMLInputElement>('.intake-form input')!;
    const textArea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const setArea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

    await act(async () => {
      setInput?.call(titleInput, 'Temporary');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      setArea?.call(textArea, 'Cholesterol: 5.4 mmol/L');
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonWith(container, 'Extract and add to the graph').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(localStorage.getItem('medical-memory.record.v1')).toBeTruthy();

    await act(async () => {
      buttonWith(container, 'Forget the saved record').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(localStorage.getItem('medical-memory.record.v1')).toBeNull();

    await act(async () => root.unmount());
    localStorage.clear();
  }, 40000);

  it('filters and exports the audit log', async () => {
    const { container, root } = await mountApp();
    await openView(container, 'Record Quality');

    // Every view opened so far appended a 'view' entry, so the log is populated.
    const controls = container.querySelector('.audit-controls');
    expect(controls).not.toBeNull();
    expect(container.textContent).toContain('Export JSON');

    const viewChip = Array.from(controls!.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').startsWith('view'),
    );
    expect(viewChip).toBeDefined();
    await act(async () => {
      viewChip!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // After filtering, every visible row is of that kind.
    const chips = Array.from(container.querySelectorAll('tbody tr td:nth-child(2)')).map(
      (cell) => cell.textContent,
    );
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((kind) => kind === 'view')).toBe(true);

    await act(async () => root.unmount());
  }, 30000);

  it('shows every concept with its codes, or says it has none', async () => {
    const { container, root } = await mountApp();
    await openView(container, 'Interop & Sharing');

    expect(container.textContent).toContain('Concept coding');
    const rows = container.querySelectorAll('.code-row');
    expect(rows.length).toBeGreaterThan(5);
    // At least one concept carries a real code.
    expect(container.querySelectorAll('.code-chip').length).toBeGreaterThan(0);
    // And uncoded concepts are stated rather than silently dropped.
    expect(container.querySelectorAll('.code-row.is-uncoded').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('exported as text');

    await act(async () => root.unmount());
  }, 30000);

  it('reaches the builder from the workspace', async () => {
    const { container, root } = await mountApp();

    // The builder is no longer the front door; it is reached from the workspace.
    await act(async () => {
      buttonWith(container, 'Builder').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.composer-input')).not.toBeNull();
    expect(container.textContent).toContain('Build anything');

    await act(async () => root.unmount());
  }, 30000);

  it('runs a question through the query engine from the UI', async () => {
    const { container, root } = await mountApp();
    await openView(container, 'Ask');

    const suggestion = Array.from(container.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('cholesterol'),
    );
    expect(suggestion).toBeDefined();
    await act(async () => {
      suggestion!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('How this was answered');
    expect(container.textContent).toContain('Sources');
    await act(async () => root.unmount());
  }, 30000);

  it('moves the time machine and re-renders the state', async () => {
    const { container, root } = await mountApp();
    const slider = container.querySelector<HTMLInputElement>('.scrubber-input');
    expect(slider).not.toBeNull();

    // React tracks the value on the node, so the native setter must be used for
    // the change to be observed — the same trick React Testing Library uses.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeSetter?.call(slider, '0');
      slider!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('.scrubber-date')?.textContent).toMatch(/Mar 14, 2022/);

    await act(async () => {
      nativeSetter?.call(slider, slider!.max);
      slider!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('.scrubber-date')?.textContent).toMatch(/Sep 15, 2026/);

    await act(async () => root.unmount());
  });

  it('renders a proof graph when a derivation is opened', async () => {
    const { container, root } = await mountApp();
    const inferenceButton = buttonWith(container, 'Inference');
    await act(async () => {
      inferenceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const card = container.querySelector<HTMLElement>('.conflict-card');
    expect(card).not.toBeNull();
    await act(async () => {
      card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // The proof view must render actual nodes and edges, not just a summary.
    expect(container.querySelector('.proof-canvas')).not.toBeNull();
    expect(container.querySelectorAll('.proof-node').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('.proof-edges path').length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain('Not concluded');
    expect(container.textContent).toContain('What would clear this');

    await act(async () => root.unmount());
  }, 20000);

  it('shows the rule registry including rules that produced nothing', async () => {
    const { container, root } = await mountApp();
    const inferenceButton = buttonWith(container, 'Inference');
    await act(async () => {
      inferenceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Rule registry');
    expect(container.textContent).toContain('temporal.list_contradicts_course');
    expect(container.textContent).toContain('gap.documentation_silence');
    await act(async () => root.unmount());
  }, 20000);

  it('opens the command palette and jumps to a view', async () => {
    const { container, root } = await mountApp();
    const paletteToggle = buttonWith(container, 'Ask the record');
    await act(async () => {
      paletteToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // The palette is keyboard-driven; dispatch the shortcut on the window.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    });
    const palette = container.querySelector('.palette');
    expect(palette).not.toBeNull();
    expect(palette?.textContent).toContain('Go to');
    await act(async () => root.unmount());
  }, 20000);
});
