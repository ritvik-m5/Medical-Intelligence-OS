import { describe, expect, it, vi, afterEach } from 'vitest';
import { GroundedExplainer, detectIntent, resolveIntent } from './grounded';
import { OpenWebUiExplainer } from './openWebUi';
import { LocalBuildBackend } from '../builder/backend';
import type { ExplanationRequest } from './types';
import type { BuildArtifact } from '../builder/types';

/* Explainer tests.
 *
 * The claim under test is not "the answers are good". It is narrower and more
 * important: the explainer cannot state anything the engine did not already
 * conclude, every answer cites spans that exist, and when it cannot answer it
 * says so rather than producing something plausible.
 */

async function artifact(): Promise<BuildArtifact> {
  const backend = new LocalBuildBackend({ pace: 0 });
  return backend.run({ prompt: 'reconstruct my four-year history', pace: 0 }, () => {});
}

async function request(question: string): Promise<ExplanationRequest> {
  const built = await artifact();
  return {
    question,
    graph: built.graph,
    derivations: built.derivations,
    identity: built.identity,
  };
}

describe('understanding the question', () => {
  it('recognises each intent it supports', () => {
    expect(detectIntent('Why did this appear?')).toBe('why');
    expect(detectIntent('Summarise what you found')).toBe('summary');
    expect(detectIntent('Which findings are serious?')).toBe('severity');
    expect(detectIntent('Show me the evidence')).toBe('evidence');
    expect(detectIntent('What can you not tell me?')).toBe('limits');
    expect(detectIntent('What is this artifact?')).toBe('identity');
    expect(detectIntent('How many findings are there?')).toBe('count');
  });

  it('admits when it does not understand, rather than guessing', () => {
    expect(detectIntent('who is the prime minister')).toBe('unknown');
    expect(detectIntent('prescribe me something')).toBe('unknown');
  });

  it('treats "explain" as a summary request rather than an unknown intent', () => {
    expect(detectIntent('explain')).toBe('summary');
    expect(detectIntent('Please explain')).toBe('summary');
  });

  it('treats a bare greeting as a greeting, not a failed question', () => {
    expect(detectIntent('HI')).toBe('greeting');
    expect(detectIntent('hello')).toBe('greeting');
    expect(detectIntent('Good morning')).toBe('greeting');
  });

  it('recognises a "what is X" question about a concept', () => {
    expect(detectIntent('What is potassium')).toBe('concept');
    expect(detectIntent('What is atorvastatin?')).toBe('concept');
    expect(detectIntent('tell me about my medications')).toBe('concept');
  });

  it('resolves "this" against a focused object, and refuses it without one', () => {
    expect(resolveIntent('explain this', 'derivation-1')).toBe('why');
    expect(resolveIntent('what does this mean', 'derivation-1')).toBe('why');
    expect(resolveIntent('this', undefined)).toBe('unknown');
  });
});

