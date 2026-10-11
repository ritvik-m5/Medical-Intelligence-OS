import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Write five messy-but-readable .txt records into Downloads/Medical records.
 *
 *   npm run create:file
 *
 * The files are numbered in date order. Drop the whole folder into Records
 * (or attach them on the Builder and press Build). Reset, in the sidebar,
 * returns the app to the built-in sample if you want to start over.
 */

const dataPath = fileURLToPath(new URL('./medical-records-data.json', import.meta.url));
const records = JSON.parse(readFileSync(dataPath, 'utf8'));

const targetDir = join(homedir(), 'Downloads', 'Medical records');
mkdirSync(targetDir, { recursive: true });

const expected = new Set(records.map((record) => record.fileName));
for (const name of readdirSync(targetDir)) {
  if (name.endsWith('.txt') && !expected.has(name)) {
    unlinkSync(join(targetDir, name));
    console.log(`  removed leftover ${name}`);
  }
}

let written = 0;
for (const record of records) {
  const path = join(targetDir, record.fileName);
  writeFileSync(path, `${record.text.trim()}\n`, 'utf8');
  written += 1;
  console.log(`  wrote ${record.fileName}`);
}

console.log(`\nCreated ${written} files in ${targetDir}`);
console.log('\nTo test them:');
console.log('  1. npm run dev');
console.log('  2. Open the workspace, then Reset → Reset record (clears anything you imported).');
console.log('  3. Open Records and drop all five .txt files onto "Import a document".');
console.log('  4. Or attach them on the Builder and press Build — that run uses only these files.');
console.log('  5. Check Overview, Records, and Inference. Potassium 45 should be flagged, not trusted.');
