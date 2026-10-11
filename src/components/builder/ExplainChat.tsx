import { useMemo, useRef, useState } from 'react';
import type { BuildArtifact } from '../../builder/types';
import type { Explanation, ExplainerBackend } from '../../explain/types';
import {
  EXPLAINER_QUESTIONS,
  PROVENANCE_LABEL,
  PROVENANCE_NOTE,
  provenanceOf,
} from '../../explain/types';
import { GroundedExplainer } from '../../explain/grounded';
import {
  clearLlmConfig,
  loadLlmConfig,
  saveLlmConfig,
  type LlmConfig,
} from '../../explain/config';
import { probeLlm, RemoteExplainer, type LlmProbe } from '../../explain/remote';
import { Icon } from '../Icon';

/* ------------------------------------------------------------------ */
/* The explainer surface                                               */
/*                                                                    */
/* A chat, because that is the interaction people expect, and because   */
/* a conversation is a better shape for "why did this appear" than a    */
/* list of findings. What makes it different from a chatbot is what it  */
/* is allowed to say: the backend is handed the proof and nothing else, */
/* and the sources under every answer come from the engine rather than  */
/* from the text.                                                       */
/*                                                                    */
/* Engine-only is the default, and stays the default. A language model  */
/* is something the reader turns on, and when they do the interface     */
/* tells them what changed and whether the endpoint answered.           */
/* ------------------------------------------------------------------ */

/**
 * The backend used when the caller does not supply one.
 *
 * Constructed here rather than passed in from above so that the explainer engine
 * travels with the surface: the builder does not import it, which keeps it out
 * of the initial bundle.
 */
const DEFAULT_BACKEND: ExplainerBackend = new GroundedExplainer();

interface ExplainChatProps {
  artifact: BuildArtifact | null;
  /**
   * Swap in a different explainer. `RemoteExplainer` implements the same
   * interface; the surface does not change, only the badge does.
   */
  backend?: ExplainerBackend;
  /** The derivation the reader has open, so "why" resolves to it. */
  focus?: string;
  onOpenEvidence?: (factIds: string[], docIds: string[]) => void;
  /** False to hide the model controls entirely, for an embedded surface. */
  allowModel?: boolean;
  /**
   * Take the reader to the full conversation.
   *
   * The panel is a good place to ask one question about the finding in front of
   * you. It is a poor place to have a conversation, so it hands off rather than
   * growing.
   */
  onOpenChat?: () => void;
}

interface Turn {
  id: number;
  question: string;
  answer: Explanation | null;
  error: string | null;
}

