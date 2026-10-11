import { chatPath, type LlmConfig } from './config';

/* ------------------------------------------------------------------ */
/* Streaming chat completions                                          */
/*                                                                    */
/* Open WebUI, Ollama, and most OpenAI-compatible providers support     */
/* server-sent chunks on the same chat-completions endpoint.            */
/* ------------------------------------------------------------------ */

export type StreamStatus = 'thinking' | 'researching' | 'generating' | 'complete' | 'error';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamHandlers {
  onStatus?: (status: StreamStatus) => void;
  onChunk?: (text: string) => void;
}

export function parseSseChunk(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') return null;
  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      message?: { content?: string };
    };
    return (
      json.choices?.[0]?.delta?.content ??
      json.choices?.[0]?.message?.content ??
      json.message?.content ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Stream a chat completion. Falls back to a single non-streaming response when
 * the endpoint does not support streaming.
 */
export async function streamChat(
  config: LlmConfig,
  messages: ChatMessage[],
  handlers: StreamHandlers = {},
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  handlers.onStatus?.('generating');

  const response = await fetch(chatPath(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.4,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`The model answered ${response.status} ${response.statusText}.`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  // A non-streaming provider returns `application/json`; read it as one shot.
  // A streaming provider returns `text/event-stream` (or `application/x-ndjson`).
  const isStream = contentType.includes('text/event-stream') || contentType.includes('ndjson');
  if (!isStream) {
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      message?: { content?: string };
    };
    const text = body.choices?.[0]?.message?.content ?? body.message?.content ?? '';
    if (text) handlers.onChunk?.(text);
    handlers.onStatus?.('complete');
    return text;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    handlers.onStatus?.('complete');
    return '';
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const piece = parseSseChunk(line);
      if (piece) {
        full += piece;
        handlers.onChunk?.(piece);
      }
    }
  }

  handlers.onStatus?.('complete');
  return full.trim();
}
