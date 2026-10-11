import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import { EngineStatusPill } from '../components/EngineStatusPill';
import { ArtifactInspector } from '../components/ArtifactInspector';
import { AssistantAvatar, MessageContent } from '../components/ChatMessage';
import { ReceiptView } from '../components/Receipt';
import { openingQuestions } from '../chat/conversation';
import type { ChatAction, ChatContext } from '../chat/conversation';
import {
  contextChipLabel,
  gatewayConverse,
  initialConversationState,
  type ConversationState,
  type GatewayReply,
} from '../ai/gateway';
import { loadLlmConfig, saveLlmConfig, type LlmConfig } from '../explain/config';
import { probeLlm, type LlmProbe } from '../explain/remote';
import type { StreamStatus } from '../explain/stream';
import { PROVENANCE_LABEL, PROVENANCE_NOTE, provenanceOf } from '../explain/types';
import { formatDate } from '../engine/text/normalize';
import { CONTEXT_KIND_LABEL, contextQuestions, validateAIContext } from '../ai/context';

/* ------------------------------------------------------------------ */
/* Medical Memory AI                                                   */
/*                                                                    */
/* Open WebUI (or any configured provider) is the conversational layer.  */
/* Medical Memory's engine is the truth layer for personal records.        */
/* The gateway routes between general chat, record questions, and        */
/* external research — one continuous conversation, not separate modes.  */
/* ------------------------------------------------------------------ */

interface Turn {
  id: number;
  question: string;
  reply: GatewayReply | null;
  error: string | null;
  streamingText: string;
  status: StreamStatus | null;
}

const STATUS_LABEL: Record<StreamStatus, string> = {
  thinking: 'Checking your record…',
  researching: 'Reviewing external sources…',
  generating: 'Writing the explanation…',
  complete: 'Complete',
  error: 'Something went wrong',
};

const ROUTE_LABEL = {
  general: 'General conversation',
  record: 'From your record',
  research: 'External information',
} as const;

