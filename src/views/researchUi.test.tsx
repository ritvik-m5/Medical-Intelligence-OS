// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ResearchView } from './ResearchView';
import { StoreProvider, useStore } from '../state/store';
import { clearResearchCache } from '../engine/research';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function trialResponse(studies: unknown[]) {
  return vi.fn(async () =>
    Response.json({
      studies,
    }),
  );
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const live: { graphDocuments: number; asOf: string } = { graphDocuments: 0, asOf: '' };

  function Probe() {
    const store = useStore();
    live.graphDocuments = store.graph.documents.length;
    live.asOf = store.asOf;
    return null;
  }

  await act(async () => {
    root.render(
      createElement(StoreProvider, null, createElement(ResearchView, null), createElement(Probe, null)),
    );
  });

  return { container, root, live };
}

async function settle(container: HTMLElement, text: string, timeout = 8000): Promise<void> {
  const started = Date.now();
  while (!container.textContent?.includes(text)) {
    if (Date.now() - started > timeout) {
      throw new Error(`Timed out waiting for "${text}". Got: ${(container.textContent ?? '').slice(0, 400)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  }
}

async function askResearch(container: HTMLElement, question: string) {
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(textarea, question);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const button = Array.from(container.querySelectorAll('button')).find((node) =>
    node.textContent?.includes('Research'),
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Research Mode UI', () => {
  beforeEach(() => {
    clearResearchCache();
    vi.restoreAllMocks();
  });

  it('opens question-first and does not dump a bundled source catalog', async () => {
    const { container, root } = await mount();

    expect(container.textContent).toContain('What are you researching?');
    expect(container.textContent).not.toContain('47 curated references');
    expect(container.textContent).not.toContain('bundled sources');

    await act(async () => root.unmount());
  });

  it('derives personal counts from the artifact as of the global date', async () => {
    const fetchImpl = trialResponse([]);
    vi.stubGlobal('fetch', fetchImpl);

    const { container, root, live } = await mount();
    await askResearch(container, 'What is documented about potassium?');
    await settle(container, 'What your record says');

    expect(container.textContent).toContain(`as of`);
    expect(container.textContent).toContain('Personal record');
    expect(container.textContent).not.toContain(`${live.graphDocuments} documents extracted`);
    expect(container.textContent).toContain('document');

    await act(async () => root.unmount());
  });

  it('shows registry unavailable separately from an empty result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const { container, root } = await mount();
    await askResearch(container, 'What is documented about potassium?');
    await settle(container, 'ClinicalTrials.gov could not be reached');

    expect(container.textContent).not.toContain('returned zero relevant studies');

    await act(async () => root.unmount());
  });

  it('renders the required research sections and receipt', async () => {
    const fetchImpl = trialResponse([
      {
        protocolSection: {
          identificationModule: { nctId: 'NCT123', briefTitle: 'Potassium study' },
          statusModule: { overallStatus: 'RECRUITING' },
          designModule: { phases: ['PHASE2'], studyType: 'INTERVENTIONAL' },
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchImpl);

    const { container, root } = await mount();
    await askResearch(container, 'What is documented about potassium?');
    await settle(container, 'Research receipt');

    expect(container.textContent).toContain('What your record says');
    expect(container.textContent).toContain('What external sources say');
    expect(container.textContent).toContain('Where they intersect');
    expect(container.textContent).toContain('What is still unknown');
    expect(container.textContent).toContain('Sources');
    expect(container.textContent).toContain('NCT123');
    expect(container.textContent).toContain('Model used');
    expect(container.textContent).toContain('none');

    await act(async () => root.unmount());
  });

  it('does not show unrelated bundled references for a potassium query', async () => {
    vi.stubGlobal('fetch', trialResponse([]));

    const { container, root } = await mount();
    await askResearch(container, 'What is documented about potassium?');
    await settle(container, 'What external sources say');

    expect(container.textContent).not.toContain('GLP-1');
    expect(container.textContent).not.toContain('ev_glp1');

    await act(async () => root.unmount());
  });
});
