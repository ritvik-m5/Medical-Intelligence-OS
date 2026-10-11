// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BuilderView } from '../views/BuilderView';
import { StoreProvider } from '../state/store';
import { RunRegistry } from '../engine/platform/registry';
import { LocalStorageBackend } from '../engine/platform/persistence';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Registry and branch UI tests.
 *
 * These mount the real builder, which builds the real default record on mount,
 * and then exercise the registry and branch surfaces against it. The identities
 * asserted on are computed by the engine, so nothing here would pass against a
 * stub.
 */

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        StoreProvider,
        null,
        createElement(BuilderView, { onEnterWorkspace: vi.fn() }),
      ),
    );
  });

  return { container, root };
}

async function settleFor(
  container: HTMLElement,
  predicate: (container: HTMLElement) => boolean,
  timeout = 5000,
): Promise<void> {
  const started = Date.now();
  while (!predicate(container)) {
    if (Date.now() - started > timeout) {
      throw new Error(`Timed out. Text was: ${(container.textContent ?? '').slice(0, 400)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

function buttonWith(container: HTMLElement, text: string, selector = 'button') {
  const target = Array.from(container.querySelectorAll(selector)).find((node) =>
    (node.textContent ?? '').includes(text),
  );
  if (!target) throw new Error(`No element containing "${text}"`);
  return target;
}

async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** The registry section only appears once the lazy chunk arrives. */
async function settleRuns(container: HTMLElement) {
  await settleFor(container, (node) => node.querySelector('.runs') !== null);
  await settleFor(container, (node) => node.querySelector('.branch') !== null);
  // Both panels need an artifact, and the build on mount is asynchronous.
  await settleFor(container, (node) => node.querySelector('.branch-parent') !== null);
}

beforeEach(() => {
  localStorage.clear();
});

describe('the run registry, in the interface', () => {
  it('opens empty, and says so rather than showing nothing', async () => {
    const { container, root } = await mount();
    await settleRuns(container);

    expect(container.querySelector('.runs')?.textContent).toContain('Nothing saved yet');
    expect(container.querySelectorAll('.runs-item').length).toBe(0);

    await act(async () => root.unmount());
  });

  it('saves the current run under the identity the engine computed', async () => {
    const { container, root } = await mount();
    await settleRuns(container);

    await click(buttonWith(container, 'Save run'));

    const items = container.querySelectorAll('.runs-item');
    expect(items.length).toBe(1);

    const id = container.querySelector('.runs-item-id')?.textContent ?? '';
    expect(id).toMatch(/^MM-[0-9A-F]{4}-[0-9A-F]{4}$/);

    // The identity in the list is the one in storage, not a label invented here.
    const stored = new RunRegistry(new LocalStorageBackend()).load().runs;
    expect(stored).toHaveLength(1);
    expect(stored[0].identity.id).toBe(id);

    await act(async () => root.unmount());
  });

  it('records the corpus, the engine and the rule set it was saved with', async () => {
    const { container, root } = await mount();
    await settleRuns(container);
    await click(buttonWith(container, 'Save run'));

    const run = new RunRegistry(new LocalStorageBackend()).load().runs[0];
    expect(run.documents.length).toBeGreaterThan(0);
    expect(run.identity.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(run.identity.ruleCount).toBeGreaterThan(0);
    expect(run.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(run.findings.length).toBeGreaterThan(0);
    expect(run.verification.clean).toBe(true);

    await act(async () => root.unmount());
  });

  it('opens a saved run, re-derives it, and reports that it reproduces', async () => {
    const { container, root } = await mount();
    await settleRuns(container);
    await click(buttonWith(container, 'Save run'));

    await click(buttonWith(container, 'Open', '.runs-action'));
    await settleFor(container, (node) => node.querySelector('.runs-verdict') !== null);

    const verdict = container.querySelector('.runs-verdict');
    expect(verdict?.className).toContain('is-ok');
    expect(verdict?.textContent).toContain('Reproduces exactly');

    await act(async () => root.unmount());
  });

  it('deletes a run and returns to the empty state', async () => {
    const { container, root } = await mount();
    await settleRuns(container);
    await click(buttonWith(container, 'Save run'));
    expect(container.querySelectorAll('.runs-item').length).toBe(1);

    const del = container.querySelector('[aria-label^="Delete"]');
    if (!del) throw new Error('No delete button');
    await click(del);

    expect(container.querySelectorAll('.runs-item').length).toBe(0);
    expect(new RunRegistry(new LocalStorageBackend()).load().runs).toHaveLength(0);

    await act(async () => root.unmount());
  });
});

describe('research branches, in the interface', () => {
  it('offers exactly the experiments the build can run', async () => {
    const { container, root } = await mount();
    await settleRuns(container);

    const labels = Array.from(container.querySelectorAll('.branch-option-label')).map(
      (node) => node.textContent,
    );
    expect(labels).toEqual([
      'Withhold a rule',
      'Evaluate at an earlier date',
      'Add a document',
    ]);

    await act(async () => root.unmount());
  });

  it('names the parent it is branching from', async () => {
    const { container, root } = await mount();
    await settleRuns(container);

    const parent = container.querySelector('.branch-parent')?.textContent ?? '';
    expect(parent).toMatch(/branching MM-[0-9A-F]{4}-[0-9A-F]{4}/);

    await act(async () => root.unmount());
  });

  it('withholds a rule, and the branch is a different run with one fewer rule', async () => {
    const { container, root } = await mount();
    await settleRuns(container);

    const parentId = (container.querySelector('.branch-parent code')?.textContent ?? '').trim();
    const parentRules = Number(
      (container.querySelector('.branch-parent')?.textContent ?? '').match(/(\d+) rules/)?.[1],
    );

    await click(buttonWith(container, 'Withhold a rule', '.branch-option-btn'));
    await settleFor(container, (node) => node.querySelectorAll('.branch-rule').length > 0);

    const ruleId = (
      container.querySelector('.branch-rule code')?.textContent ?? ''
    ).trim();
    expect(ruleId.length).toBeGreaterThan(0);

    await click(buttonWith(container, ruleId, '.branch-rule'));
    await click(buttonWith(container, 'Run the branch', '.branch-run'));

    // The build is paced, so wait for the lineage note that only a branch produces.
    await settleFor(container, (node) =>
      (node.textContent ?? '').includes('recorded as a branch of'),
    );

    const note = container.querySelector('.explain-section-note')?.textContent ?? '';
    expect(note).toContain(`withheld ${ruleId}`);
    // The note names the parent by a readable prefix of its content address.
    const namedParent = container.querySelector('.explain-section-note code');
    const fullParentId = namedParent?.getAttribute('title') ?? '';
    expect(fullParentId).toMatch(/^[0-9a-f]{64}$/);
    expect(note).toContain(fullParentId.slice(0, 12));

    // The branch is a real artifact with its own identity and one rule fewer.
    await click(buttonWith(container, 'Save run'));
    const runs = new RunRegistry(new LocalStorageBackend()).load().runs;
    expect(runs).toHaveLength(1);
    expect(runs[0].identity.id).not.toBe(parentId);
    expect(runs[0].identity.ruleCount).toBe(parentRules - 1);
    expect(runs[0].suppressedRules).toEqual([ruleId]);
    // Lineage is recorded by content address, so it survives being reloaded.
    expect(runs[0].branch.parentId).toBe(fullParentId);
    expect(runs[0].branch.operation).toBe('withhold-rule');
    expect(runs[0].branch.reason).toBe(`withheld ${ruleId}`);

    await act(async () => root.unmount());
  }, 45000);

  it('evaluating earlier drops findings the record did not yet support', async () => {
    const { container, root } = await mount();
    await settleRuns(container);

    const before = Number(
      (container.querySelector('.branch-parent')?.textContent ?? '').match(/(\d+) findings/)?.[1],
    );

    await click(buttonWith(container, 'Evaluate at an earlier date', '.branch-option-btn'));
    await settleFor(container, (node) => node.querySelector('.branch-run') !== null);
    await click(buttonWith(container, 'Run the branch', '.branch-run'));

    await settleFor(container, (node) =>
      (node.textContent ?? '').includes('evaluated as of'),
    );

    const after = Number(
      (container.querySelector('.branch-parent')?.textContent ?? '').match(/(\d+) findings/)?.[1],
    );
    expect(after).toBeLessThan(before);

    await act(async () => root.unmount());
  }, 45000);
});
