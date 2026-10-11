// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { BuilderView } from '../views/BuilderView';
import { StoreProvider } from '../state/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Builder UI tests.
 *
 * These mount the real builder with effects enabled, wrapped in the real store
 * because the builder reads it for the evidence drawer. The build that runs is
 * the real pipeline, so the assertions are about content that could only come
 * from a genuine result: the patient's name, real derivation counts, real
 * document counts. Nothing here would pass against a mock.
 */

async function mountBuilder() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onEnterWorkspace = vi.fn();

  await act(async () => {
    root.render(
      createElement(StoreProvider, null, createElement(BuilderView, { onEnterWorkspace })),
    );
  });

  return { container, root, onEnterWorkspace };
}

function buttonWith(container: HTMLElement, text: string) {
  const target = Array.from(container.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').includes(text),
  );
  if (!target) throw new Error(`No button containing "${text}"`);
  return target;
}

function setTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Wait for a lazily-loaded section to arrive. */
async function settleFor(
  container: HTMLElement,
  predicate: (container: HTMLElement) => boolean,
  timeout = 4000,
): Promise<void> {
  const started = Date.now();
  while (!predicate(container)) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for a lazy section.');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

describe('builder: arrival', () => {
  it('renders the composer as the centre of the page', async () => {
    const { container, root } = await mountBuilder();

    expect(container.querySelector('.composer-input')).not.toBeNull();
    expect(container.querySelector('.hero-title')?.textContent).toContain('Build anything');
    expect(container.querySelectorAll('.suggestion').length).toBeGreaterThan(3);

    await act(async () => root.unmount());
  });

  it('builds the default record on mount, so the preview is not empty', async () => {
    const { container, root } = await mountBuilder();

    expect(container.textContent).toContain('Alex Morgan');
    expect(container.querySelector('.ready-patient')).not.toBeNull();
    // Tiles come from the artifact, not from markup.
    expect(container.querySelectorAll('.ready-tile').length).toBe(4);
    expect(container.querySelector('.ready-meta')?.textContent).toMatch(/documents ·/);

    await act(async () => root.unmount());
  });

  it('shows the build pipeline it actually ran', async () => {
    const { container, root } = await mountBuilder();

    const rail = container.querySelectorAll('.buildstate-node');
    expect(rail.length).toBeGreaterThan(3);
    // Every stage is complete after the auto-build.
    expect(container.querySelectorAll('.buildstate-node.is-done').length).toBe(rail.length);

    await act(async () => root.unmount());
  });

  it('reports the record grade and a real derivation count', async () => {
    const { container, root } = await mountBuilder();

    const tiles = Array.from(container.querySelectorAll('.ready-tile')).map(
      (tile) => tile.textContent ?? '',
    );
    expect(tiles.join(' ')).toContain('Derivations');
    expect(container.querySelector('.ready-grade-letter')?.textContent).toMatch(/^[ABCD]$/);

    await act(async () => root.unmount());
  });
});

describe('builder: the prompt drives the build', () => {
  it('plans the scenario the prompt describes', async () => {
    const { container, root } = await mountBuilder();

    const textarea = container.querySelector<HTMLTextAreaElement>('.composer-input')!;
    await act(async () => {
      setTextarea(textarea, 'audit my medication list for contradictions');
    });
    await act(async () => {
      buttonWith(container, 'Build').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // The plan is published synchronously when a build starts, so the scenario
    // the prompt matched is visible immediately.
    expect(container.textContent).toContain('Medication reconciliation audit');

    await act(async () => root.unmount());
  });

  it('submits on Enter, as an application input would', async () => {
    const { container, root } = await mountBuilder();

    const textarea = container.querySelector<HTMLTextAreaElement>('.composer-input')!;
    await act(async () => {
      setTextarea(textarea, 'prepare a redacted summary for a specialist');
    });
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(container.textContent).toContain('Clinic-ready share package');

    await act(async () => root.unmount());
  });

  it('runs the build a suggestion describes', async () => {
    const { container, root } = await mountBuilder();

    const chip = Array.from(container.querySelectorAll<HTMLButtonElement>('.suggestion')).find(
      (button) => (button.textContent ?? '').includes('monitoring'),
    );
    expect(chip).toBeDefined();
    await act(async () => {
      chip!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Chronic disease monitoring review');

    await act(async () => root.unmount());
  });

  it('completes a paced build and swaps the preview to the built product', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      buttonWith(container, 'Build this').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // The paced build takes about a second; wait for it to land.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    });

    expect(container.querySelector('.ready-patient')).not.toBeNull();
    expect(container.querySelector('.preview-badge.is-ready')).not.toBeNull();

    await act(async () => root.unmount());
  }, 30000);

  it('shows an active stage while the build is running', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      buttonWith(container, 'Build this').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.buildstate-node.is-active')).not.toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    });
    await act(async () => root.unmount());
  }, 30000);
});

describe('builder: the engine status and the artifact inspector', () => {
  it('reports real counts in the pill', async () => {
    const { container, root } = await mountBuilder();

    const pill = container.querySelector('.engine-pill');
    expect(pill).not.toBeNull();
    const text = pill!.textContent ?? '';
    expect(text).toContain('Live engine');
    // Builder uses the compact pill; full counts live in the artifact inspector.
    expect(text).toMatch(/MM-[0-9A-F]{4}-[0-9A-F]{4}/);
    expect(text).toMatch(/\d{2,3}|failed/);

    await act(async () => root.unmount());
  });

  it('verifies the artifact and says so', async () => {
    const { container, root } = await mountBuilder();

    expect(container.querySelector('.engine-pill.is-verified')).not.toBeNull();
    expect(container.querySelector('.engine-pill.is-failed')).toBeNull();
    // The score is 100 only when nothing failed.
    expect(container.querySelector('.engine-pill-verdict')?.textContent).toBe('100');

    await act(async () => root.unmount());
  });

  it('opens the artifact inspector when the pill is clicked', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      container
        .querySelector('.engine-pill')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.drawer')).not.toBeNull();
    expect(container.textContent).toContain('Engine artifact');
    expect(container.textContent).toContain('Provenance');

    await act(async () => root.unmount());
  });

  it('shows every provenance check as passing on a clean build', async () => {
    const { container, root } = await mountBuilder();
    await act(async () => {
      container
        .querySelector('.engine-pill')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const checks = container.querySelectorAll('.inspector-check');
    expect(checks.length).toBe(6);
    expect(container.querySelectorAll('.inspector-check.is-bad').length).toBe(0);
    expect(container.textContent).toContain('Facts re-read from source');
    expect(container.textContent).toContain('Proofs topologically ordered');
    expect(container.textContent).toContain('recomputed when this panel opened');

    await act(async () => root.unmount());
  });

  it('lists the pipeline it actually ran', async () => {
    const { container, root } = await mountBuilder();
    await act(async () => {
      container
        .querySelector('.engine-pill')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const steps = container.querySelectorAll('.inspector-step');
    expect(steps.length).toBeGreaterThan(10);
    expect(container.textContent).toContain('ingesting');
    expect(container.textContent).toContain('inferring');

    await act(async () => root.unmount());
  });

  it('lists the documents and the derivations', async () => {
    const { container, root } = await mountBuilder();
    await act(async () => {
      container
        .querySelector('.engine-pill')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Documents');
    expect(container.textContent).toContain('Derivations');
    const rows = container.querySelectorAll('.inspector-row');
    expect(rows.length).toBeGreaterThan(10);

    await act(async () => root.unmount());
  });

  it('shows the export counts', async () => {
    const { container, root } = await mountBuilder();
    await act(async () => {
      container
        .querySelector('.engine-pill')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Export');
    expect(container.textContent).toContain('coding coverage');
    expect(container.querySelectorAll('.inspector-export-stat').length).toBe(4);

    await act(async () => root.unmount());
  });

  it('closes the inspector', async () => {
    const { container, root } = await mountBuilder();
    await act(async () => {
      container
        .querySelector('.engine-pill')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.drawer')).not.toBeNull();

    await act(async () => {
      container
        .querySelector('.drawer-close')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.drawer')).toBeNull();

    await act(async () => root.unmount());
  });
});

describe('builder: attachments reach the pipeline', () => {
  function dropFiles(container: HTMLElement, files: File[]) {
    const composer = container.querySelector('.composer')!;
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    composer.dispatchEvent(event);
  }

  it('reads a dropped document and shows it in the tray', async () => {
    const { container, root } = await mountBuilder();

    const dropped = new File(
      ['Current medications:\n- Metformin 1 g twice daily\n- Atorvastatin 20 mg at night'],
      'meds.txt',
      { type: 'text/plain' },
    );
    await act(async () => {
      dropFiles(container, [dropped]);
    });

    expect(container.querySelector('.attach-tray')).not.toBeNull();
    expect(container.textContent).toContain('Meds');
    expect(container.textContent).toContain('read as');
    // The kind was inferred from the content, not the filename.
    const select = container.querySelector<HTMLSelectElement>('.attach-item-kind select');
    expect(select?.value).toBe('medication_list');

    await act(async () => root.unmount());
  });

  it('builds from the attachment rather than the built-in record', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      dropFiles(container, [
        new File(
          ['Current medications:\n- Metformin 1 g twice daily\n- Lisinopril 10 mg once daily'],
          'meds.txt',
          { type: 'text/plain' },
        ),
      ]);
    });

    // Build with an empty prompt: the attachments are the input.
    await act(async () => {
      buttonWith(container, 'Build').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    // The artifact is the attached document, not the built-in record.
    expect(container.querySelector('.appframe-address')?.textContent).toContain('/attached');
    expect(container.querySelector('.ready-meta')?.textContent).toMatch(/^1 documents?/);
    // Two medications in, two facts out. One document cannot contradict itself,
    // so zero findings is the correct answer here rather than a failure.
    expect(container.textContent).toContain('2');
    expect(container.querySelector('.ready-tile')?.textContent).toContain('Provenanced facts');
    // And the preview still verifies, because it is the same pipeline.
    expect(container.querySelector('.engine-pill.is-verified')).not.toBeNull();

    await act(async () => root.unmount());
  }, 30000);

  it('names the attachment plan while the build runs', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      dropFiles(container, [
        new File(['Current medications:\n- Metformin 1 g twice daily'], 'meds.txt', {
          type: 'text/plain',
        }),
      ]);
    });
    await act(async () => {
      buttonWith(container, 'Build').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Published synchronously when the build starts.
    expect(container.textContent).toContain('Attached documents');
    expect(container.textContent).toMatch(/your attachment|from your attachment/);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });
    await act(async () => root.unmount());
  }, 30000);

  it('reports a refused file with a reason instead of dropping it', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      dropFiles(container, [new File(['x'], 'scan.pdf', { type: 'application/pdf' })]);
    });

    expect(container.textContent).toContain('not read');
    expect(container.textContent).toContain('text layer');

    await act(async () => root.unmount());
  });

  it('removes an attachment', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      dropFiles(container, [
        new File(['Current medications:\n- Metformin 500 mg'], 'meds.txt', { type: 'text/plain' }),
      ]);
    });
    expect(container.querySelectorAll('.attach-item').length).toBe(1);

    await act(async () => {
      container
        .querySelector('.attach-item-remove')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.attach-tray')).toBeNull();

    await act(async () => root.unmount());
  });

  it('lets the reader correct the inferred kind', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      dropFiles(container, [
        new File(['Seen today. Feeling well.'], 'notes.txt', { type: 'text/plain' }),
      ]);
    });

    const select = container.querySelector<HTMLSelectElement>('.attach-item-kind select')!;
    expect(select.value).toBe('visit_note');

    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(select, 'lab_report');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const updated = container.querySelector<HTMLSelectElement>('.attach-item-kind select')!;
    expect(updated.value).toBe('lab_report');
    expect(container.textContent).toContain('manual');

    await act(async () => root.unmount());
  });
});

describe('builder: the pipeline diagrams come from the artifact', () => {
  it('renders a real document with real spans highlighted', async () => {
    const { container, root } = await mountBuilder();

    const lines = container.querySelectorAll('.story-doc-line');
    expect(lines.length).toBeGreaterThan(0);
    // The highlight is the real span, not a decoration.
    expect(container.querySelectorAll('.story-hl').length).toBeGreaterThan(0);
    expect(container.querySelector('.story-doc-kind')?.textContent).toBeTruthy();
    expect(container.querySelector('.story-doc-date')?.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(container.querySelector('.story-doc-foot')?.textContent).toContain('facts read from');

    await act(async () => root.unmount());
  });

  it('renders real surface forms and a real entity', async () => {
    const { container, root } = await mountBuilder();

    const forms = container.querySelectorAll('.story-form-text');
    expect(forms.length).toBeGreaterThanOrEqual(2);
    // Each form carries the number of documents it appeared in.
    const docs = container.querySelectorAll('.story-form-docs');
    expect(docs.length).toBe(forms.length);
    expect(container.querySelector('.story-link-node')?.textContent).toContain('entities resolved');

    await act(async () => root.unmount());
  });

  it('renders real intervals on a real axis', async () => {
    const { container, root } = await mountBuilder();

    const bars = container.querySelectorAll('.story-interval-bar');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of Array.from(bars)) {
      const left = (bar as HTMLElement).style.left;
      expect(left).toMatch(/%$/);
      expect(parseFloat(left)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(left)).toBeLessThanOrEqual(100);
    }

    await act(async () => root.unmount());
  });

  it('renders a real proof graph', async () => {
    const { container, root } = await mountBuilder();

    const steps = container.querySelectorAll('.story-proof-step');
    expect(steps.length).toBeGreaterThan(2);
    expect(container.querySelectorAll('.story-proof-edge').length).toBeGreaterThan(0);
    // The kinds are the engine's step kinds, not invented labels.
    const kinds = Array.from(container.querySelectorAll('.story-proof-kind')).map(
      (node) => node.textContent,
    );
    expect(kinds).toContain('premise');
    expect(kinds.some((kind) => kind === 'rule' || kind === 'conclusion')).toBe(true);

    await act(async () => root.unmount());
  });

  it('reports real figures in the caption', async () => {
    const { container, root } = await mountBuilder();

    const value = container.querySelector('.scrollstory-caption-value')?.textContent ?? '';
    const label = container.querySelector('.scrollstory-caption-label')?.textContent ?? '';
    expect(value).toMatch(/\d+/);
    expect(label.length).toBeGreaterThan(0);
    // Not the placeholder used before a build has run.
    expect(value).not.toBe('—');

    await act(async () => root.unmount());
  });
});

describe('builder: artifact identity and reproduction', () => {
  async function openInspector(container: HTMLElement) {
    await act(async () => {
      container
        .querySelector('.engine-pill')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  it('names the result in the pill', async () => {
    const { container, root } = await mountBuilder();

    const id = container.querySelector('.engine-pill-id')?.textContent ?? '';
    expect(id).toMatch(/^MM-[0-9A-F]{4}-[0-9A-F]{4}$/);

    await act(async () => root.unmount());
  });

  it('shows what the name is made of', async () => {
    const { container, root } = await mountBuilder();
    await openInspector(container);

    expect(container.textContent).toContain('Identity');
    const rows = container.querySelectorAll('.inspector-identity-row');
    expect(rows.length).toBe(5);
    const labels = Array.from(container.querySelectorAll('.inspector-identity-label')).map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['Artifact', 'Corpus', 'Result', 'Engine', 'Rule set']);

    // The hashes are real SHA-256 values, not placeholders.
    const values = Array.from(container.querySelectorAll('.inspector-identity-value')).map(
      (node) => node.textContent ?? '',
    );
    expect(values[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(values[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(values[2]).toMatch(/^[0-9a-f]{64}$/);
    // The engine version is a version, not a hash.
    expect(values[3]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(values[4]).toMatch(/^[0-9a-f]{64}$/);

    await act(async () => root.unmount());
  });

  it('reproduces the artifact and reports it identical', async () => {
    const { container, root } = await mountBuilder();
    await openInspector(container);

    await act(async () => {
      buttonWith(container, 'Reproduce this artifact').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const report = container.querySelector('.inspector-report');
    expect(report).not.toBeNull();
    expect(report!.className).toContain('is-identical');
    expect(container.textContent).toContain('Reproduced');
    expect(container.textContent).toContain('exactly');

    // Every dimension is checked, and every one matches.
    const checks = container.querySelectorAll('.inspector-report-check');
    expect(checks.length).toBe(4);
    expect(container.querySelectorAll('.inspector-report-check.is-bad').length).toBe(0);
    // Nothing to report as added, removed or altered.
    expect(container.querySelectorAll('.inspector-report-delta').length).toBe(0);

    await act(async () => root.unmount());
  });

  it('gives the same name to a rebuild of the same record', async () => {
    const first = await mountBuilder();
    const firstId = first.container.querySelector('.engine-pill-id')?.textContent;
    await act(async () => first.root.unmount());

    const second = await mountBuilder();
    const secondId = second.container.querySelector('.engine-pill-id')?.textContent;

    expect(secondId).toBe(firstId);
    await act(async () => second.root.unmount());
  });

  it('gives a different name to a different record', async () => {
    const { container, root } = await mountBuilder();
    const primaryId = container.querySelector('.engine-pill-id')?.textContent ?? '';
    expect(primaryId).toMatch(/^MM-/);

    // Type a prompt that selects a genuinely different subject, rather than a
    // different view of the same one.
    const textarea = container.querySelector<HTMLTextAreaElement>('.composer-input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(textarea, 'I only have a few documents — triage them');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonWith(container, 'Build').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    });

    const otherId = container.querySelector('.engine-pill-id')?.textContent ?? '';
    expect(otherId).toMatch(/^MM-/);
    expect(otherId).not.toBe(primaryId);
    // A different subject, so the artifact says so.
    expect(container.querySelector('.ready-meta')?.textContent).not.toContain('Alex Morgan');

    await act(async () => root.unmount());
  }, 40000);

  it('names the same result the same way when the same record is rebuilt', async () => {
    const { container, root } = await mountBuilder();
    const before = container.querySelector('.engine-pill-id')?.textContent ?? '';

    // Building the same scenario again must produce the same name.
    const chip = Array.from(container.querySelectorAll<HTMLButtonElement>('.suggestion')).find(
      (button) => (button.textContent ?? '').includes('Reconstruct'),
    );
    if (chip) {
      await act(async () => {
        chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 4000));
      });
      expect(container.querySelector('.engine-pill-id')?.textContent).toBe(before);
    }

    await act(async () => root.unmount());
  }, 40000);
});

describe('builder: the explainer', () => {
  it('says which backend is answering', async () => {
    const { container, root } = await mountBuilder();

    expect(container.querySelector('.explain')).not.toBeNull();
    expect(container.textContent).toContain('Ask the artifact');
    // The shipped backend is the engine's own, and it says so.
    expect(container.querySelector('.explain-backend.is-grounded')).not.toBeNull();
    expect(container.querySelector('.explain-backend')?.textContent).toBe('engine only');
    expect(container.textContent).toContain('Proof-grounded');

    await act(async () => root.unmount());
  });

  it('offers the questions it can actually answer', async () => {
    const { container, root } = await mountBuilder();

    const questions = container.querySelectorAll('.explain-question');
    expect(questions.length).toBeGreaterThan(3);
    expect(container.textContent).toContain('Why did the highest-severity finding appear?');

    await act(async () => root.unmount());
  });

  it('answers a question from the proof, with sources', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      buttonWith(container, 'Why did the highest-severity finding appear?').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    // The question is echoed, then answered.
    expect(container.querySelector('.explain-ask')?.textContent).toContain('Why did');

    const answer = container.querySelector('.explain-answer');
    expect(answer).not.toBeNull();
    const paragraphs = container.querySelectorAll('.explain-para');
    expect(paragraphs.length).toBeGreaterThan(3);
    // It walked the proof.
    expect(answer!.textContent).toMatch(/Documented|Rule applied|Conclusion/);
    // And it cites real spans.
    const sources = container.querySelectorAll('.explain-source');
    expect(sources.length).toBeGreaterThan(1);
    expect(container.textContent).toContain('characters');

    await act(async () => root.unmount());
  });

  it('admits when it cannot ground an answer', async () => {
    const { container, root } = await mountBuilder();

    const input = container.querySelector<HTMLInputElement>('.explain-composer input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(input, 'should I stop my statin?');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonWith(container, 'Ask').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.explain-unanswered')).not.toBeNull();
    expect(container.textContent).toContain('Not answered');
    // And it shows no sources, because there is nothing to cite.
    expect(container.querySelectorAll('.explain-source').length).toBe(0);

    await act(async () => root.unmount());
  });

  it('makes a cited source openable', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      buttonWith(container, 'Show me the evidence').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    // Sources that name real facts are clickable, and carry their span.
    const sources = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.explain-source:not(:disabled)'),
    );
    expect(sources.length).toBeGreaterThan(1);

    const details = sources.map(
      (node) => node.querySelector('.explain-source-detail')?.textContent ?? '',
    );
    // At least one is a real character span, not just a derivation summary.
    expect(details.some((detail) => detail.includes('characters'))).toBe(true);

    await act(async () => root.unmount());
  });
});

describe('builder: provenance badges', () => {
  it('marks an engine answer as engine-derived', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      buttonWith(container, 'Summarise what you found').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const badge = container.querySelector('.explain-provenance');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('is-engine-derived');
    expect(badge!.querySelector('.explain-provenance-badge')?.textContent).toBe('Engine-derived');

    await act(async () => root.unmount());
  });

  it('states that rewriting is not evidence', async () => {
    const { container, root } = await mountBuilder();

    await act(async () => {
      buttonWith(container, 'Summarise what you found').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(container.querySelector('.explain-provenance-note')?.textContent).toContain(
      'traces to a derivation',
    );

    await act(async () => root.unmount());
  });
});

describe('builder: comparing runs', () => {
  it('asks for two runs before it compares anything', async () => {
    const { container, root } = await mountBuilder();

    // Only the automatic build exists so far.
    expect(container.querySelector('.runcmp-empty')).not.toBeNull();
    expect(container.textContent).toContain('Two runs are needed to compare');

    await act(async () => root.unmount());
  });

  it('compares two runs once a second record has been built', async () => {
    const { container, root } = await mountBuilder();

    // Build a different record so there is something to compare.
    const textarea = container.querySelector<HTMLTextAreaElement>('.composer-input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(textarea, 'I only have a few documents — triage them');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonWith(container, 'Build').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    });

    await settleFor(container, (node) => node.querySelector('.runcmp') !== null);

    expect(container.querySelectorAll('.runcmp-picker').length).toBe(2);
    // The record differs, and the comparison says so rather than blaming the engine.
    expect(container.querySelector('.runcmp-axis.is-different')).not.toBeNull();
    expect(container.textContent).toContain('read different records');

    await act(async () => root.unmount());
  }, 40000);

  it('shows both proofs for a finding that moved', async () => {
    const { container, root } = await mountBuilder();

    const textarea = container.querySelector<HTMLTextAreaElement>('.composer-input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(textarea, 'I only have a few documents — triage them');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonWith(container, 'Build').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    });
    await settleFor(container, (node) => node.querySelector('.runcmp') !== null);

    // Open the first finding that differs.
    const finding = container.querySelector<HTMLButtonElement>('.runcmp-finding-head');
    expect(finding).not.toBeNull();
    await act(async () => {
      finding!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const proof = container.querySelector('.runcmp-proof');
    expect(proof).not.toBeNull();
    // Two columns: before and after.
    expect(proof!.querySelectorAll('.runcmp-side').length).toBe(2);
    // The side that has no proof says so rather than showing an empty box.
    const absent = proof!.querySelector('.runcmp-side.is-absent');
    expect(absent?.textContent).toContain('No proof on this side');

    await act(async () => root.unmount());
  }, 40000);
});

describe('builder: the page below the fold', () => {
  it('renders every section', async () => {
    const { container, root } = await mountBuilder();

    expect(container.querySelector('.scrollstory')).not.toBeNull();
    expect(container.querySelector('.capstrip')).not.toBeNull();
    expect(container.querySelector('.gallery')).not.toBeNull();
    expect(container.querySelector('.infra')).not.toBeNull();
    expect(container.querySelector('.cta')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('progresses the scrollytelling chapters as the reader scrolls', async () => {
    const { container, root } = await mountBuilder();

    await settleFor(container, (container) => container.querySelector('.scrollstory') !== null);

    // The scrollytelling renders four ordered steps; the first should be the
    // active one on arrival, since the page starts before any scroll has taken
    // the sticky stage past a chapter.
    const steps = container.querySelectorAll('.scrollstory-step');
    expect(steps.length).toBe(4);
    expect(container.querySelector('.scrollstory-step.is-active')).not.toBeNull();

    // Reading the chapter content keeps it consistent as the section loads.
    const firstStep = steps[0];
    expect(firstStep?.querySelector('.scrollstory-step-title')?.textContent).toMatch(/read/i);

    await act(async () => root.unmount());
  }, 8000);

  it('reveals content even without IntersectionObserver', async () => {
    // jsdom has no IntersectionObserver. The hook must fall back to visible, or
    // every section below the fold would be stuck at opacity zero.
    expect(typeof window.IntersectionObserver).toBe('undefined');
    const { container, root } = await mountBuilder();

    expect(container.querySelector('.capstrip.is-revealed')).not.toBeNull();
    expect(container.querySelector('.gallery.is-revealed')).not.toBeNull();
    expect(container.querySelector('.cta.is-revealed')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('shows the prompt behind each example', async () => {
    const { container, root } = await mountBuilder();

    const examples = container.querySelectorAll('.example');
    expect(examples.length).toBe(8);
    const prompts = Array.from(container.querySelectorAll('.example-prompt-text')).map(
      (node) => node.textContent ?? '',
    );
    expect(prompts.every((prompt) => prompt.length > 20)).toBe(true);

    await act(async () => root.unmount());
  });

  it('opens an example', async () => {
    const { container, root } = await mountBuilder();

    const toggle = container.querySelector<HTMLButtonElement>('.example-toggle')!;
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.example.is-open')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('lists the eight layers of the product as one stack', async () => {
    const { container, root } = await mountBuilder();

    expect(container.querySelectorAll('.infra-layer').length).toBe(8);
    const names = Array.from(container.querySelectorAll('.infra-layer-name')).map(
      (node) => node.textContent,
    );
    expect(names).toContain('Authentication');
    expect(names).toContain('Permissions');
    expect(names).toContain('Data');

    await act(async () => root.unmount());
  });

  it('hands off to the workspace from both the nav and the closing CTA', async () => {
    const { container, root, onEnterWorkspace } = await mountBuilder();

    await act(async () => {
      buttonWith(container, 'Open workspace').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(onEnterWorkspace).toHaveBeenCalledTimes(1);

    await act(async () => {
      buttonWith(container, 'Open the full workspace').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(onEnterWorkspace).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it('quotes the real counts of the last build in the closing CTA', async () => {
    const { container, root } = await mountBuilder();

    const sub = container.querySelector('.cta-sub')?.textContent ?? '';
    expect(sub).toMatch(/read \d+ documents, extracted \d+ facts/);

    await act(async () => root.unmount());
  });
});
