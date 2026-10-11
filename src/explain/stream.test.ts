import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSseChunk, streamChat, type StreamStatus } from './stream';
import type { LlmConfig } from './config';

/*
 * Streaming must never hang, duplicate text, lose the final chunk, or report
 * "complete" before it is. These tests exercise the real SSE parser and the
 * real streamChat against a mocked fetch that returns a stream.
 */

const config: LlmConfig = { protocol: 'openai', baseUrl: 'http://local', model: 'm', timeoutMs: 1000 };

function sseStream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.restoreAllMocks());

describe('parseSseChunk', () => {
  it('reads an OpenAI delta chunk', () => {
    expect(parseSseChunk('data: {"choices":[{"delta":{"content":"Hel"}}]}')).toBe('Hel');
  });

  it('reads an Ollama message chunk', () => {
    expect(parseSseChunk('data: {"message":{"content":"lo"}}')).toBe('lo');
  });

  it('ignores [DONE] and malformed lines', () => {
    expect(parseSseChunk('data: [DONE]')).toBeNull();
    expect(parseSseChunk('data: not-json')).toBeNull();
    expect(parseSseChunk('')).toBeNull();
    expect(parseSseChunk(': keep-alive')).toBeNull();
  });
});

describe('streamChat', () => {
  it('emits every chunk and completes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseStream([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    );

    const chunks: string[] = [];
    const statuses: StreamStatus[] = [];
    const text = await streamChat(config, [{ role: 'user', content: 'hi' }], {
      onChunk: (c) => chunks.push(c),
      onStatus: (s) => statuses.push(s),
    });

    expect(text).toBe('Hello world');
    expect(chunks).toEqual(['Hello', ' world']);
    expect(statuses).toContain('complete');
  });

  it('treats a provider error as a failure, not success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500, statusText: 'Server Error' })));

    await expect(streamChat(config, [{ role: 'user', content: 'hi' }])).rejects.toThrow(/500/);
  });

  it('falls back to a non-streaming JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'Full answer' } }] })),
    );

    const text = await streamChat(config, [{ role: 'user', content: 'hi' }]);
    expect(text).toBe('Full answer');
  });

  it('returns an empty result for an empty stream, not a hang', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseStream(['data: [DONE]\n\n'])));

    const text = await streamChat(config, [{ role: 'user', content: 'hi' }]);
    expect(text).toBe('');
  });
});
