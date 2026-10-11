// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalBuildBackend } from '../builder/backend';
import {
  DEFAULT_LLM,
  LLM_STORAGE_KEY,
  chatPath,
  clearLlmConfig,
  loadLlmConfig,
  modelsPath,
  saveLlmConfig,
  type LlmConfig,
} from './config';
import { probeLlm, RemoteExplainer, toProse } from './remote';
import { GroundedExplainer } from './grounded';
import type { ExplanationRequest } from './types';

/* ------------------------------------------------------------------ */
/* Connecting a language model                                         */
/*                                                                    */
/* Two things are tested, and the second matters more. The first is     */
/* plumbing: the right path, the right model, the right shape. The       */
/* second is the invariant the explain layer exists to hold — the model  */
/* can rewrite the wording and nothing else. Its citations are the       */
/* engine's, and when it fails the engine's answer stands alone.         */
/* ------------------------------------------------------------------ */

const backend = new LocalBuildBackend({ pace: 0 });

async function request(question = 'Why did the highest-severity finding appear?') {
  const artifact = await backend.run({ prompt: 'diabetes monitoring', pace: 0 }, () => {});
  return {
    question,
    graph: artifact.graph,
    derivations: artifact.derivations,
    identity: artifact.identity,
  } satisfies ExplanationRequest;
}

/** A fetch that answers with a chat completion carrying this text. */
function stubModel(content: string) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ choices: [{ message: { content } }] }),
    } as unknown as Response;
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('where the model lives', () => {
  it('defaults to a local model on this origin, so nothing needs opening up', () => {
    expect(DEFAULT_LLM.baseUrl).toBe('/llm');
    expect(DEFAULT_LLM.model).toBe('llama3.2');

    const config = loadLlmConfig();
    expect(config.baseUrl).toBe('/llm');
    expect(config.model).toBe('llama3.2');
    expect(config.protocol).toBe('openai');
  });

  it('builds the right path for each protocol', () => {
    const openai: LlmConfig = { ...DEFAULT_LLM, protocol: 'openai' };
    const webui: LlmConfig = { ...DEFAULT_LLM, protocol: 'open-webui' };

    // Ollama and everything else OpenAI-shaped.
    expect(chatPath(openai)).toBe('/llm/v1/chat/completions');
    expect(modelsPath(openai)).toBe('/llm/v1/models');

    // Open WebUI is OpenAI-compatible under its own path.
    expect(chatPath(webui)).toBe('/llm/api/chat/completions');
    expect(modelsPath(webui)).toBe('/llm/api/models');
  });

  it('does not double a trailing slash on a configured endpoint', () => {
    expect(chatPath({ ...DEFAULT_LLM, baseUrl: 'http://localhost:11434/' })).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
  });

  it('remembers a choice and can forget it', () => {
    saveLlmConfig({ model: 'llama3.2:1b', baseUrl: 'http://localhost:11434' });
    expect(loadLlmConfig().model).toBe('llama3.2:1b');
    expect(loadLlmConfig().baseUrl).toBe('http://localhost:11434');

    expect(clearLlmConfig().model).toBe('llama3.2');

    expect(localStorage.getItem(LLM_STORAGE_KEY)).toBeNull();
  });

  it('survives an unreadable override rather than failing the page', () => {
    localStorage.setItem(LLM_STORAGE_KEY, '{not json');
    expect(loadLlmConfig().model).toBe('llama3.2');
  });
});

