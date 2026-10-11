import { GroundedExplainer } from './grounded';
import type { Explanation, ExplanationRequest, ExplainerBackend } from './types';
import { chatPath, modelsPath, type LlmConfig } from './config';

/* ------------------------------------------------------------------ */
/* A language model behind the same interface                          */
/*                                                                    */
/* The engine answers first, completely and on its own. Only then is    */
/* that answer handed to the model as its entire world. The citations   */
/* returned to the interface are the engine's, never the model's.        */
/*                                                                    */
/* This is the whole design, and it is why a model cannot corrupt the    */
/* record: it has no access to the graph, it cannot add a finding, and   */
/* if it fails the engine's own answer is returned unchanged with a note */
/* saying the model was not used. A network failure must never look like */
/* a missing finding.                                                   */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = [
  'You rewrite a structured medical-record finding as plain prose.',
  '',
  'You must not add any claim, finding, diagnosis, recommendation, probability or number that is not present in the input you are given.',
  'You must not remove or soften a statement about what the engine does not conclude.',
  'You must not answer a clinical question. If the input does not contain something, say that it does not.',
  'You are explaining a conclusion that has already been reached by a deterministic engine. Your job is readability, not inference.',
  'Write plainly. Short sentences. No headings, no bullet points, no lists.',
].join('\n');

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
  message?: { content?: string };
}

/**
 * Strip a model's markdown so the interface renders prose rather than syntax.
 *
 * Paragraphs are split on blank lines *first*, because that is where the model
 * put its boundaries. Doing it the other way round — stripping blank lines, then
 * joining — silently merges every paragraph into one block, which is what a
 * naive implementation does and is worse than leaving the markdown in.
 *
 * Within a paragraph, wrapped lines are joined and headings and bullets are
 * removed. None of that can change what a sentence says.
 */
export function toProse(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*\u2022]\s+/, '').trim())
        .filter((line) => line.length > 0 && !/^[-=]{3,}$/.test(line))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

export class RemoteExplainer implements ExplainerBackend {
  readonly id = 'remote';
  readonly label: string;
  readonly generated = true;
  readonly requiresNetwork = true;
  readonly note: string;

  private readonly grounded = new GroundedExplainer();

  constructor(private readonly config: LlmConfig) {
    this.label = config.model || 'Language model';
    this.note =
      `Prose rewritten by ${config.model} from the engine's own answer. ` +
      'The citations are the engine\u2019s; the wording is the model\u2019s. Nothing here can add a finding.';
  }

  async explain(request: ExplanationRequest): Promise<Explanation> {
    // 1. The engine answers first, completely and on its own.
    const grounded = await this.grounded.explain(request);
    const context = grounded.paragraphs.join('\n\n');

    try {
      const content = await this.complete(context);
      const paragraphs = toProse(content);
      if (paragraphs.length === 0) throw new Error('The model returned an empty answer.');

      return {
        paragraphs,
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
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.config.timeoutMs) : null;

    try {
      const response = await fetch(chatPath(this.config), {
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
          stream: false,
        }),
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw new Error(
          `The model endpoint answered ${response.status} ${response.statusText}. Check that the server is running and the model name is right.`,
        );
      }

      const body = (await response.json()) as ChatResponse;
      if (body.error?.message) throw new Error(body.error.message);
      // Ollama's native shape returns `message.content`; the OpenAI shape returns choices.
      return body.choices?.[0]?.message?.content ?? body.message?.content ?? '';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`The model did not answer within ${this.config.timeoutMs / 1000}s.`);
      }
      if (error instanceof TypeError) {
        // A TypeError from fetch is almost always "could not connect".
        throw new Error(
          `Could not reach ${this.config.baseUrl}. Start the server, then use Test connection.`,
        );
      }


      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Is it there?                                                        */
/* ------------------------------------------------------------------ */

export interface LlmProbe {
  ok: boolean;
  message: string;
  /** Model names the endpoint reported, when it reported any. */
  models: string[];
  latencyMs: number | null;
  /** True when the model named in the config is among those reported. */
  modelPresent: boolean;
}

/**
 * Ask the endpoint what it has.
 *
 * Reported as a result rather than thrown, because "the model is not running" is
 * a normal state of affairs and the interface has to be able to say so calmly.
 */
export async function probeLlm(config: LlmConfig): Promise<LlmProbe> {
  const started = Date.now();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;

  try {
    const response = await fetch(modelsPath(config), {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: controller?.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `The endpoint answered ${response.status} ${response.statusText} at ${modelsPath(config)}.`,
        models: [],
        latencyMs: Date.now() - started,
        modelPresent: false,
      };
    }

    const body = (await response.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ name?: string }>;
    };
    const models = [
      ...(body.data ?? []).map((entry) => entry.id ?? ''),
      ...(body.models ?? []).map((entry) => entry.name ?? ''),
    ].filter(Boolean);

    const modelPresent = models.some(
      (name) => name === config.model || name.startsWith(`${config.model}:`),
    );

    return {
      ok: true,
      message:
        models.length === 0
          ? 'The endpoint is reachable and reported no models.'
          : `Reachable. ${models.length} model${models.length === 1 ? '' : 's'} available.`,
      models,
      latencyMs: Date.now() - started,
      modelPresent,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `Could not reach ${config.baseUrl}. ${detail}`,
      models: [],
      latencyMs: null,
      modelPresent: false,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
