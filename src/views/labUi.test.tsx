// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ResearchLabView } from './ResearchLabView';
import { StoreProvider } from '../state/store';
import { LocalArtifactStore } from '../engine/platform/artifactStore';
import { LocalBuildBackend } from '../builder/backend';
import { toStoredRun } from '../builder/runs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* The Research Lab, mounted                                           */
/*                                                                    */
/* The store is seeded with a real artifact built by the real pipeline, */
/* so every assertion is about content that could only come from a      */
/* genuine result. The lab reads the same registry the builder writes   */
/* to, which is what makes a saved run openable here at all.            */
/* ------------------------------------------------------------------ */

async function seed() {
  const backend = new LocalBuildBackend({ pace: 0 });
  const artifact = await backend.run({ prompt: 'diabetes monitoring', pace: 0 }, () => {});
  const store = new LocalArtifactStore();
  await store.save(toStoredRun(artifact, { prompt: 'diabetes monitoring', label: 'Baseline' }));
  return artifact;
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(StoreProvider, null, createElement(ResearchLabView, null)));
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

/** Open the seeded artifact and land on the Lab proper. */
async function openLab(container: HTMLElement) {
  await settleFor(container, (node) => node.querySelector('.lab-pick') !== null);
  await click(container.querySelector('.lab-pick')!);
  await settleFor(container, (node) => node.querySelector('.lab-tabs') !== null);
  await settleFor(container, (node) => node.querySelector('.lab-verdict') !== null);
}

/** Run a rule-withholding branch and wait for it to land in the tree. */
async function branchOnRule(container: HTMLElement) {
  await click(withText(container, '.lab-tab', 'Branches'));
  await settleFor(container, (node) => node.querySelector('.lab-option-btn') !== null);
  await click(withText(container, '.lab-option-btn', 'Withhold a rule'));
  await settleFor(container, (node) => node.querySelectorAll('.lab-chip-btn').length > 0);
  const ruleId = (container.querySelector('.lab-chip-btn code')?.textContent ?? '').trim();
  await click(container.querySelector('.lab-chip-btn')!);
  await click(withText(container, '.lab-btn', 'Run the branch'));
  await settleFor(container, (node) => node.querySelector('.lab-tree-child') !== null);
  return ruleId;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the research lab', () => {
  it('opens on the stored artifacts, and says so when there are none', async () => {
    const { container, root } = await mount();
    await settleFor(container, (node) => node.querySelector('.lab-empty') !== null);

    expect(container.querySelector('.lab-empty')?.textContent).toContain('No saved runs yet');

    await act(async () => root.unmount());
  });

  it('lists a saved artifact with its identity and counts', async () => {
    await seed();
    const { container, root } = await mount();

    await settleFor(container, (node) => node.querySelector('.lab-pick') !== null);
    const pick = container.querySelector('.lab-pick')?.textContent ?? '';

    expect(pick).toMatch(/MM-[0-9A-F]{4}-[0-9A-F]{4}/);
    expect(pick).toMatch(/\d+ findings/);
    expect(pick).toMatch(/\d+ documents/);

    await act(async () => root.unmount());
  });

  it('re-derives the artifact on open and reports that it reproduces', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);

    expect(container.querySelector('.lab-verdict')?.textContent).toContain('reproduces exactly');

    await act(async () => root.unmount());
  });

  it('shows the engine, the rule set and the content address in the header', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);

    const strip = container.querySelector('.lab-strip')?.textContent ?? '';
    expect(strip).toMatch(/engine \d+\.\d+\.\d+/);
    expect(strip).toMatch(/\d+ rules/);
    expect(strip).toContain('verification 100/100');

    const address = container.querySelector('.lab-address code')?.textContent ?? '';
    expect(address).toMatch(/^[0-9a-f]{64}$/);

    await act(async () => root.unmount());
  });

  it('offers the seven areas of the lab', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);

    const tabs = Array.from(container.querySelectorAll('.lab-tab')).map((node) =>
      (node.textContent ?? '').replace(/\d+$/, '').trim(),
    );
    expect(tabs).toEqual([
      'Baseline',
      'Branches',
      'Proof Diff',
      'Impact',
      'Stability',
      'Questions',
      'Lineage',
    ]);

    await act(async () => root.unmount());
  });

  it('shows findings with their rule, grade and what the engine will not conclude', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);

    const findings = container.querySelectorAll('.lab-finding');
    expect(findings.length).toBeGreaterThan(0);
    expect(container.querySelector('.lab-finding-meta')?.textContent).toMatch(/grade [A-D]/);
    // Every finding states what it does not conclude.
    for (const finding of Array.from(findings)) {
      expect(finding.querySelector('.lab-finding-not')?.textContent?.length).toBeGreaterThan(10);
    }

    await act(async () => root.unmount());
  });
});



