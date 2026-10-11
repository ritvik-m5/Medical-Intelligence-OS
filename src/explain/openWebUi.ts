import { GroundedExplainer } from './grounded';
import type {
  Explanation,
  ExplanationRequest,
  ExplainerBackend,
} from './types';

/* ------------------------------------------------------------------ */
/* The Open WebUI adapter                                              */
/*                                                                    */
/* Open WebUI exposes an OpenAI-compatible endpoint, so this is a thin  */
/* client for it. The interesting part is not the transport, it is the  */
/* shape of the exchange.                                               */
/*                                                                    */
/* The model is never asked a question about the patient. It is asked  */
/* to rewrite an answer the engine has already produced. The prompt      */
/* contains the proof and nothing else, and the sources returned to the  */
/* interface come from the engine rather than from the model.            */
/*                                                                    */
/* That is the whole design: even if the model produces something odd,   */
/* the citations underneath it are still the ones the engine emitted,    */
/* and the interface labels the prose as generated. There is no path     */
/* from this code back into the graph.                                   */
/* ------------------------------------------------------------------ */

export interface OpenWebUiConfig {
  /** Where Open WebUI is running, e.g. `http://localhost:3000`. */
  baseUrl: string;
  /** Optional bearer token, for a secured deployment. */
  apiKey?: string;
  /** Which model Open WebUI should route to. */
  model: string;
  /** Give up after this long. */
  timeoutMs?: number;
}

const SYSTEM_PROMPT = [
  'You rewrite a structured medical-record finding as plain prose.',
  '',
  'You must not add any claim, finding, diagnosis, recommendation, probability or number that is not present in the input you are given.',
  'You must not remove or soften a statement about what the engine does not conclude.',
  'You must not answer a clinical question. If the input does not contain something, say that it does not.',
  'You are explaining a conclusion that has already been reached by a deterministic engine. Your job is readability, not inference.',
].join('\n');

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/**
 * Explain a proof by asking a model to rewrite it.
 *
 * The engine's answer is produced first, in full. Only then is it handed to the
 * model as the entire context. If the endpoint is unreachable or answers with
 * something unusable, the engine's own answer is returned instead, with a note
 * saying so — a network failure must never look like a missing finding.
 */
export class OpenWebUiExplainer implements ExplainerBackend {
  readonly id = 'open-webui';
  readonly label = 'Open WebUI';
  readonly generated = true;
  readonly requiresNetwork = true;
  readonly note =
    'Prose rewritten by a language model from the engine\'s own answer. The citations are the engine\'s; the wording is the model\'s. Nothing here can add a finding.';

  private readonly grounded = new GroundedExplainer();

  constructor(private readonly config: OpenWebUiConfig) {}

  async explain(request: ExplanationRequest): Promise<Explanation> {
    // 1. The engine answers first, completely and on its own.
    const grounded = await this.grounded.explain(request);

    // 2. The model is given that answer as its entire world.
    const context = grounded.paragraphs.join('\n\n');

    try {
      const content = await this.complete(context);
      if (!content.trim()) throw new Error('The model returned an empty answer.');

      return {
        // The model's prose, split on blank lines.
        paragraphs: content
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean),
        // The engine's citations, not the model's.
        sources: grounded.sources,
        notAnswered: grounded.notAnswered,
        backend: this.id,
        generated: true,
        intent: grounded.intent,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...grounded,
        backend: this.id,
        generated: false,
        paragraphs: [
          ...grounded.paragraphs,
          `**The language model was not used.** ${message} The answer above is the engine's own, unchanged.`,
        ],
      };
    }
  }

  private async complete(context: string): Promise<string> {
    const base = this.config.baseUrl.replace(/\/+$/, '');
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30000)
      : null;

    try {
      const response = await fetch(`${base}/api/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: context },
          ],
          temperature: 0.2,
        }),
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw new Error(`Open WebUI answered ${response.status}.`);
      }

      const body = (await response.json()) as ChatCompletionResponse;
      if (body.error?.message) throw new Error(body.error.message);
      return body.choices?.[0]?.message?.content ?? '';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
