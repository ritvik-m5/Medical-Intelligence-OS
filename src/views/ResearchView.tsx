import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONTEXT_KIND_LABEL } from '../ai/context';
import { Chip, Notice, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import {
  categoryCounts,
  researchReceipt,
  runResearch,
  verifyResearchResult,
  type ResearchResult,
} from '../engine/research';
import type { ExternalSource, SourceType, TrialLookupState } from '../engine/research/types';
import { formatDate } from '../engine/text/normalize';
import { plural } from '../lib/format';
import { useStore } from '../state/store';

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  official_labeling: 'Official labeling',
  government_public_health: 'Government / public health',
  medical_reference: 'Medical reference',
  guideline: 'Guideline',
  clinical_trial_registry: 'Clinical trial registry',
  secondary_reference: 'Secondary reference',
};

const MATCH_LABEL = {
  contextualizes: 'Contextualizes',
  supports: 'Supports',
  differs: 'Differs',
  not_directly_comparable: 'Not directly comparable',
  no_documented_relationship: 'No documented relationship',
} as const;

function freshnessLabel(freshness: string): string {
  if (freshness === 'current') return 'Current';
  if (freshness === 'superseded') return 'Superseded';
  return 'Freshness not verified';
}

function cacheLabel(state: string): string {
  if (state === 'live') return 'LIVE';
  if (state === 'cached') return 'CACHED';
  if (state === 'stale') return 'STALE';
  return state.toUpperCase();
}

