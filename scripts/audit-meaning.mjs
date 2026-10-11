import { readFileSync } from 'node:fs';

/**
 * Meaning audit.
 *
 * Reads the canonical meaning table from `docs/meaning-audit.md` and checks it
 * against the `ViewId` union in the store. A view is missing its meaning if it
 * has no row, a row is hollow if any of the six cells is empty, and a handoff is
 * broken if it points at a view that does not exist.
 */

const doc = readFileSync('docs/meaning-audit.md', 'utf8');
const store = readFileSync('src/state/store.tsx', 'utf8');

const idsBlock = store.slice(
  store.indexOf('export type ViewId'),
  store.indexOf('export interface EvidenceRequest'),
);
const ids = [...idsBlock.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

// The table rows: lines that start with a pipe and contain a backticked ViewId.
const rows = doc
  .split('\n')
  .filter((line) => /^\| `[a-z]+` \|/.test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

const errors = [];
const seen = new Set();

for (const row of rows) {
  const view = row[0].replace(/`/g, '');
  if (seen.has(view)) errors.push(`duplicate meaning row for ${view}`);
  seen.add(view);

  if (!ids.includes(view)) errors.push(`meaning row for non-view "${view}"`);

  const fields = row.slice(1);
  if (fields.length !== 6) {
    errors.push(`${view}: expected 6 fields, found ${fields.length}`);
    continue;
  }
  fields.forEach((cell, index) => {
    if (!cell || cell === '—') errors.push(`${view}: field ${index + 1} is empty`);
  });

  // The last field is the AI handoff destination.
  const handoff = fields[5].replace(/`/g, '');
  if (handoff && !ids.includes(handoff)) {
    errors.push(`${view}: AI handoff "${handoff}" is not a view`);
  }
}

const missing = ids.filter((id) => !seen.has(id));
for (const id of missing) errors.push(`view "${id}" has no meaning row`);

console.log(`meaning audit: ${ids.length} views, ${rows.length} rows`);
if (errors.length) {
  console.error('FAIL');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}
console.log('PASS — every reachable view has all six meaning fields and a real handoff.');
