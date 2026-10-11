import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/*
 * AI claim-validation audit.
 *
 * Runs the validator test suite and checks the static boundaries that those
 * tests encode. Exits non-zero on any violation, so CI fails when a model can
 * introduce an unsupported number, date, or personal fact, or when a general
 * greeting is incorrectly subjected to medical validation.
 */

const errors = [];

function mustContain(file, needle, why) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes(needle)) errors.push(`${file}: ${why}`);
}

/* 1. The validator must be wired into the gateway, after generation. */
mustContain('src/ai/gateway.ts', 'validateAIResponse', 'the gateway must run claim validation on model prose');
mustContain('src/ai/gateway.ts', 'buildValidationContext', 'the gateway must build validation context from evidence, not the raw question');

/* 2. General chat must bypass validation. */
mustContain('src/ai/validate.ts', "route === 'general'", 'general conversation must skip medical validation');

/* 3. The validator must be deterministic — no second model as judge. */
const validator = readFileSync('src/ai/validate.ts', 'utf8');
if (/streamChat|fetch\(|llmConfig|generateText/i.test(validator)) {
  errors.push('src/ai/validate.ts: validation must be deterministic, not another model call');
}

/* 4. Run the validator test suite. */
let testOutput = '';
try {
  testOutput = execSync(
    'npx vitest run src/ai/validate.test.ts',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (error) {
  errors.push(`validator test suite failed:\n${String(error.stdout ?? error.message ?? '').slice(0, 2000)}`);
}

console.log('AI claim-validation audit');
if (errors.length) {
  console.error('FAIL');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}
const passed = (testOutput.match(/(\d+)\s+passed/) ?? [])[0] ?? 'tests';
console.log(`PASS — claim extraction, numbers, dates, personal/external separation and the general-chat bypass are correct (${passed}).`);