describe('branches in the lab', () => {
  it('runs a branch, and the branch is a different artifact with one fewer rule', async () => {
    const artifact = await seed();
    const { container, root } = await mount();
    await openLab(container);

    const ruleId = await branchOnRule(container);

    const child = container.querySelector('.lab-tree-child')?.textContent ?? '';
    expect(child).toContain('RULE WITHHELD');
    expect(child).toContain(`withheld ${ruleId}`);

    // The branch is stored, so its lineage lives on the artifact rather than in state.
    const runs = await new LocalArtifactStore().list();
    const branch = runs.runs.find((run) => run.branch.operation === 'withhold-rule');
    expect(branch).toBeDefined();
    expect(branch!.identity.ruleCount).toBe(artifact.identity.ruleCount - 1);
    expect(branch!.branch.parentId).toBe(artifact.identity.artifactId);
    expect(branch!.suppressedRules).toEqual([ruleId]);

    await act(async () => root.unmount());
  });

  it('labels a counterfactual and carries what it does not claim', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);
    await branchOnRule(container);

    await click(withText(container, '.lab-tab', 'Proof Diff'));
    await settleFor(container, (node) => node.querySelector('.lab-counterfactual') !== null);

    const cf = container.querySelector('.lab-counterfactual')!;
    expect(cf.querySelector('.lab-cf-tag')?.textContent).toBe('COUNTERFACTUAL');
    // The discipline travels with the result, not with the interface that shows it.
    expect(cf.querySelectorAll('.lab-cf-not li').length).toBeGreaterThanOrEqual(4);
    expect(cf.textContent).toContain('not a statement about the record');
    expect(cf.textContent).toContain('No clinical recommendation');

    await act(async () => root.unmount());
  });

  it('diffs a branch proof step by step rather than by count', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);
    await branchOnRule(container);

    await click(withText(container, '.lab-tab', 'Proof Diff'));
    await settleFor(container, (node) => node.querySelector('.lab-diff') !== null);

    expect(container.querySelectorAll('.lab-diff').length).toBeGreaterThan(0);
    // The withheld rule's findings exist only in the baseline.
    expect(container.querySelector('.lab-diff-presence')?.textContent).toBe('only-before');
    // The vanished proof is shown in full, not summarised.
    expect(container.querySelectorAll('.lab-step').length).toBeGreaterThan(0);
    for (const step of Array.from(container.querySelectorAll('.lab-step-tag'))) {
      expect(['added', 'removed', 'replaced', 'changed', 'unchanged']).toContain(step.textContent);
    }

    await act(async () => root.unmount());
  });

  it('traces an impact chain with a reason on every edge', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);

    await click(withText(container, '.lab-tab', 'Impact'));
    await settleFor(container, (node) => node.querySelector('.lab-edge') !== null);

    const edges = container.querySelectorAll('.lab-edge');
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of Array.from(edges)) {
      expect(edge.querySelector('.lab-edge-why')?.textContent?.length).toBeGreaterThan(10);
    }

    await act(async () => root.unmount());
  });

  it('says branch sensitivity is unmeasured until a branch has been run', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);

    await click(withText(container, '.lab-tab', 'Stability'));
    await settleFor(container, (node) => node.querySelector('.lab-profile') !== null);

    expect(container.querySelector('.lab-profile-figures')?.textContent).toContain('not measured');
    expect(container.querySelector('.lab-profile-why')?.textContent).toContain(
      'has not been measured',
    );

    await act(async () => root.unmount());
  });

  it('answers research questions with citations and limitations', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);

    await click(withText(container, '.lab-tab', 'Questions'));
    await settleFor(container, (node) => node.querySelector('.lab-answer') !== null);

    const answers = container.querySelectorAll('.lab-answer');
    expect(answers.length).toBe(7);
    for (const answer of Array.from(answers)) {
      expect(answer.querySelector('.lab-answer-tag')?.textContent).toBe('ENGINE-DERIVED');
      expect(answer.querySelector('.lab-answer-text')?.textContent?.length).toBeGreaterThan(20);
      // Every answer says what it does not say.
      expect(answer.querySelectorAll('.lab-answer-limits li').length).toBeGreaterThan(0);
    }

    // The question that needs a branch says so rather than estimating.
    expect(container.querySelectorAll('.lab-answer-needs').length).toBeGreaterThan(0);

    await act(async () => root.unmount());
  });

  it('draws lineage from the stored parent pointers', async () => {
    await seed();
    const { container, root } = await mount();
    await openLab(container);

    await click(withText(container, '.lab-tab', 'Lineage'));
    await settleFor(container, (node) => node.querySelector('.lab-lineage-node') !== null);

    const nodes = container.querySelectorAll('.lab-lineage-node');
    expect(nodes.length).toBe(1);
    expect(nodes[0].textContent).toContain('Baseline');
    expect(nodes[0].textContent).toContain('engine ');

    await act(async () => root.unmount());
  });
});