function TrialsPanel({ trials }: { trials: TrialLookupState }) {
  if (trials.kind === 'not_queried') {
    return (
      <div className="research-empty">
        ClinicalTrials.gov will be queried when the research subject resolves to a searchable concept.
      </div>
    );
  }
  if (trials.kind === 'loading') {
    return (
      <div className="research-empty">
        <span className="spin" /> Querying ClinicalTrials.gov for &ldquo;{trials.query}&rdquo;&hellip;
      </div>
    );
  }
  if (trials.kind === 'unavailable') {
    return (
      <Notice tone="warn">
        <strong>ClinicalTrials.gov could not be reached.</strong> {trials.reason}
      </Notice>
    );
  }

  const cacheState = 'cacheState' in trials ? trials.cacheState : undefined;
  const retrievedAt = 'retrievedAt' in trials ? trials.retrievedAt : undefined;

  if (trials.kind === 'empty') {
    return (
      <div className="research-trials-meta">
        <Chip tone="muted">Query: {trials.query}</Chip>
        {cacheState ? <Chip tone="external">{cacheLabel(cacheState)}</Chip> : null}
        {retrievedAt ? (
          <span className="mono dim">Retrieved {formatDate(retrievedAt.slice(0, 10))}</span>
        ) : null}
        <div className="research-empty" style={{ marginTop: 10 }}>
          The registry was queried successfully and returned zero relevant studies for this subject.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="research-trials-meta">
        <Chip tone="muted">Query: {trials.query}</Chip>
        {cacheState ? <Chip tone="external">{cacheLabel(cacheState)}</Chip> : null}
        {retrievedAt ? (
          <span className="mono dim">Retrieved {formatDate(retrievedAt.slice(0, 10))}</span>
        ) : null}
      </div>
      {trials.trials.map((trial) => (
        <a
          key={trial.nctId}
          className="answer-item research-trial"
          href={trial.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          <div className="answer-item-label">
            <span className="dot external" />
            <span>{trial.title}</span>
            <Chip tone="external">{trial.nctId}</Chip>
            {trial.status ? <Chip tone="muted">{trial.status}</Chip> : null}
            {trial.phase ? <Chip tone="muted">{trial.phase}</Chip> : null}
            <Icon.Link size={12} />
          </div>
          <div className="answer-item-sub research-trial-meta">
            {[
              trial.studyType ? `Study type: ${trial.studyType}` : null,
              trial.location ? `Location: ${trial.location}` : null,
              trial.lastUpdate ? `Last update: ${formatDate(trial.lastUpdate)}` : null,
              `Source: ${trial.source}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </a>
      ))}
    </div>
  );
}

function SourceCard({ source }: { source: ExternalSource }) {
  return (
    <a className="answer-item research-source" href={source.url} target="_blank" rel="noreferrer noopener">
      <div className="answer-item-label">
        <span className="dot external" />
        <span>{source.title}</span>
        <Chip tone="external">{source.publisher}</Chip>
        <Chip tone="muted">{SOURCE_TYPE_LABEL[source.sourceType]}</Chip>
        <Icon.Link size={12} />
      </div>
      <div className="answer-item-sub">
        {source.verifiedContent ?? 'Source metadata only — no stored summary.'}
      </div>
      <div className="research-source-meta">
        <span className="mono dim">Retrieved {formatDate(source.retrievedAt)}</span>
        {source.publishedAt ? (
          <span className="mono dim">Published {formatDate(source.publishedAt)}</span>
        ) : null}
        {source.version ? <span className="mono dim">Version {source.version}</span> : null}
        <Chip tone="muted">{freshnessLabel(source.freshness)}</Chip>
        <Chip tone="muted">{source.status}</Chip>
      </div>
    </a>
  );
}

/**
 * Research Mode — a medical evidence workbench.
 *
 * Every number and claim comes from the current personal artifact or a real
 * external retrieval. Personal record and external evidence are never merged
 * into a single narrative.
 */
export function ResearchView() {
  const {
    graph,
    snapshot,
    asOf,
    derivations,
    questions,
    contradictions,
    quality,
    engine,
    aiContext,
    researchSeed,
    clearResearchSeed,
    clearAIContext,
  } = useStore();

  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (researchSeed !== null) {
      setQuestion(researchSeed);
      clearResearchSeed();
    }
  }, [researchSeed, clearResearchSeed]);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await runResearch({
        question,
        context: aiContext,
        graph,
        snapshot,
        asOf,
        artifactId: engine.identity.artifactId,
        derivations,
        questions,
        contradictions,
        quality,
        fetchImpl: (input, init) => fetch(input, { ...init, signal: controller.signal }),
      });
      const verifyErrors = verifyResearchResult(next, {
        question,
        context: aiContext,
        graph,
        snapshot,
        asOf,
        artifactId: engine.identity.artifactId,
        derivations,
        questions,
        contradictions,
        quality,
      });
      if (verifyErrors.length > 0) {
        setError(`Research result failed verification: ${verifyErrors.join('; ')}`);
      }
      setResult(next);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [
    question,
    aiContext,
    graph,
    snapshot,
    asOf,
    engine.identity.artifactId,
    derivations,
    questions,
    contradictions,
    quality,
  ]);

  const receipt = useMemo(() => (result ? researchReceipt(result) : null), [result]);

  const categoryTotals = useMemo(() => (result ? categoryCounts(result.sources) : null), [result]);

  const conceptChips = useMemo(() => {
    if (!result) return [];
    const keys = new Set(result.entityKeys);
    return graph.entities
      .filter(
        (entity) =>
          keys.has(entity.key) &&
          (entity.kind === 'condition' || entity.kind === 'medication' || entity.kind === 'measurement'),
      )
      .slice(0, 12);
  }, [result, graph.entities]);

  const counts = result?.personalCounts;

  return (
    <div className="view-inner research-view">
      <Panel
        title="What are you researching?"
        sub={`Personal statements are evaluated as of ${formatDate(asOf)}. External sources show published and retrieved dates separately.`}
      >
        <div className="research-ask">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void run();
              }
            }}
            placeholder="e.g. What does this A1c result mean? · What is documented about my potassium? · Find external information about semaglutide."
            rows={2}
          />
          <button type="button" className="btn is-primary" onClick={() => void run()} disabled={loading}>
            {loading ? <span className="spin" /> : <Icon.Research size={14} />}
            Research
          </button>
        </div>

        {aiContext ? (
          <div className="research-context">
            <Chip tone="info">
              {CONTEXT_KIND_LABEL[aiContext.kind]}: {aiContext.title}
            </Chip>
            <span className="muted">{aiContext.summary}</span>
            <button type="button" className="btn is-sm" onClick={clearAIContext}>
              Clear context
            </button>
          </div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 12 }}>
            <Notice tone="critical">{error}</Notice>
          </div>
        ) : null}
      </Panel>

      {result ? (
        <>
          <div className="grid grid-2 research-bases">
            <div className="research-base is-personal">
              <div className="research-base-head">
                <span className="dot ok" />
                <strong>Personal record</strong>
                <Chip tone="ok">as of {formatDate(result.asOf)}</Chip>
              </div>
              {counts ? (
                <p className="research-base-copy">
                  {plural(counts.documents, 'document')} · {plural(counts.facts, 'fact')} ·{' '}
                  {plural(counts.concepts, 'concept')} · {plural(counts.findings, 'finding')} ·{' '}
                  {plural(counts.questions, 'question')} · {plural(counts.edges, 'graph edge')}
                </p>
              ) : null}
              {conceptChips.length > 0 ? (
                <div className="research-chips">
                  {conceptChips.map((entity) => (
                    <Chip key={entity.key} tone="ok">
                      {entity.label}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="research-base is-external">
              <div className="research-base-head">
                <span className="dot external" />
                <strong>External evidence</strong>
                <Chip tone="external">{plural(result.sources.length, 'source')}</Chip>
              </div>
              {categoryTotals ? (
                <div className="research-chips">
                  {(Object.entries(categoryTotals) as Array<[SourceType, number]>)
                    .filter(([, count]) => count > 0)
                    .map(([kind, count]) => (
                      <Chip key={kind} tone="external">
                        {SOURCE_TYPE_LABEL[kind]} · {count}
                      </Chip>
                    ))}
                </div>
              ) : null}
              <p className="research-base-copy muted">
                Retrieved {formatDate(result.retrievedAt.slice(0, 10))}. External knowledge is never written as a
                personal fact.
              </p>
            </div>
          </div>

          <Panel title="What your record says" sub="Only personal artifact evidence">
            {result.personalEvidence.length === 0 ? (
              <div className="research-empty">
                The record cannot establish a statement about this subject as of {formatDate(result.asOf)}.
              </div>
            ) : (
              <div className="research-list">
                {result.personalEvidence.map((item) => (
                  <article key={item.id} className="research-item is-personal">
                    <div className="research-item-head">
                      <Chip tone="ok">{item.kind}</Chip>
                      <span className="mono dim">as of {formatDate(item.asOf)}</span>
                    </div>
                    <p>{item.statement}</p>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="What external sources say" sub="Only retrieved or verified registry content">
            {result.externalEvidence.length === 0 ? (
              <div className="research-empty">
                No verified external source in the registry is about the resolved concepts.
              </div>
            ) : (
              <div className="research-list">
                {result.externalEvidence.map((item) => {
                  const source = result.sources.find((entry) => entry.id === item.sourceId);
                  return (
                    <article key={`${item.sourceId}-${item.claim}`} className="research-item is-external">
                      <div className="research-item-head">
                        <Chip tone="external">{item.claimKind.replace(/_/g, ' ')}</Chip>
                        <Chip tone="muted">{cacheLabel(item.cacheState)}</Chip>
                        <span className="mono dim">Retrieved {formatDate(item.retrievedAt)}</span>
                        {item.publishedAt ? (
                          <span className="mono dim">Published {formatDate(item.publishedAt)}</span>
                        ) : null}
                      </div>
                      <p>{item.claim}</p>
                      <a href={item.url} target="_blank" rel="noreferrer noopener" className="research-link">
                        {source?.title ?? item.url}
                        <Icon.Link size={12} />
                      </a>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Where they intersect" sub="Explicit relationships only — shared words are not support">
            {result.links.length === 0 ? (
              <div className="research-empty">No documented relationship between personal evidence and external sources.</div>
            ) : (
              <div className="research-list">
                {result.links.map((link) => {
                  const personal = result.personalEvidence.find((item) => item.id === link.personalId);
                  const source = result.sources.find((item) => item.id === link.externalSourceId);
                  return (
                    <article key={`${link.personalId}-${link.externalSourceId}`} className="research-item">
                      <div className="research-item-head">
                        <Chip tone="info">{MATCH_LABEL[link.state]}</Chip>
                      </div>
                      <p className="muted">{link.because}</p>
                      <div className="research-intersect">
                        <span>{personal?.statement ?? link.personalId}</span>
                        <span className="research-intersect-arrow">↕</span>
                        <span>{source?.title ?? link.externalSourceId}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="What is still unknown" sub="Evidence gaps and unavailable information">
            {result.limitations.length === 0 && result.conflicts.length === 0 ? (
              <div className="research-empty">No additional limitations were recorded for this research action.</div>
            ) : (
              <ul className="research-limitations">
                {result.conflicts.map((line) => (
                  <li key={`conflict-${line}`}>
                    <strong>Conflict:</strong> {line}
                  </li>
                ))}
                {result.limitations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="ClinicalTrials.gov"
            sub="Live registry lookup from the current research subject — never a canned list"
          >
            <TrialsPanel trials={result.trials} />
          </Panel>

          <Panel title="Sources" sub="Actual sources used for this research action">
            {result.sources.length === 0 ? (
              <div className="research-empty">No external sources were attached to this research action.</div>
            ) : (
              <div className="research-list">
                {result.sources.map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
              </div>
            )}
          </Panel>

          {receipt ? (
            <Panel title="Research receipt" sub="Every field is computed from the result above">
              <dl className="research-receipt">
                <div>
                  <dt>Question</dt>
                  <dd>{receipt.question || '(context only)'}</dd>
                </div>
                <div>
                  <dt>Context</dt>
                  <dd>{receipt.context ?? 'none'}</dd>
                </div>
                <div>
                  <dt>Artifact</dt>
                  <dd className="mono">{receipt.artifactId}</dd>
                </div>
                <div>
                  <dt>As of</dt>
                  <dd>{formatDate(receipt.asOf)}</dd>
                </div>
                <div>
                  <dt>External sources queried</dt>
                  <dd>{receipt.sourcesQueried.join(', ')}</dd>
                </div>
                <div>
                  <dt>Sources used</dt>
                  <dd>{receipt.sourcesUsed.length > 0 ? receipt.sourcesUsed.join(', ') : 'none'}</dd>
                </div>
                <div>
                  <dt>Retrieved</dt>
                  <dd>{receipt.retrievedAt}</dd>
                </div>
                <div>
                  <dt>Model used</dt>
                  <dd>{receipt.modelUsed}</dd>
                </div>
                <div className="research-receipt-wide">
                  <dt>Limitations</dt>
                  <dd>
                    {receipt.limitations.length > 0 ? (
                      <ul>
                        {receipt.limitations.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      'none'
                    )}
                  </dd>
                </div>
              </dl>
            </Panel>
          ) : null}
        </>
      ) : (
        <Panel title="Research workspace" sub="Ask a question or select an object from another view to begin">
          <div className="research-empty">
            Examples: &ldquo;What does this A1c result mean?&rdquo; · &ldquo;What is documented about my potassium?&rdquo; ·
            &ldquo;Find external information about semaglutide.&rdquo;
          </div>
        </Panel>
      )}
    </div>
  );
}
