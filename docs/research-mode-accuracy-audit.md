# Research Mode accuracy audit

Traced from `src/views/ResearchView.tsx` after the accuracy overhaul.
Every displayed item is listed with its source, calculation, and fallback behavior.

Retrieval timestamps shown in the UI are taken from the research result object,
not hardcoded page constants.

---

## Question panel

| value | source | calculation | artifact dependency | external dependency | retrieval timestamp | fallback behavior |
| --- | --- | --- | --- | --- | --- | --- |
| question textarea | user input / `researchSeed` from store | local React state, seeded once from `researchAbout()` | none | none | none | empty until user asks or arrives with a seed |
| as-of subtitle | store `asOf` | `formatDate(asOf)` | global Time Machine date | none | none | always shown |
| context chip | store `aiContext` | `CONTEXT_KIND_LABEL[kind]` + title + summary | selected object from another view | none | none | hidden when no context |
| verification error | `verifyResearchResult()` | engine invariant check after `runResearch()` | full research input | bundled registry + trials response | result `retrievedAt` | shown if counts or sources fail verification |

---

## Personal record panel

| value | source | calculation | artifact dependency | external dependency | retrieval timestamp | fallback behavior |
| --- | --- | --- | --- | --- | --- | --- |
| document count | `ResearchResult.personalCounts.documents` | `documentsAsOf(graph, asOf).length` | snapshot + asOf | none | result `retrievedAt` | zero when no documents as of date |
| fact count | `personalCounts.facts` | `factsAsOf(graph, asOf).length` | snapshot + asOf | none | result `retrievedAt` | zero |
| concept count | `personalCounts.concepts` | entities visible as of date | snapshot + asOf | none | result `retrievedAt` | zero |
| finding count | `personalCounts.findings` | derivations matching resolved entity keys | derivations + asOf | none | result `retrievedAt` | zero |
| question count | `personalCounts.questions` | open questions count passed in | questions[] | none | result `retrievedAt` | zero |
| edge count | `personalCounts.edges` | `edgesAsOf(graph, asOf)` | graph + asOf | none | result `retrievedAt` | zero |
| concept chips | `graph.entities` filtered by `result.entityKeys` | up to 12 condition/medication/measurement labels | resolved research subject | none | none | hidden when no resolved entities |
| "as of {date}" chip | `ResearchResult.asOf` | store `asOf` at research time | global asOf | none | none | always on personal side |

**Invariant.** Counts never come from `graph.stats` (full corpus). They always come from
`personalCounts()` inside `runResearch()`.

---

## External evidence panel

| value | source | calculation | artifact dependency | external dependency | retrieval timestamp | fallback behavior |
| --- | --- | --- | --- | --- | --- | --- |
| source total | `result.sources.length` | `sourcesForEntities(resolved.keys)` | entity resolution from question/context | bundled registry entries only | each source `retrievedAt` | zero when no entity match |
| category chips | `categoryCounts(result.sources)` | count by `sourceType` | resolved entity keys | registry | per-source `retrievedAt` | only non-zero categories shown |
| retrieved line | `result.retrievedAt` | ISO timestamp at research run | none | research action time | shown | always |
| external claim text | `ExternalEvidenceItem.claim` | `verifiedContent ?? title` from registry | none | stored source record | item `retrievedAt` | metadata-only when no verified content |
| claim kind chip | `ExternalEvidenceItem.claimKind` | `source_metadata` or `source_derived_summary` | none | registry | item `retrievedAt` | never `model_explanation` |
| cache state chip | `ExternalEvidenceItem.cacheState` | registry is bundled (`cached`) | none | registry | item `retrievedAt` | LIVE/CACHED/STALE for trials only |
| published / version | source fields when present | passthrough | none | registry | source fields | omitted when absent |
| freshness chip | `source.freshness` | registry field | none | registry | none | "Freshness not verified" when unknown |

**Invariant.** `sum(categoryCounts) === sources.length`. Unrelated registry entries never appear.

---

## What your record says

