import { useEffect, useMemo, useState } from 'react';
import { useStore, type ViewId } from '../state/store';
import { Icon } from './Icon';
import { Chip } from './Panel';
import { SUGGESTED_QUESTIONS } from '../engine/query';
import { CATEGORY_LABEL } from '../engine/derive/types';

/* ------------------------------------------------------------------ */
/* Command palette                                                     */
/*                                                                    */
/* One entry point for navigation, questions and findings. It searches  */
/* the derived findings rather than only the navigation, so it doubles  */
/* as a way to jump straight to a specific proof.                       */
/* ------------------------------------------------------------------ */

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  group: string;
  run: () => void;
}

const NAV_TARGETS: Array<{ id: ViewId; label: string; hint: string }> = [
  { id: 'overview', label: 'Overview', hint: 'Current state and open questions' },
  { id: 'timemachine', label: 'Time Machine', hint: 'Two pins, two reconstructions' },
  { id: 'temporal', label: 'Intervals', hint: 'Courses and spans on one axis' },
  { id: 'graph', label: 'Health Graph', hint: 'Concepts and inferred relations' },
  { id: 'records', label: 'Records', hint: 'Import and inspect documents' },
  { id: 'measurements', label: 'Measurements', hint: 'Every reading and its range' },
  { id: 'debugger', label: 'Debugger', hint: 'Contradictions and change' },
  { id: 'inference', label: 'Inference', hint: 'Derivations and their proofs' },
  { id: 'ask', label: 'Ask', hint: 'Query the structured history' },
  { id: 'research', label: 'Research Mode', hint: 'External evidence, kept separate' },
  { id: 'quality', label: 'Record Quality', hint: 'Scorecard and audit log' },
  { id: 'cohort', label: 'Cohort', hint: 'The same engines across subjects' },
  { id: 'interop', label: 'Interop & Sharing', hint: 'FHIR export, redaction, import' },
];

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setView, derivations, askQuestion, openProof } = useStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => {
    if (!paletteOpen) setQuery('');
  }, [paletteOpen]);

  const items: PaletteItem[] = useMemo(() => {
    const nav: PaletteItem[] = NAV_TARGETS.map((target) => ({
      id: `nav_${target.id}`,
      label: target.label,
      hint: target.hint,
      group: 'Go to',
      run: () => setView(target.id),
    }));

    const findings: PaletteItem[] = derivations.slice(0, 40).map((derivation) => ({
      id: `drv_${derivation.id}`,
      label: derivation.title,
      hint: `${CATEGORY_LABEL[derivation.category]} · ${derivation.severity} · confidence ${derivation.confidence.toFixed(2)}`,
      group: 'Findings',
      run: () => {
        setView('inference');
        openProof(derivation.id);
      },
    }));

    const questions: PaletteItem[] = SUGGESTED_QUESTIONS.map((question) => ({
      id: `q_${question}`,
      label: question,
      hint: 'Ask the record',
      group: 'Ask',
      run: () => {
        setView('ask');
        askQuestion(question);
      },
    }));

    return [...nav, ...findings, ...questions];
  }, [derivations, setView, askQuestion, openProof]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items.slice(0, 14);
    return items
      .filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(needle))
      .slice(0, 18);
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group);
      if (list) list.push(item);
      else map.set(item.group, [item]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!paletteOpen) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={() => setPaletteOpen(false)} role="presentation" />
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          className="palette-input"
          autoFocus
          value={query}
          placeholder="Jump to a view, a finding, or ask a question…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filtered[0]) {
              filtered[0].run();
              setPaletteOpen(false);
            }
          }}
        />
        <div className="palette-list">
          {grouped.length === 0 && (
            <div className="empty" style={{ padding: 18 }}>
              Nothing matches. The palette searches views, derived findings and suggested questions.
            </div>
          )}
          {grouped.map(([group, groupItems]) => (
            <div key={group}>
              <div className="palette-group">{group}</div>
              {groupItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="palette-item"
                  onClick={() => {
                    item.run();
                    setPaletteOpen(false);
                  }}
                >
                  <span className="palette-label">{item.label}</span>
                  <span className="palette-hint">{item.hint}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <Chip tone="muted">Cmd+K to toggle</Chip>
          <Chip tone="muted">Enter runs the first match</Chip>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Ask size={12} />
            <span className="dim" style={{ fontSize: 11 }}>
              {items.length} entries
            </span>
          </span>
        </div>
      </div>
    </>
  );
}

