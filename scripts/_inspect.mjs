import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ingestDocument } from '../src/engine/ingest.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { derive } from '../src/engine/derive/engine.ts';
import { findContradictions, qualityFlags } from '../src/engine/contradiction.ts';
import { SAMPLE_PATIENT } from '../src/data/sampleCorpus.ts';

const dataPath = fileURLToPath(new URL('../scripts/medical-records-data.json', import.meta.url));
const records = JSON.parse(readFileSync(dataPath, 'utf8'));
const inputs = records.map((r, i) => ({
  title: r.title,
  kind: r.kind,
  date: r.date,
  facility: r.facility,
  author: r.author,
  text: r.text,
  origin: 'import',
  fileName: r.fileName,
  mimeType: 'text/plain',
  ingestedAt: `${r.date}T09:00`,
}));
const sorted = [...inputs].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
const results = sorted.map((input, index) => ingestDocument(input, 1000 + index));
const graph = buildGraph(SAMPLE_PATIENT, results);
const asOf = graph.stats.spanEnd;
const derivations = derive(graph, asOf);
const contradictions = findContradictions(graph);
console.log('DOCS:');
for (const d of graph.documents) console.log(`  ${d.id} ${d.date} ${d.title}`);
console.log('FACTS:', graph.facts.length, 'ENTITIES:', graph.entities.length, 'EDGES:', graph.edges.length, 'STATS meanConf:', graph.stats.meanConfidence, 'flaggedFacts:', graph.stats.flaggedFacts);
console.log('--- POTASSIUM FACT ---');
const k = graph.facts.find((f) => f.entityKey === 'measurement:potassium');
console.log(
  k
    ? JSON.stringify({
        id: k.id,
        label: k.label,
        valueNum: k.valueNum,
        unit: k.unit,
        status: k.status,
        occurredAt: k.occurredAt,
        docId: k.docId,
        span: k.span,
        quote: k.quote,
        flags: k.flags,
        attrs: k.attrs,
        entityKey: k.entityKey,
        sectionKind: k.sectionKind,
        referenceRange: k.referenceRange,
      })
    : 'none',
);
console.log('--- ATORVASTATIN FACTS ---');
const a = graph.facts.filter((f) => f.entityKey === 'medication:atorvastatin');
for (const f of a) {
  console.log(
    JSON.stringify({
      id: f.id,
      dose: f.attrs.dose,
      doseUnit: f.attrs.doseUnit,
      status: f.status,
      occurredAt: f.occurredAt,
      docId: f.docId,
      sectionKind: f.sectionKind,
      span: f.span,
      quote: f.quote,
      flags: f.flags,
      extractor: f.extractor,
    }),
  );
}
console.log('--- DERIVED ---');
for (const d of derivations) {
  console.log(
    JSON.stringify({
      ruleId: d.ruleId,
      category: d.category,
      severity: d.severity,
      title: d.title,
      entityKeys: d.entityKeys.join(','),
      confidence: d.confidence,
      grade: d.grade,
      window: d.window,
    }),
  );
}
console.log('--- CONTRADICTIONS ---');
for (const c of contradictions) {
  console.log(
    JSON.stringify({
      kind: c.kind,
      severity: c.severity,
      title: c.title,
      detail: c.detail,
      factIds: c.factIds.join(','),
      docIds: c.docIds.join(','),
    }),
  );
}

console.log("--- QUALITY FLAGS ---");
for (const f of qualityFlags(graph)) console.log(JSON.stringify({kind:f.kind, severity:f.severity, title:f.title, entityKey:f.entityKey, factIds:f.facts.map(x=>x.id).join(",")}));