| value | source | calculation | artifact dependency | external dependency | retrieval timestamp | fallback behavior |
| --- | --- | --- | --- | --- | --- | --- |
| evidence items | `ResearchResult.personalEvidence` | `collectPersonalEvidence()` for resolved keys | facts, derivations, questions, contradictions as of date | none | each item `asOf` | empty message: record cannot establish |
| kind chip | `PersonalEvidenceItem.kind` | fact / derivation / question / contradiction | artifact objects | none | none | always |
| statement | `PersonalEvidenceItem.statement` | engine-derived text from artifact | artifact | none | item `asOf` | never from external sources |

---

## Where they intersect

| value | source | calculation | artifact dependency | external dependency | retrieval timestamp | fallback behavior |
| --- | --- | --- | --- | --- | --- | --- |
| links | `ResearchResult.links` | `linkEvidence()` — shared entity key only | personal item entity keys | source `entityIds` | result `retrievedAt` | empty: no documented relationship |
| match state | `EvidenceLink.state` | currently `contextualizes` only | both sides | both sides | none | never auto-"supports" |
| because | `EvidenceLink.because` | explicit explanation string | entity overlap | entity overlap | none | always shown |

---

## ClinicalTrials.gov

| value | source | calculation | artifact dependency | external dependency | retrieval timestamp | fallback behavior |
| --- | --- | --- | --- | --- | --- | --- |
| query | `trialQueryFrom(entityKeys, question)` | resolved subject terms | entity resolution | none | none | not queried when no searchable concept |
| trial title | API `briefTitle` or `officialTitle` | `normalizeStudy()` | none | ClinicalTrials.gov v2 | trial `retrievedAt` | row dropped if missing |
| NCT ID | API `nctId` | passthrough | none | live fetch | trial `retrievedAt` | row dropped if missing |
| status / phase / study type / location / last update | API fields | passthrough when reported | none | live fetch | trial `retrievedAt` | omitted — never invented |
| unavailable | `TrialLookupState.kind === 'unavailable'` | fetch throw or HTTP error | none | live fetch | none | exact message, not "no trials" |
| empty | `kind === 'empty'` after successful fetch | zero studies in response | none | live fetch | state `retrievedAt` | distinct from unavailable |
| cache chip | `cacheState` on live/cached/empty | 6h TTL cache in `lookupTrials()` | none | prior fetch | state `retrievedAt` | LIVE / CACHED / STALE |

---

## Sources panel

| value | source | calculation | artifact dependency | external dependency | retrieval timestamp | fallback behavior |
| --- | --- | --- | --- | --- | --- | --- |
| source cards | `ResearchResult.sources` | entity-filtered registry subset | resolved keys | bundled registry | source `retrievedAt` | empty when none used |
| URL | `ExternalSource.url` | stored registry URL | none | registry | none | opens source-specific page |
| checksum | `ExternalSource.checksum` | SHA-256 of stored fields | none | registry | none | used in fingerprint, not shown |

---

## Research receipt

| value | source | calculation | artifact dependency | external dependency | retrieval timestamp | fallback behavior |
| --- | --- | --- | --- | --- | --- | --- |
| all receipt fields | `researchReceipt(result)` | computed from result object | artifact id, asOf, context | sources queried/used | `result.retrievedAt` | modelUsed is `none` until a model path exists |

---

## Removed (legacy faults)

| removed | why |
| --- | --- |
| `ALL_EVIDENCE.length` catalog dump | page-level constant, not subject-specific |
| `graph.stats.*` without asOf | full corpus, not Time Machine snapshot |
| default `'type 2 diabetes'` trial query | not tied to research subject |
| `'unknown'` / `'Untitled study'` trial placeholders | invented fields |
| bundled `{kind} references` panels | unrelated source dumping |
| merged personal + external narrative | replaced by separated sections |

---

## Test coverage

| test file | what it guards |
| --- | --- |
| `src/engine/research/research.test.ts` | engine invariants, corruption detection, trials, golden fingerprint, negative tests |
| `src/views/researchUi.test.tsx` | question-first UI, asOf-derived counts, unavailable vs empty trials, section structure, no unrelated sources |

---

## Verdict

Research Mode now displays only values traceable to the current personal artifact
(evaluated at global `asOf`) or to real external retrieval (bundled registry subset
for resolved entities + live ClinicalTrials.gov for the resolved query). Accuracy
beats completeness: fewer verified sources beat a large unrelated catalog.
