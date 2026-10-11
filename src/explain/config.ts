/* ------------------------------------------------------------------ */
/* Where the language model lives                                      */
/*                                                                    */
/* One place decides, and it decides in this order:                     */
/*                                                                    */
/*   1. what the reader chose in the interface (localStorage)           */
/*   2. what the build was configured with (VITE_LLM_*)                 */
/*   3. the defaults below                                              */
/*                                                                    */
/* The default base URL is `/llm`, which is a path on *this* origin. In  */
/* development Vite proxies it to a local Ollama. That is deliberate:    */
/* the browser never makes a cross-origin request, so nothing has to be  */
/* opened up for the model to work. A reader who wants to point at a     */
/* different endpoint can, and the interface says what that means.       */
/*                                                                    */
/* Nothing here is medical. This module holds a URL and a model name.    */
/* ------------------------------------------------------------------ */

export type LlmProtocol = 'openai' | 'open-webui';

export interface LlmConfig {
  /**
   * Which wire protocol the endpoint speaks.
   *
   * `openai` covers Ollama, vLLM, LM Studio, llama.cpp and anything else that
   * implements the OpenAI chat-completions shape. `open-webui` is Open WebUI,
   * which is OpenAI-compatible but under a different path.
   */
  protocol: LlmProtocol;
  /** Base URL, without the path. `/llm` means the dev proxy on this origin. */
  baseUrl: string;
  /** Which model to ask for. */
  model: string;
  /** Bearer token, for an endpoint that wants one. */
  apiKey?: string;
  timeoutMs: number;
}

export const LLM_STORAGE_KEY = 'medical-memory.llm.v1';

/**
 * The defaults.
 *
 * `llama3.2` and a local endpoint, because that is the shortest path from a
 * fresh checkout to a working explainer, and because a local model means no
 * patient text leaves the machine.
 */
export const DEFAULT_LLM: LlmConfig = {
  protocol: 'openai',
  baseUrl: '/llm',
  model: 'llama3.2',
  timeoutMs: 60000,
};

const trim = (value: string) => value.replace(/\/+$/, '');

/** The path a chat completion is posted to. */
export function chatPath(config: LlmConfig): string {
  return config.protocol === 'openai'
    ? `${trim(config.baseUrl)}/v1/chat/completions`
    : `${trim(config.baseUrl)}/api/chat/completions`;
}

/** The path a model list is read from, for the connection test. */
export function modelsPath(config: LlmConfig): string {
  return config.protocol === 'openai'
    ? `${trim(config.baseUrl)}/v1/models`
    : `${trim(config.baseUrl)}/api/models`;
}

function fromEnv(): Partial<LlmConfig> {
  // `import.meta.env` is absent outside a Vite build (tests, node scripts).
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const protocol = env.VITE_LLM_PROTOCOL;
  const timeout = env.VITE_LLM_TIMEOUT_MS;

  return {
    ...(protocol === 'openai' || protocol === 'open-webui' ? { protocol } : {}),
    ...(env.VITE_LLM_BASE_URL ? { baseUrl: env.VITE_LLM_BASE_URL } : {}),
    ...(env.VITE_LLM_MODEL ? { model: env.VITE_LLM_MODEL } : {}),
    ...(env.VITE_LLM_API_KEY ? { apiKey: env.VITE_LLM_API_KEY } : {}),
    ...(timeout && Number.isFinite(Number(timeout)) ? { timeoutMs: Number(timeout) } : {}),
  };
}

/** The config in force: a saved choice over the build's over the defaults. */
export function loadLlmConfig(): LlmConfig {
  let saved: Partial<LlmConfig> = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LLM_STORAGE_KEY) : null;
    if (raw) saved = JSON.parse(raw) as Partial<LlmConfig>;
  } catch {
    /* An unreadable override is not worth failing a page load over. */
  }

  const merged = { ...DEFAULT_LLM, ...fromEnv(), ...saved };
  return {
    protocol: merged.protocol === 'open-webui' ? 'open-webui' : 'openai',
    baseUrl: merged.baseUrl?.trim() || DEFAULT_LLM.baseUrl,
    model: merged.model?.trim() || DEFAULT_LLM.model,
    timeoutMs: Number(merged.timeoutMs) > 0 ? Number(merged.timeoutMs) : DEFAULT_LLM.timeoutMs,
    ...(merged.apiKey ? { apiKey: merged.apiKey } : {}),
  };
}

/** Remember a choice, and return what is now in force. */
export function saveLlmConfig(patch: Partial<LlmConfig>): LlmConfig {
  const next = { ...loadLlmConfig(), ...patch };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* Private mode. The choice applies to this page and no further. */
  }
  return next;
}

export function clearLlmConfig(): LlmConfig {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LLM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return loadLlmConfig();
}

/** True when the config still points at the local proxy rather than somewhere chosen. */
export function isDefaultEndpoint(config: LlmConfig): boolean {
  return config.baseUrl === DEFAULT_LLM.baseUrl;
}