describe('the grounded explainer', () => {
  const explainer = new GroundedExplainer();

  it('is not generated and needs no network', () => {
    expect(explainer.generated).toBe(false);
    expect(explainer.requiresNetwork).toBe(false);
  });

  it('traces a finding back through its own proof', async () => {
    const answer = await explainer.explain(await request('Why did this appear?'));
    expect(answer.intent).toBe('why');
    expect(answer.notAnswered).toBeNull();

    const text = answer.paragraphs.join('\n');
    // It names a real rule from the registry.
    expect(text).toMatch(/`[a-z]+\.[a-z_]+`/);
    // It walks the proof.
    expect(text).toMatch(/Documented|Rule applied|Conclusion|Derived interval/);
    // And it states what it does not conclude.
    expect(text).toContain('does not say');
    expect(answer.sources.length).toBeGreaterThan(1);
  });

  it('cites only facts that exist in the graph', async () => {
    const req = await request('Show me the evidence');
    const answer = await explainer.explain(req);
    const factIds = new Set(req.graph.facts.map((fact) => fact.id));

    expect(answer.sources.length).toBeGreaterThan(0);
    for (const source of answer.sources) {
      for (const id of source.factIds) expect(factIds.has(id)).toBe(true);
    }
  });

  it('counts what it actually read', async () => {
    const req = await request('Summarise what you found');
    const answer = await explainer.explain(req);
    const text = answer.paragraphs.join(' ');

    expect(answer.intent).toBe('summary');
    expect(text).toContain(String(req.derivations.length));
    expect(text).toContain(String(req.graph.documents.length));
    expect(text).toContain(String(req.graph.facts.length));
  });

  it('lists the serious findings, and says so when there are none', async () => {
    const req = await request('Which findings are serious?');
    const answer = await explainer.explain(req);
    const high = req.derivations.filter((d) => d.severity === 'high');

    expect(answer.intent).toBe('severity');
    if (high.length > 0) {
      expect(answer.paragraphs.join(' ')).toContain(String(high.length));
      expect(answer.sources.length).toBeGreaterThan(0);
    } else {
      expect(answer.paragraphs.join(' ')).toContain('No finding');
    }
  });

  it('quotes the engine\u2019s own limits rather than writing new ones', async () => {
    const req = await request('What can you not tell me?');
    const answer = await explainer.explain(req);

    expect(answer.intent).toBe('limits');
    const text = answer.paragraphs.join('\n');
    // The notConcluded text of a real finding appears verbatim.
    expect(text).toContain(req.derivations[0].notConcluded);
  });

  it('names the artifact and its hashes', async () => {
    const req = await request('What is this artifact?');
    const answer = await explainer.explain(req);
    const text = answer.paragraphs.join(' ');

    expect(answer.intent).toBe('identity');
    expect(text).toContain(req.identity.id);
    expect(text).toContain(req.identity.corpusHash);
    expect(text).toContain(req.identity.engineVersion);
  });

  it('refuses a question it cannot ground, and shows no sources for it', async () => {
    const answer = await explainer.explain(await request('should I stop my statin?'));

    expect(answer.intent).toBe('unknown');
    expect(answer.notAnswered).not.toBeNull();
    expect(answer.sources).toEqual([]);
    expect(answer.paragraphs.join(' ')).toContain('will not invent a finding');
  });

  it('never mentions a rule the artifact did not fire', async () => {
    const req = await request('Summarise what you found');
    const answer = await explainer.explain(req);

    // Every rule id in the prose is one this artifact actually produced.
    const produced = new Set<string>(req.derivations.map((d) => d.ruleId));
    for (const paragraph of answer.paragraphs) {
      for (const match of paragraph.matchAll(/\b([a-z]+_[a-z_]+)\b/g)) {
        const candidate = match[1];
        if (!candidate.includes('_')) continue;
        const isRule = Array.from(produced).some((id) => id.endsWith(candidate));
        expect(isRule, `mentioned ${candidate}`).toBe(true);
      }
    }
  });

  it('answers a greeting with a real summary, not a dead end', async () => {
    const answer = await explainer.explain(await request('HI'));

    expect(answer.intent).toBe('greeting');
    expect(answer.notAnswered).toBeNull();
    const text = answer.paragraphs.join(' ');
    expect(text).toContain('Hello');
    expect(text).toContain('findings');
  });

  it('answers "what is X" from the record, with the spans it was read from', async () => {
    const req = await request('What is potassium');
    const answer = await explainer.explain(req);

    expect(answer.intent).toBe('concept');
    expect(answer.notAnswered).toBeNull();
    // It names the thing and points at real facts.
    const text = answer.paragraphs.join(' ');
    expect(text.toLowerCase()).toContain('potassium');
    expect(answer.sources.length).toBeGreaterThan(0);
    const factIds = new Set(req.graph.facts.map((f) => f.id));
    for (const source of answer.sources) {
      for (const id of source.factIds) expect(factIds.has(id)).toBe(true);
    }
  });

  it('says so when a concept is not in the record, rather than defining it', async () => {
    const answer = await explainer.explain(await request('What is kryptonite'));

    expect(answer.intent).toBe('concept');
    expect(answer.notAnswered).toContain('not documented');
    expect(answer.sources).toEqual([]);
  });

  it('answers "what does this mean" about the focused finding, not a guess', async () => {
    const built = await artifact();
    const focus = built.derivations[0].id;
    const req: ExplanationRequest = {
      question: 'what does this mean',
      graph: built.graph,
      derivations: built.derivations,
      identity: built.identity,
      focus,
    };
    const answer = await explainer.explain(req);

    expect(answer.intent).toBe('why');
    expect(answer.notAnswered).toBeNull();
    // It traces the focused finding, naming its real rule.
    const text = answer.paragraphs.join(' ');
    expect(text).toContain(built.derivations[0].title);
    expect(answer.sources.length).toBeGreaterThan(0);
  });
});

describe('the Open WebUI adapter', () => {
  const config = { baseUrl: 'http://localhost:3000', model: 'llama3', timeoutMs: 500 };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says it is generated and needs a network', () => {
    const explainer = new OpenWebUiExplainer(config);
    expect(explainer.generated).toBe(true);
    expect(explainer.requiresNetwork).toBe(true);
  });

  it('returns the model\u2019s prose but the engine\u2019s citations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Rewritten paragraph one.\n\nRewritten paragraph two.' } }],
        }),
      })),
    );

    const req = await request('Why did this appear?');
    const answer = await new OpenWebUiExplainer(config).explain(req);

    expect(answer.generated).toBe(true);
    expect(answer.backend).toBe('open-webui');
    expect(answer.paragraphs).toEqual(['Rewritten paragraph one.', 'Rewritten paragraph two.']);

    // The citations are the engine's, not the model's.
    const grounded = await new GroundedExplainer().explain(req);
    expect(answer.sources.map((s) => s.id)).toEqual(grounded.sources.map((s) => s.id));
  });

  it('sends the proof as the entire context, and forbids inference', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await new OpenWebUiExplainer(config).explain(await request('Why did this appear?'));

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('http://localhost:3000/api/chat/completions');
    const body = JSON.parse(String(call[1]?.body));
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('must not add any claim');
    expect(body.messages[0].content).toContain('must not answer a clinical question');
    // The user turn is the engine's answer, not the reader's question.
    expect(body.messages[1].content).toContain('The rule that produced it is');
  });

  it('falls back to the engine\u2019s own answer when the endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );

    const req = await request('Why did this appear?');
    const answer = await new OpenWebUiExplainer(config).explain(req);

    // Not generated, and honest about why.
    expect(answer.generated).toBe(false);
    expect(answer.paragraphs.join(' ')).toContain('The language model was not used');
    expect(answer.paragraphs.join(' ')).toContain('connection refused');
    // And the engine's answer is intact underneath.
    expect(answer.paragraphs.join(' ')).toContain('The rule that produced it is');
    expect(answer.sources.length).toBeGreaterThan(0);
  });

  it('reports a non-OK response rather than pretending it worked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

    const answer = await new OpenWebUiExplainer(config).explain(await request('Summarise'));
    expect(answer.generated).toBe(false);
    expect(answer.paragraphs.join(' ')).toContain('503');
  });
});
