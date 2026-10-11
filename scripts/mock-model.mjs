/* ------------------------------------------------------------------ */
/* A stand-in for Ollama / Open WebUI, to prove the whole chain works    */
/*                                                                    */
/* Answers both wire protocols the app uses:                           */
/*   /v1/*           OpenAI-compatible (Ollama, vLLM, LM Studio)        */
/*   /api/*          Open WebUI                                         */
/*                                                                    */
/*   node scripts/mock-model.mjs [port]                                 */
/* ------------------------------------------------------------------ */

import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 11434);

const MODELS = [{ id: 'llama3.2:latest' }, { id: 'qwen2.5:7b' }];

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function replyFor(messages) {
  const last = messages?.[messages.length - 1]?.content ?? '';
  const lower = String(last).toLowerCase();
  if (/^(hi|hello|hey|good morning)/.test(lower.trim())) {
    return "Hi! I'm Medical Memory. I can help you understand your health records and answer questions using the evidence available to me. What would you like to look at?";
  }
  if (/thanks|thank you/.test(lower)) {
    return "You're welcome. Anything else you'd like to look at?";
  }
  if (/what is potassium|tell me about potassium/.test(lower)) {
    return 'Potassium is an electrolyte your body uses for nerve and muscle function. If you are asking about a result in your record, I can also explain the specific value and show you the source it came from.';
  }
  return (
    'The engine found structured evidence in this record. ' +
    'Every personal claim traces to a documented span. ' +
    `The gateway supplied ${String(last).length} characters of context for this rewrite.`
  );
}

function handleChat(request, response, body) {
  let parsed = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    /* ignore */
  }

  const content = replyFor(parsed.messages);
  const stream = parsed.stream === true;

  if (stream) {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const words = content.split(' ');
    let i = 0;
    const tick = () => {
      if (i >= words.length) {
        response.write('data: [DONE]\n\n');
        response.end();
        return;
      }
      const piece = (i === 0 ? '' : ' ') + words[i];
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
      );
      i += 1;
      setTimeout(tick, 12);
    };
    tick();
    return;
  }

  json(response, 200, {
    id: 'chatcmpl-mock',
    object: 'chat.completion',
    model: parsed.model ?? 'llama3.2',
    choices: [{ index: 0, message: { role: 'assistant', content } }],
  });
}

const server = createServer((request, response) => {
  const url = request.url ?? '/';

  if (url.startsWith('/v1/models') || url.startsWith('/api/models')) {
    return json(response, 200, { object: 'list', data: MODELS });
  }

  if (url.startsWith('/v1/chat/completions') || url.startsWith('/api/chat/completions')) {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => handleChat(request, response, body));
    return;
  }

  json(response, 404, { error: { message: `No route for ${url}` } });
});

server.listen(port, () => {
  console.log(`stand-in model (OpenAI + Open WebUI paths) on http://localhost:${port}`);
});
