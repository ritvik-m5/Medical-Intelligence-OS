import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/*
 * AI gateway audit.
 *
 * Runs the AI test suite (routing, conversation state, streaming, general chat,
 * context, fallback) and checks a small set of static boundaries that those
 * tests encode. Exits non-zero on any failure, so CI fails on a routing,
 * provenance, state, streaming, or fallback violation.
 */

const errors = [];

/* 1. The provenance/boundary source must exist and be wired correctly. */
function mustContain(file, needle, why) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes(needle)) errors.push(`${file}: ${why}`);
}

mustContain('src/ai/gateway.ts', "import { converse", 'the gateway must route record questions through the engine');
mustContain('src/ai/gateway.ts', 'friendlyFallback', 'general chat must have a deterministic fallback');
mustContain('src/ai/gateway.ts', 'runResearch', 'research must go through the research engine');
mustContain('src/ai/router.ts', "'general'", 'the router must have a general route');
mustContain('src/ai/router.ts', "'record'", 'the router must have a record route');
mustContain('src/ai/router.ts', "'research'", 'the router must have a research route');
mustContain('src/explain/stream.ts', '[DONE]', 'streaming must handle the done event');
mustContain('src/explain/stream.ts', 'text/event-stream', 'streaming must detect SSE responses');

/* 2. The model must never supply citations: the engine owns sources. */
const remote = readFileSync('src/explain/remote.ts', 'utf8');
if (!/sources:\s*grounded\.sources/.test(remote) && !/grounded\.sources/.test(remote)) {
  errors.push('src/explain/remote.ts: the model explanation must keep the engine citations');
}

/* 2b. The model boundary: the model's input is the engine answer, never the raw question. */
if (!/grounded\.paragraphs\.join/.test(remote)) {
  errors.push('src/explain/remote.ts: the model must be handed the engine answer, not the user question');
}

/* 2c. The router must have a dedicated, isolated test file. */
mustContain('src/ai/router.test.ts', 'routeMessage', 'the router must be tested in isolation');
mustContain('src/ai/router.test.ts', 'expandFollowUp', 'follow-up expansion must be tested in isolation');

/* 3. Run the AI test suite. */
let testOutput = '';
try {
  testOutput = execSync(
    'npx vitest run src/ai src/chat/general.test.ts src/explain/stream.test.ts src/explain/remote.test.ts',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (error) {
  errors.push(`AI test suite failed:\n${String(error.stdout ?? error.message ?? '').slice(0, 2000)}`);
}

console.log('AI gateway audit');
if (errors.length) {
  console.error('FAIL');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}
const passed = (testOutput.match(/(\d+)\s+passed/) ?? [])[0] ?? 'tests';
console.log(`PASS — routing, provenance, state, streaming and fallback are correct (${passed}).`);
