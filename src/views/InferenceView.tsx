import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, EmptyState, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import { ProofPanel } from '../components/ProofViewer';
import { RuleRegistry } from '../components/RuleRegistry';
import { CATEGORY_LABEL, RULE_LABEL, type DerivationCategory } from '../engine/derive/types';
import { formatDate } from '../engine/text/normalize';
import { plural } from '../lib/format';
import { contextForFinding } from '../ai/context';

/**
 * The inference board.
 *
 * Every derived claim appears here with its proof, and the rule registry is shown
 * alongside the findings — including the rules that produced nothing, because a
 * rule firing zero times is information rather than an absence.
 */
export function InferenceView() {
  const {
    derivations,
    proof,
    openProof,
    closeProof,
    ruleHealthReport,
    openEvidence,
    askAbout,
    researchAbout,
    engine,
    asOf,
  } =
    useStore();
  const [category, setCategory] = useState<DerivationCategory | 'all'>('all');

  const categories = useMemo(
    () => Array.from(new Set(derivations.map((d) => d.category))).sort(),
    [derivations],
  );
  const filtered =
    category === 'all' ? derivations : derivations.filter((d) => d.category === category);
  const selected = proof ? derivations.find((d) => d.id === proof.derivationId) : undefined;

  return (
    <div className="view-inner">
      <Panel
        title="Inference board"
        sub={`${plural(derivations.length, 'derived finding')} from ${plural(ruleHealthReport.length, 'rule')} · each carries a proof you can traverse`}
        actions={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`chip is-button${category === 'all' ? ' is-ok' : ' is-muted'}`}
              onClick={() => setCategory('all')}
            >
              all ({derivations.length})
            </button>
            {categories.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`chip is-button${category === entry ? ' is-ok' : ' is-muted'}`}
                onClick={() => setCategory(entry)}
              >
                {CATEGORY_LABEL[entry]} ({derivations.filter((d) => d.category === entry).length})
              </button>
            ))}
          </div>
        }
      >
        <div className="notice">
          <Icon.Warning size={15} />
          <div>
            <strong>Every claim here is a proof object, not a sentence.</strong> A derivation is a
            directed graph of steps: documented premises, reconstructed intervals, the rule applied,
            and one conclusion. Confidence is propagated from the sources through the rule's
            declared reliability — it is never set by hand.
          </div>
        </div>
      </Panel>


      {selected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            className="btn is-sm"
            onClick={closeProof}
            style={{ alignSelf: 'flex-start' }}
          >
            ← Back to the board
          </button>
          <ProofPanel derivation={selected} />
        </div>
      ) : filtered.length === 0 ? (
        <Panel title="No finding matches this filter">
          <EmptyState>
            An empty result is not proof of correctness. It means no rule in the registry produced a
            finding for this record at this date.
          </EmptyState>
        </Panel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((derivation) => (
            <article
              key={derivation.id}
              className={`conflict-card is-${derivation.severity}`}
              onClick={() => openProof(derivation.id)}
            >
              <div className="conflict-head">
                <span
                  className={`dot ${
                    derivation.severity === 'high'
                      ? 'critical'
                      : derivation.severity === 'medium'
                        ? 'warn'
                        : 'info'
                  }`}
                  style={{ marginTop: 6 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="conflict-title">{derivation.title}</div>
                  <div className="conflict-meta">
                    <Chip
                      tone={
                        derivation.severity === 'high'
                          ? 'critical'
                          : derivation.severity === 'medium'
                            ? 'warn'
                            : 'info'
                      }
                    >
                      {derivation.severity}
                    </Chip>
                    <Chip tone="muted">{CATEGORY_LABEL[derivation.category]}</Chip>
                    <Chip tone="muted">{RULE_LABEL[derivation.ruleId]}</Chip>
                    <Chip tone={derivation.confidence >= 0.8 ? 'ok' : 'muted'}>
                      confidence {derivation.confidence.toFixed(2)}
                    </Chip>
                    <Chip tone="muted">grade {derivation.grade}</Chip>
                    <Chip tone="muted">
                      {derivation.steps.length} steps · depth {derivation.depth}
                    </Chip>
                    <Chip tone="muted">
                      {formatDate(derivation.window.start)} → {formatDate(derivation.window.end)}
                    </Chip>
                  </div>
                </div>
                <Icon.Graph size={15} />
              </div>

              <div className="conflict-detail">{derivation.statement}</div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip tone="ok" onClick={() => openProof(derivation.id)}>
                  <Icon.Eye size={11} />
                  Open the proof
                </Chip>
                <Chip
                  tone="info"
                  onClick={() =>
                    openEvidence({
                      title: derivation.title,
                      subtitle: `${derivation.steps.length} steps`,
                      factIds: derivation.factIds,
                      docId: derivation.docIds[0],
                    })
                  }
                >
                  <Icon.Quote size={11} />
                  {plural(derivation.factIds.length, 'source')}
                </Chip>
                <Chip
                  tone="info"
                  onClick={() =>
                    askAbout(contextForFinding(engine.identity.artifactId, asOf, derivation))
                  }
                >
                  <Icon.Ask size={11} />
                  Ask about this
                </Chip>
                <Chip
                  tone="external"
                  onClick={() =>
                    researchAbout(
                      contextForFinding(engine.identity.artifactId, asOf, derivation),
                      `What evidence relates to ${derivation.title}?`,
                    )
                  }
                >
                  <Icon.Research size={11} />
                  Research this
                </Chip>
              </div>
            </article>
          ))}
        </div>
      )}

      <RuleRegistry />
    </div>
  );
}
