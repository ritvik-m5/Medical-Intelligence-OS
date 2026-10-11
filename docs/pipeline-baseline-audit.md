# Pipeline baseline audit (2026-03-21)

## Confirmed data flow

1. **Upload** → `DocumentInput` in `src/state/store.tsx` (localStorage corpus restore).
2. **Ingest** → `ingestDocument()` builds sections/segments, runs extractors, reconciles duplicates (`src/engine/ingest.ts`).
3. **Patient identity** → `derivePatientFromCorpus()` from document headers + demographic facts (`src/engine/patient/derive.ts`).
4. **Graph** → `buildGraph(patient, results)` indexes entities, edges, stats (`src/engine/graph.ts`).
5. **Contradictions** → `findContradictions()` cross-document disagreements; `qualityFlags()` single-source data-quality warnings (`src/engine/contradiction.ts`).
6. **Derive** → `derive()` runs versioned rules with proof DAGs (`src/engine/derive/engine.ts`); conflicts include `qualityFlagContradictions`.
7. **Snapshots** → `snapshotAt(graph, asOf)` filters facts by knowledge date (`occurredAt <= asOf`). Shared helpers in `src/engine/temporal/eligibility.ts` also filter contradictions, quality flags, rule inputs, and Ask blocks.
8. **Verify** → `verifyProvenance()` re-reads spans and checks proof order (`src/engine/verify.ts`, `src/engine/evidence/spans.ts`).
9. **AI** → `gatewayConverse()` routes general/record/research; `validateAIResponse()` post-checks (`src/ai/`).

## High-risk defects addressed in this pass

| Area | Issue | Mitigation |
|------|--------|------------|
| Medication reconciliation | Same-day active vs discontinued dose false positives | `doseConflicts` already filters `status === 'active'`; regression tests in `alexMorganRegression.test.ts` |
| Metformin cross-record | Must preserve uncertainty | `crossRecordDoseDiscrepancy` requires explicit uncertainty cues |
| Debugger UI | Corrupted quality tab JSX | Repaired `DebuggerView.tsx` quality panel |
| Provenance | Duplicate offset logic | Central `src/engine/evidence/spans.ts`; numeric span check in `verifyFacts` |
| Metrics | “Inconsistency” lumping | Debugger separates contradictions vs `qualityFlags` |

## Verification commands

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest suite |
| `npm run verify` | Versions, rules, artifacts, reproducibility |
| `npm run audit:meaning` | UI/metric semantics |
| `npm run audit:ai-validation` | AI boundary checks |

## Prioritized next work

1. Temporal leakage integration tests across `asOf` + derive inputs.
2. Finding taxonomy types on `ContradictionKind` (extend, don’t rename silently).
3. Proof replay harness comparing derivation hashes after corpus reload.
4. Debugger metric definitions exported from one module for sidebar + quality scorecard.