/** Render `**bold**` without pulling in a markdown parser. */
function Paragraph({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="explain-para">
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

export function ExplainChat({
  artifact,
  backend,
  focus,
  onOpenEvidence,
  allowModel = true,
  onOpenChat,
}: ExplainChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);

  /** Off by default. The engine needs no setup and cannot be unreachable. */
  const [useModel, setUseModel] = useState(false);
  const [config, setConfig] = useState<LlmConfig>(() => loadLlmConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [probe, setProbe] = useState<LlmProbe | null>(null);
  const [probing, setProbing] = useState(false);

  /*
   * The backend in force.
   *
   * A caller-supplied backend wins outright — that is how a test or an embed
   * pins the behaviour. Otherwise the reader's choice decides, and the default
   * is the engine.
   */
  const active: ExplainerBackend = useMemo(() => {
    if (backend) return backend;
    if (!useModel) return DEFAULT_BACKEND;
    return new RemoteExplainer(config);
  }, [backend, useModel, config]);

  const runProbe = async (candidate: LlmConfig = config) => {
    setProbing(true);
    try {
      setProbe(await probeLlm(candidate));
    } finally {
      setProbing(false);
    }
  };

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || !artifact || busy) return;

    const id = (nextId.current += 1);
    setTurns((previous) => [...previous, { id, question: trimmed, answer: null, error: null }]);
    setDraft('');
    setBusy(true);

    try {
      const answer = await active.explain({
        question: trimmed,
        graph: artifact.graph,
        derivations: artifact.derivations,
        identity: artifact.identity,
        focus,
      });
      setTurns((previous) =>
        previous.map((turn) => (turn.id === id ? { ...turn, answer } : turn)),
      );
    } catch (error) {
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === id
            ? { ...turn, error: error instanceof Error ? error.message : String(error) }
            : turn,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="explain">
      <div className="explain-head">
        <span className="explain-title">
          <Icon.Ask size={14} />
          Ask the artifact
        </span>
        <span className={`explain-backend${active.generated ? ' is-generated' : ' is-grounded'}`}>
          {active.generated ? 'model prose' : 'engine only'}
        </span>
        <span className="explain-backend-label">{active.label}</span>
      </div>

      {allowModel && !backend && (
        <div className="explain-model">
          <label className="explain-model-toggle">
            <input
              type="checkbox"
              checked={useModel}
              onChange={(event) => {
                setUseModel(event.target.checked);
                if (event.target.checked && !probe) void runProbe();
              }}
            />
            <span>
              Rewrite answers with a language model
              <span className="explain-model-hint">
                {useModel
                  ? 'The engine still answers first. The model only rewrites its wording.'
                  : 'Off. The engine answers on its own, with no network and no setup.'}
              </span>
            </span>
          </label>

          {useModel && (
            <div className="explain-model-controls">
              <button
                type="button"
                className="explain-model-link"
                onClick={() => setSettingsOpen((open) => !open)}
                aria-expanded={settingsOpen}
              >
                {settingsOpen ? 'Hide settings' : 'Settings'}
              </button>
              <button
                type="button"
                className="explain-model-link"
                onClick={() => void runProbe()}
                disabled={probing}
              >
                {probing ? 'Testing…' : 'Test connection'}
              </button>

              {probe && (
                <span className={`explain-model-status is-${probe.ok ? 'ok' : 'bad'}`}>
                  {probe.ok ? <Icon.Check size={11} /> : <Icon.Warning size={11} />}
                  {probe.message}
                  {probe.ok && !probe.modelPresent && (
                    <> The model “{config.model}” was not in the list.</>
                  )}
                </span>
              )}
            </div>
          )}

          {useModel && settingsOpen && (
            <div className="explain-model-settings">
              <label>
                <span>Endpoint</span>
                <input
                  value={config.baseUrl}
                  onChange={(event) => setConfig(saveLlmConfig({ baseUrl: event.target.value }))}
                  placeholder="/llm"
                />
              </label>
              <label>
                <span>Model</span>
                <input
                  value={config.model}
                  onChange={(event) => setConfig(saveLlmConfig({ model: event.target.value }))}
                  placeholder="llama3.2"
                  list="explain-model-list"
                />
                {probe && probe.models.length > 0 && (
                  <datalist id="explain-model-list">
                    {probe.models.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                )}
              </label>
              <label>
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
                  <option value="openai">OpenAI-compatible (Ollama, vLLM, LM Studio)</option>
                  <option value="open-webui">Open WebUI</option>
                </select>
              </label>
              <p className="explain-model-note">
                <code>/llm</code> is this app&rsquo;s own origin, forwarded to your local model by the
                dev server, so nothing needs to be opened up. Reset to{' '}
                <button
                  type="button"
                  className="explain-model-link is-inline"
                  onClick={() => {
                    setConfig(clearLlmConfig());
                    setProbe(null);
                  }}
                >
                  the default
                </button>
                .
              </p>
            </div>
          )}
        </div>
      )}

      <p className="explain-note">{active.note}</p>

      <button type="button" className="explain-open-chat" onClick={() => onOpenChat?.()}>
        <Icon.Ask size={13} />
        Open the full conversation
      </button>

      <div className="explain-log">
        {turns.length === 0 && (
          <div className="explain-empty">
            <p>
              This is not a chatbot. It can only talk about findings the engine already produced,
              and every answer carries the spans it rests on.
            </p>
            <div className="explain-questions">
              {EXPLAINER_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="explain-question"
                  onClick={() => void ask(question)}
                  disabled={!artifact || busy}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <div className="explain-turn" key={turn.id}>
            <div className="explain-ask">{turn.question}</div>

            {turn.error && <div className="explain-error">{turn.error}</div>}

            {!turn.answer && !turn.error && (
              <div className="explain-thinking">
                <span className="explain-thinking-dot" />
                Reading the proof
              </div>
            )}

            {turn.answer && (
              <div className="explain-answer">
                {(() => {
                  const provenance = provenanceOf(turn.answer);
                  return (
                    <div className={`explain-provenance is-${provenance}`}>
                      <span className="explain-provenance-badge">
                        {PROVENANCE_LABEL[provenance]}
                      </span>
                      <span className="explain-provenance-note">
                        {PROVENANCE_NOTE[provenance]}
                      </span>
                    </div>
                  );
                })()}

                <div className="explain-answer-body">
                  {turn.answer.paragraphs.map((paragraph, index) => (
                    <Paragraph key={index} text={paragraph} />
                  ))}
                </div>

                {turn.answer.notAnswered && (
                  <div className="explain-unanswered">
                    <strong>Not answered.</strong> {turn.answer.notAnswered}
                  </div>
                )}

                {turn.answer.sources.length > 0 && (
                  <div className="explain-sources">
                    <div className="explain-sources-head">
                      <span className="mono">{turn.answer.sources.length} sources</span>
                      <span className="dim">
                        intent: {turn.answer.intent} ·{' '}
                        {turn.answer.generated ? 'wording by a model' : 'wording by the engine'}
                      </span>
                    </div>
                    {turn.answer.sources.map((source) => (
                      <button
                        key={`${source.kind}-${source.id}`}
                        type="button"
                        className="explain-source"
                        onClick={() => onOpenEvidence?.(source.factIds, source.docIds)}
                        disabled={source.factIds.length === 0 || !onOpenEvidence}
                      >
                        <span className="explain-source-kind">{source.kind}</span>
                        <span className="explain-source-label">{source.label}</span>
                        {source.detail && (
                          <span className="explain-source-detail">{source.detail}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="explain-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            artifact ? 'Ask about a finding, its evidence, or this artifact' : 'Waiting for a build'
          }
          disabled={!artifact || busy}
          aria-label="Ask about the artifact"
        />
        <button type="submit" className="btn is-primary is-sm" disabled={!artifact || busy}>
          {busy ? <span className="spin" /> : <Icon.Play size={12} />}
          Ask
        </button>
      </form>
    </div>
  );
}