describe('the remote explainer', () => {
  it('posts the engine answer to the model and returns the model prose', async () => {
    const calls = stubModel('The record shows a high severity finding about monitoring.');
    const explainer = new RemoteExplainer(DEFAULT_LLM);
    const answer = await explainer.explain(await request());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/llm/v1/chat/completions');
    expect((calls[0].body as { model: string }).model).toBe('llama3.2');
    expect(answer.generated).toBe(true);
    expect(answer.paragraphs.join(' ')).toContain('high severity finding');
  });

  it('returns the engine citations, never the model\u2019s', async () => {
    // A model that invents a citation cannot get it into the answer.
    stubModel('See the study at https://example.com/invented and reference fact_zzz.');
    const engineOnly = await new RemoteExplainer(DEFAULT_LLM).explain(await request());
    const rewritten = await new RemoteExplainer(DEFAULT_LLM).explain(await request());

    // Same citations on both paths, because both came from the engine.
    expect(rewritten.sources.map((source) => source.id)).toEqual(
      engineOnly.sources.map((source) => source.id),
    );
    expect(rewritten.sources.length).toBeGreaterThan(0);
    expect(rewritten.sources.some((source) => source.id.includes('fact_zzz'))).toBe(false);
  });

  it('gives the model the engine answer as its entire context', async () => {
    const calls = stubModel('Rewritten.');
    await new RemoteExplainer(DEFAULT_LLM).explain(await request());

    const body = calls[0].body as { messages: Array<{ role: string; content: string }> };
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    // The system prompt forbids inference and forbids adding a claim.
    expect(body.messages[0].content).toContain('must not add any claim');
    expect(body.messages[0].content).toContain('must not answer a clinical question');
    expect(body.messages[1].content.length).toBeGreaterThan(50);
  });

  it('hands the model the engine answer, never the raw question', async () => {
    // The model boundary: the model's input is the engine's answer verbatim.
    // The user's question is never passed through, so the model cannot answer
    // the question itself — it can only rewrite what the engine already said.
    const req = await request();
    const grounded = await new GroundedExplainer().explain(req);
    const calls = stubModel('Rewritten.');
    await new RemoteExplainer(DEFAULT_LLM).explain(req);

    const body = calls[0].body as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[1].content).toBe(grounded.paragraphs.join('\n\n'));
    expect(body.messages[1].content).not.toContain(req.question);
  });

  it('falls back to the engine answer when the endpoint is unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    const answer = await new RemoteExplainer(DEFAULT_LLM).explain(await request());

    // The engine's answer stands, with a note saying the model was not used.
    expect(answer.generated).toBe(false);
    expect(answer.paragraphs.join(' ')).toContain('The language model was not used');
    expect(answer.paragraphs.join(' ')).toContain('Could not reach');
    // And it still carries real citations, because the engine produced it.
    expect(answer.sources.length).toBeGreaterThan(0);
  });

  it('never reports a network failure as a missing finding', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    }) as unknown as Response);

    const answer = await new RemoteExplainer(DEFAULT_LLM).explain(await request());

    expect(answer.generated).toBe(false);
    expect(answer.paragraphs.join(' ')).toContain('404');
    expect(answer.paragraphs.join(' ')).toContain('The answer above is the engine');
  });

  it('falls back when the model answers with nothing at all', async () => {
    stubModel('   ');
    const answer = await new RemoteExplainer(DEFAULT_LLM).explain(await request());
    expect(answer.generated).toBe(false);
    expect(answer.paragraphs.join(' ')).toContain('empty answer');
  });
});

describe('reading a model\u2019s prose', () => {
  it('strips headings, bullets and rules without changing the sentences', () => {
    const paragraphs = toProse(
      '# Heading\n\n## Sub heading\n\n- First point\n- Second point\n\n---\n\nA normal sentence.',
    );

    expect(paragraphs.join(' ')).not.toContain('#');
    expect(paragraphs.join(' ')).not.toContain('- First');
    expect(paragraphs.join(' ')).toContain('First point');
    expect(paragraphs.join(' ')).toContain('A normal sentence.');
  });

  it('collapses runs of whitespace and drops empty lines', () => {
    expect(toProse('One.\n\n\n\nTwo.   Three.\n\n')).toEqual(['One.', 'Two. Three.']);
  });
});

describe('the connection test', () => {
  it('reports a reachable endpoint and whether the named model is there', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: [{ id: 'llama3.2:latest' }, { id: 'qwen2.5' }] }),
    }) as unknown as Response);

    const probe = await probeLlm(DEFAULT_LLM);
    expect(probe.ok).toBe(true);
    expect(probe.modelPresent).toBe(true);
    expect(probe.models).toHaveLength(2);
  });

  it('says the named model is missing rather than pretending the test failed', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: [{ id: 'qwen2.5' }] }),
    }) as unknown as Response);

    const probe = await probeLlm(DEFAULT_LLM);
    expect(probe.ok).toBe(true);
    expect(probe.modelPresent).toBe(false);
  });

  it('reports an unreachable endpoint as a result, not as a thrown error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    const probe = await probeLlm(DEFAULT_LLM);
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain('Could not reach');
    expect(probe.models).toEqual([]);
  });
});