export function ChatView() {
  const store = useStore();
  const {
    graph,
    derivations,
    snapshot,
    changes,
    contradictions,
    quality,
    engine,
    asOf,
    proof,
    openEvidence,
    openProof,
    setView,
    setFocusDoc,
    aiContext,
    mobileNavOpen,
    setMobileNavOpen,
    clearAIContext,
    questions,
  } = store;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>(
    initialConversationState,
  );
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const [useModel, setUseModel] = useState(true);
  const [config, setConfig] = useState<LlmConfig>(() => loadLlmConfig());
  const [probe, setProbe] = useState<LlmProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const context: ChatContext = useMemo(() => {
    const focus =
      aiContext && (aiContext.kind === 'finding' || aiContext.kind === 'derivation')
        ? aiContext.derivationIds[0] ?? aiContext.id
        : proof?.derivationId;
    return {
      graph,
      derivations,
      identity: engine.identity,
      snapshot,
      changes,
      contradictions,
      quality,
      verification: engine.verification,
      asOf,
      ...(focus ? { focus } : {}),
    };
  }, [graph, derivations, engine, snapshot, changes, contradictions, quality, asOf, proof, aiContext]);

  const chip = useMemo(
    () => contextChipLabel(aiContext, asOf, formatDate),
    [aiContext, asOf],
  );

  const openings = useMemo(
    () => (aiContext ? contextQuestions(aiContext) : openingQuestions(context)),
    [aiContext, context],
  );

  const contextValidation = useMemo(
    () => (aiContext ? validateAIContext(aiContext, graph, derivations) : null),
    [aiContext, graph, derivations],
  );

  useEffect(() => {
    if (turns.length === 0) return;
    const node = endRef.current;
    if (typeof node?.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [turns]);

  useEffect(() => {
    if (useModel && !probe) void runProbe();
  }, [useModel]);

  const resizeComposer = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      const id = (nextId.current += 1);
      setTurns((previous) => [
        ...previous,
        { id, question: trimmed, reply: null, error: null, streamingText: '', status: 'thinking' },
      ]);
      setDraft('');
      setBusy(true);

      try {
        const { reply, nextState } = await gatewayConverse(
          {
            message: trimmed,
            chatContext: context,
            aiContext,
            conversationState,
            llmConfig: config,
            useModel,
            questions,
          },
          {
            onStatus: (status) => {
              setTurns((previous) =>
                previous.map((turn) => (turn.id === id ? { ...turn, status } : turn)),
              );
            },
            onChunk: (text) => {
              setTurns((previous) =>
                previous.map((turn) =>
                  turn.id === id ? { ...turn, streamingText: turn.streamingText + text } : turn,
                ),
              );
            },
          },
        );
        setConversationState(nextState);
        setTurns((previous) =>
          previous.map((turn) =>
            turn.id === id ? { ...turn, reply, status: 'complete', streamingText: '' } : turn,
          ),
        );
      } catch (error) {
        setTurns((previous) =>
          previous.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  error: error instanceof Error ? error.message : String(error),
                  status: 'error',
                }
              : turn,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, context, aiContext, conversationState, config, useModel, derivations, questions],
  );

  const runAction = useCallback(
    (action: ChatAction) => {
      if (action.kind === 'proof' && action.derivationId) {
        openProof(action.derivationId);
        return;
      }
      if (action.kind === 'evidence' && action.factIds?.length) {
        openEvidence({
          title: action.label,
          subtitle: action.detail,
          factIds: action.factIds,
          ...(action.docIds?.[0] ? { docId: action.docIds[0] } : {}),
        });
        return;
      }
      if (action.kind === 'view' && action.view) setView(action.view);
    },
    [openProof, openEvidence, setView],
  );

  const runProbe = async () => {
    setProbing(true);
    try {
      setProbe(await probeLlm(config));
    } finally {
      setProbing(false);
    }
  };

  const firstName = graph.patient.name?.split(' ')[0];

  return (
    <div className="chat">
      <header className="chat-toolbar">
        <button
          type="button"
          className="nav-toggle"
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
        >
          <Icon.Menu size={18} />
        </button>

        <div className="chat-toolbar-main">
          <h1 className="chat-toolbar-title">Medical Memory AI</h1>
          <p className="chat-toolbar-meta">
            {firstName ? `Hi, ${firstName} · ` : ''}
            as of {formatDate(asOf)} · {graph.documents.length} docs · {graph.facts.length} facts
          </p>
        </div>

        <EngineStatusPill status={engine} compact onOpen={() => setInspecting(true)} />
      </header>

      {inspecting ? (
        <ArtifactInspector
          status={engine}
          graph={graph}
          derivations={derivations}
          onOpenProof={(derivationId) => {
            setInspecting(false);
            setView('inference');
            openProof(derivationId);
          }}
          onOpenDocument={(docId) => {
            setInspecting(false);
            setView('records');
            setFocusDoc(docId);
          }}
          onClose={() => setInspecting(false)}
        />
      ) : null}

      <div className="chat-body">
        <div className="chat-log">
        {turns.length === 0 && (
          <div className="chat-empty">
            <p className="chat-empty-lede">
              Say hi, ask a general question, or ask about your health record. Every personal answer
              shows its sources and what it cannot tell you.
            </p>
            <div className="chat-openings">
              {['Hi', ...openings.slice(0, 4)].map((question) => (
                <button
                  key={question}
                  type="button"
                  className="chat-opening"
                  onClick={() => void ask(question)}
                  disabled={busy}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <div className="chat-turn" key={turn.id}>
            <div className="chat-row is-user">
              <div className="chat-bubble is-user">{turn.question}</div>
            </div>

            {!turn.reply && !turn.error && (
              <div className="chat-row is-assistant">
                <AssistantAvatar />
                <div className="chat-bubble is-assistant is-pending">
                  <div className="chat-thinking">
                    <span className="chat-thinking-dot" />
                    <span>{turn.status ? STATUS_LABEL[turn.status] : 'Thinking…'}</span>
                  </div>
                  {turn.streamingText ? (
                    <p className="chat-stream-preview">{turn.streamingText}</p>
                  ) : null}
                </div>
              </div>
            )}

            {turn.error && (
              <div className="chat-row is-assistant">
                <AssistantAvatar />
                <div className="chat-error">{turn.error}</div>
              </div>
            )}

            {turn.reply && (
              <div className="chat-row is-assistant is-reply">
                <div className={`chat-reply is-${turn.reply.route}`}>
                  {/* The answer is the centrepiece: it leads, and nothing else competes. */}
                  <div className="chat-answer">
                    {turn.reply.sections && turn.reply.route !== 'general' ? (
                      <AnswerSections
                        sections={turn.reply.sections}
                        route={turn.reply.route}
                        sourceLabels={turn.reply.sources.map((source) => source.label)}
                        limitation={turn.reply.notAnswered}
                      />
                    ) : (
                      <MessageContent paragraphs={turn.reply.paragraphs} hero />
                    )}
                  </div>

                  {/* Provenance, compact and muted — under the answer, never beside it. */}
                  <div className="chat-reply-meta">
                    <span
                      className={`chat-badge is-${provenanceOf(turn.reply)}`}
                      title={PROVENANCE_NOTE[provenanceOf(turn.reply)]}
                    >
                      {PROVENANCE_LABEL[provenanceOf(turn.reply)]}
                    </span>
                    <span className="chat-route-badge">{ROUTE_LABEL[turn.reply.route]}</span>
                    {turn.reply.intent !== 'greeting' && (
                      <span className="chat-reply-intent">{turn.reply.intent.replace(/_/g, ' ')}</span>
                    )}
                  </div>

                  {turn.reply.actions.length > 0 && (
                    <div className="chat-actions">
                      {turn.reply.actions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          className="chat-action"
                          onClick={() => runAction(action)}
                        >
                          <Icon.Play size={11} />
                          <span className="chat-action-body">
                            <span className="chat-action-label">{action.label}</span>
                            <span className="chat-action-detail">{action.detail}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {turn.reply.sources.length > 0 && (
                    <div className="chat-sources">
                      <div className="chat-sources-head">
                        {turn.reply.sources.length} source
                        {turn.reply.sources.length === 1 ? '' : 's'}
                      </div>
                      {turn.reply.sources.map((source) => (
                        <button
                          key={`${source.kind}-${source.id}`}
                          type="button"
                          className="chat-source"
                          disabled={source.factIds.length === 0}
                          onClick={() =>
                            openEvidence({
                              title: source.label,
                              subtitle: source.detail,
                              factIds: source.factIds,
                              ...(source.docIds[0] ? { docId: source.docIds[0] } : {}),
                            })
                          }
                        >
                          <span className="chat-source-kind">{source.kind}</span>
                          <span className="chat-source-body">
                            <span className="chat-source-label">{source.label}</span>
                            {source.detail && (
                              <span className="chat-source-detail">{source.detail}</span>
                            )}
                          </span>
                          {source.factIds.length > 0 && (
                            <span className="chat-source-go">exact characters →</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {turn.reply.notAnswered && (
                    <div className="chat-not-answered">
                      <Icon.Warning size={13} />
                      <div>
                        <strong>What this does not establish</strong>
                        <p>{turn.reply.notAnswered}</p>
                      </div>
                    </div>
                  )}

                  <ReceiptView receipt={turn.reply.receipt} />

                  {turn.reply.followUps.length > 0 && (
                    <div className="chat-followups">
                      <span className="chat-followups-label">Ask next</span>
                      {turn.reply.followUps.map((question) => (
                        <button
                          key={question}
                          type="button"
                          className="chat-followup"
                          onClick={() => void ask(question)}
                          disabled={busy}
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
        </div>

        <div className="chat-dock">
        <div className="chat-dock-inner">
          <div className="chat-dock-meta">
            <span className={`chat-dock-context is-${chip.mode}`}>
              {chip.mode === 'general' ? 'General conversation' : chip.label}
            </span>
            {aiContext && contextValidation?.valid !== false ? (
              <div className="chat-dock-context-chip">
                <span>{CONTEXT_KIND_LABEL[aiContext.kind]}</span>
                <strong>{aiContext.title}</strong>
                <button type="button" className="chat-dock-context-clear" onClick={clearAIContext}>
                  <Icon.Close size={12} />
                </button>
              </div>
            ) : null}
          </div>

          {aiContext && contextValidation && !contextValidation.valid ? (
            <div className="chat-context-stale">
              <Icon.Warning size={14} />
              <span>This context is no longer available in the current artifact.</span>
              <button type="button" className="btn is-sm is-ghost" onClick={clearAIContext}>
                Dismiss
              </button>
            </div>
          ) : null}

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!busy && draft.trim()) void ask(draft);
                }
              }}
              placeholder="Message Medical Memory AI…"
              disabled={busy}
              rows={1}
              aria-label="Message Medical Memory AI"
            />
            <div className="chat-dock-toolbar">
              <div className="chat-dock-toolbar-left">
                <label className="chat-dock-model">
                  <Icon.Research size={13} />
                  <select
                    value={config.model}
                    onChange={(event) => setConfig(saveLlmConfig({ model: event.target.value }))}
                    aria-label="Model"
                  >
                    {probe?.models.length ? (
                      probe.models.map((name) => (
                        <option key={name} value={name.split(':')[0]}>
                          {name}
                        </option>
                      ))
                    ) : (
                      <option value={config.model}>{config.model}</option>
                    )}
                  </select>
                </label>
                <span
                  className={`chat-dock-status is-${probe?.ok ? 'ok' : probe ? 'bad' : 'idle'}`}
                  title={probe?.message ?? 'Connection not tested yet'}
                >
                  <span className="chat-dock-status-dot" />
                  {probing
                    ? 'Connecting…'
                    : probe?.ok
                      ? 'Connected'
                      : probe
                        ? 'AI explanation unavailable · Engine answer shown'
                        : 'Engine only'}
                </span>
                <button
                  type="button"
                  className="chat-dock-settings-btn"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  <Icon.Settings size={14} />
                </button>
              </div>
              <button
                type="submit"
                className="chat-send"
                disabled={busy || draft.trim().length === 0}
                aria-label="Send message"
              >
                {busy ? <span className="spin" /> : <Icon.Play size={14} />}
              </button>
            </div>
          </form>

          {settingsOpen ? (
            <div className="chat-dock-settings">
              <label className="chat-dock-setting">
                <input
                  type="checkbox"
                  checked={useModel}
                  onChange={(event) => {
                    setUseModel(event.target.checked);
                    if (event.target.checked && !probe) void runProbe();
                  }}
                />
                <span>Use language model (Open WebUI / Ollama)</span>
              </label>
              <label className="chat-dock-setting">
                <span>Protocol</span>
                <select
                  value={config.protocol}
                  onChange={(event) =>
                    setConfig(
                      saveLlmConfig({
                        protocol: event.target.value === 'open-webui' ? 'open-webui' : 'openai',
                      }),
                    )
                  }
                >
                  <option value="openai">OpenAI-compatible</option>
                  <option value="open-webui">Open WebUI</option>
                </select>
              </label>
              <label className="chat-dock-setting">
                <span>Model name</span>
                <input
                  value={config.model}
                  onChange={(event) => setConfig(saveLlmConfig({ model: event.target.value }))}
                  placeholder="llama3.2"
                />
              </label>
              <button type="button" className="chat-dock-test" onClick={() => void runProbe()} disabled={probing}>
                {probing ? 'Testing…' : 'Test connection'}
              </button>
              {probe ? <p className="chat-dock-settings-note">{probe.message}</p> : null}
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sectioned answers, restructured for one hierarchy: one clear answer first,
 * the record's own words second, external material and open questions last.
 *
 * All content still comes from the gateway's sections. This changes the reading
 * order only: the answer keeps hero treatment via `MessageContent hero`, and the
 * record quote is a receipt-like block rather than a peer bullet list. It also
 * shows each concept once: for record routes the section builder echoes the
 * source labels and the standalone limitation into `fromRecord`/`unclear`, so
 * those lines are hidden when the dedicated sources/limitations blocks below
 * already show them.
 */
function AnswerSections({
  sections,
  route,
  sourceLabels,
  limitation,
}: {
  sections: NonNullable<GatewayReply['sections']>;
  route: GatewayReply['route'];
  /** Source labels already rendered in the dedicated sources block. */
  sourceLabels: string[];
  /** Limitation already rendered in the dedicated limitations block. */
  limitation: string | null;
}) {
  const normalizedSources = useMemo(
    () => new Set(sourceLabels.map((label) => label.trim())),
    [sourceLabels],
  );
  const recordLines = sections.fromRecord.filter((line) => !normalizedSources.has(line.trim()));
  const unclearLines = sections.unclear.filter((line) => limitation === null || line !== limitation);

  return (
    <div className="chat-sections">
      <section className="chat-section-answer">
        <h4 className="chat-section-eyebrow">Answer</h4>
        <MessageContent paragraphs={sections.answer} hero />
      </section>
      {recordLines.length > 0 && (
        <section className="chat-record-quote" aria-label="What the record actually says">
          <h4 className="chat-section-eyebrow">What the record actually says</h4>
          <ul>
            {recordLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      {sections.external.length > 0 && route === 'research' && (
        <section className="chat-section-external">
          <h4 className="chat-section-eyebrow">External information</h4>
          <ul>
            {sections.external.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      {unclearLines.length > 0 && (
        <section className="chat-section-unclear">
          <h4 className="chat-section-eyebrow">What remains unclear</h4>
          <ul>
            {unclearLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

