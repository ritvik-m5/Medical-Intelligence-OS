// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ReconciliationPanel } from './ReconciliationPanel';
import { ingestDocument, type DocumentInput } from '../engine/ingest';
import { reconcileImpact } from '../engine/document/reconcile';
import { SAMPLE_PATIENT } from '../data/sampleCorpus';
import type { DocumentShape } from '../engine/document/identity';

/* ------------------------------------------------------------------ */
/* The reconciliation surface must render only what the engine returned. */
/* ------------------------------------------------------------------ */

function doc(input: DocumentInput): DocumentShape {
  return { title: input.title, kind: input.kind, date: input.date ?? '', facility: input.facility, text: input.text };
}

const existing: DocumentInput = {
  title: 'Lipid Panel',
  kind: 'lab_report',
  date: '2026-09-15',
  facility: 'Northside Laboratories',
  origin: 'upload',
  text: 'LDL Cholesterol 132 mg/dL\nHDL Cholesterol 46 mg/dL',
};

const incoming: DocumentInput = {
  title: 'Lipid Panel',
  kind: 'lab_report',
  date: '2026-09-15',
  facility: 'Northside Laboratories',
  origin: 'upload',
  text: 'LDL Cholesterol 128 mg/dL\nHDL Cholesterol 46 mg/dL',
};

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const existingResult = ingestDocument(existing, 0);
  const incomingResult = ingestDocument(incoming, 1);
  const impact = reconcileImpact(SAMPLE_PATIENT, [existing], incoming, 'keep');

  const keep = vi.fn();
  const discard = vi.fn();

  await act(async () => {
    root.render(
      createElement(ReconciliationPanel, {
        existing: doc(existing),
        incoming: doc(incoming),
        existingFacts: existingResult.facts,
        incomingFacts: incomingResult.facts,
        impact,
        onKeepBoth: keep,
        onDiscard: discard,
      }),
    );
  });

  return { container, root, keep, discard };
}

describe('the reconciliation panel', () => {
  it('labels the relationship from the identity engine, not a guess', async () => {
    const { container, root } = await mount();

    // Same metadata + structure, one value differs → "likely duplicate".
    expect(container.textContent).toContain('Likely duplicate');

    await act(async () => root.unmount());
  });

  it('shows the matching and differing fields', async () => {
    const { container, root } = await mount();

    expect(container.textContent).toContain('✓ date');
    expect(container.textContent).toContain('✓ facility');
    expect(container.textContent).toContain('✓ document type');

    await act(async () => root.unmount());
  });

  it('shows the exact value change, not a similarity score', async () => {
    const { container, root } = await mount();

    expect(container.textContent).toContain('LDL Cholesterol');
    expect(container.textContent).toContain('132');
    expect(container.textContent).toContain('128');

    await act(async () => root.unmount());
  });

  it('shows the real artifact consequence', async () => {
    const { container, root } = await mount();

    expect(container.textContent).toContain('1 → 2 documents');

    await act(async () => root.unmount());
  });

  it('defaults to non-destructive actions', async () => {
    const { container, root, keep, discard } = await mount();

    const keepBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Keep both'));
    const discardBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Discard new'));
    expect(keepBtn).toBeTruthy();
    expect(discardBtn).toBeTruthy();

    await act(async () => keepBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(keep).toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
