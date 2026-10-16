# Medical Memory — Platform handbook

> **Start here:** [README](../README.md) · [Pipeline audit](./pipeline-baseline-audit.md) · [Product audit](./product-audit.md)

**Your health, reconstructed.**

This document is the full technical and product reference. The repository README is the concise entry point for GitHub and new contributors.

Medical Memory is not a symptom checker, not a chatbot, and not a record viewer. It is a
**provenance-first inference platform for a person's health history**.

The core idea is unchanged and now runs through every layer: **nothing this system concludes
exists without a machine-checkable chain back to the characters of a source document.**

```
Documents  →  Facts (provenanced assertions)  →  Entities (resolved concepts)
                      ↓
              Intervals (courses and spans)
                      ↓
           Derivations (proof DAGs, one per conclusion)
                      ↓
    Contradictions · Care gaps · Trajectories · Quality · Answers
```

Everything downstream of the graph is a `Derivation`: a directed acyclic graph of steps ending in
exactly one conclusion. A finding is never a sentence — it is a proof object a machine can check
and a person can traverse, down to a character span.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # typecheck + production build
npm run typecheck  # tsc --noEmit
npm test           # 670 tests across the engine, the platform layer, the builder and a full DOM mount
```

```bash
npm run verify     # release governance: versions, rules, artifacts, reproducibility
npm run audit:nav  # sidebar, router and ViewId agree (20 views, no orphans)
npm run audit:meaning # every view has a primary question, data, proof, action, empty state and AI handoff
npm run audit:ai-gateway # routing, provenance, conversation state, streaming and fallback invariants
npm run audit:ai-validation # model claim verification: numbers, dates, personal/external separation, general-chat bypass
```

The app opens on the **Builder**: describe what you want, press Build, and watch the real pipeline
run. Press **⌘K** anywhere in the workspace for the command palette, which searches views, derived
findings and questions.

New here? Open **How it works** in the sidebar. It explains every tab in plain language, in about
two minutes, and every card on it is a link.

The workspace lands on the **State of the Record**: five sections — *Established*, *Changed*,
*Conflicted*, *Uncertain*, and *Open questions* — each linking to the evidence or proof that
produced it. Open questions are a first-class engine object (see *Record questions* below), with a
lifecycle the reader drives: open → investigating → answered → dismissed.

The workspace now opens on **Home** (always in the sidebar): a greeting, four doorways — *Ask*,
*Recent changes*, *Open questions*, *Your record* — and the recent changes and open questions the
record actually contains. A **What is this** tab explains why the software exists and why it matters
at three depths — *Explain like I'm 10*, *Plain English*, *Technical detail* — selected once and
persisted as a preference (the engine never changes, only the words do). A **Reset** tab is one safe
place to undo things, where every destructive action needs an explicit confirmation and states what
it removes and what it leaves.

The layout is ratio-locked across devices: a phone gets an off-canvas navigation drawer (hamburger
in the top bar), a single-column grid, and a stacked time scrubber; a tablet gets the collapsed
sidebar and two-up grids; a desktop keeps the full layout. Root type scales with `clamp()` and text
is never browser-inflated on rotation, so the proportions hold at every width.

### Trying it with your own records

`npm run create:records` writes five deliberately **messy** medical documents (inconsistent
headings, stray spaces, and a decimal-shift typo in a lab value) into
`~/Downloads/Medical records/` as neat `.txt` files. Then:

1. Run `npm run dev` and open the **Records** tab.
2. Drag a `.txt` file into the **Import a document** dropzone (or paste its text). The **Title,
   Document type, Document date and Facility are auto-filled** from the file's content and name —
   you can correct any of them before extracting.
3. Press **Extract and add to the graph** — the engine pulls out medications, labs, conditions,
   allergies and vitals, and shows every fact with the exact character span it was read from.
4. The **Reset** tab (or the *Reset to synthetic record* button on the import panel) returns the
   workspace to the built-in record at any time.

`src/engine/accuracy.test.ts` is the proof this is real: it ingests those same five messy files and
asserts the engine extracts the right medications, lab values, conditions and allergy, flags the
implausible potassium reading instead of trusting it, gives every fact a source span, and orders
the documents chronologically.

Or open **Chat** and ask the record something. It is the fastest way to see what this does.

---

## Chat: asking the record

A conversation, not a chatbot. The engine answers first and completely, from the artifact. A model can
rewrite the wording — and the badge changes when it does — but it cannot add a sentence's worth of
meaning, because it never sees anything except the engine's own answer.

What makes a reply worth reading is the four things under it:

```
YOU   What changed?

ENGINE-DERIVED · changed
      14 documented changes in the window this artifact covers:
      3 status changed, 4 value changed, 2 added, 1 removed, 4 new document.
      Metformin — 500 mg to 1000 mg (2024-03-14 → 2024-09-02). The record does not
      say why the dose changed…

      WHAT THIS DOES NOT SAY
      A change is between two documents, not between two days. The engine knows what
      the record shows at each end of the window; it does not know when in between
      the change actually happened.

      6 sources · each opens the exact characters it came from
      ▸ Show the full proof          4 steps, from the statements to the conclusion
      ▸ Open the Time Machine        every change with both dates and both documents

      ▾ MEDICAL MEMORY RECEIPT   MM-3F2A-9B41        engine wrote this
        Artifact      MM-3F2A-9B41
        Corpus        13 documents · 271 facts
        Engine        2.2.0 · ruleset 8f3c1e9a4b
        Verification  100% · clean
        Model used    No

      ASK NEXT   What was knowable a year ago?   Which document caused the change?
```

Four things there, and each is load-bearing.

**The engine answers first.** Questions about change, conflict, absence and time are answered directly
from the structures the views already use — `changes`, `contradictions`, `quality`, `snapshot` — so the
answer cannot disagree with the view that shows the same data. Everything else goes to the explainer,
which owns the proof-shaped answers.

**Every answer says what it does not say.** Not as a disclaimer: a specific limitation. *"A change is
between two documents, not between two days."* The chat layer guarantees one on every reply, preferring
the explainer's own words and putting a floor behind them, because a reply without a limitation reads
as a complete answer and nothing here is ever complete.

**Every answer offers something real to do next.** An action is a link to a proof, to the exact
characters behind a claim, or to the view that owns the question. There is no action that does nothing.

**Every answer carries a receipt.** The same six facts in the same order every time, so a reader learns
to read it once and then trusts it everywhere. The last line is the one that matters: *whether a model
wrote the prose*.

### The state of the record is the header

```
documents 13   facts 271   findings 14   changes 14   conflicts 3        100% verified
```

Every number is read from the artifact and every one is a button. Press *conflicts* and you are in the
Debugger. Nothing in that strip is decoration, and nothing in it is a marketing statistic.

### Empty states say what was searched

There is no "no data" anywhere. Asked what changed on a record with no changes:

> **No documented change was found** in the window this artifact covers.
>
> That is a statement about the documents, not about you. The record contains no pair of statements
> that describe the same thing differently at two points in time.
>
> *Nothing in these documents changed. That is not the same as nothing having happened — a change
> nobody wrote down leaves no trace in the record.*

---

## The product-meaning audit

`docs/product-audit.md` runs every one of the 17 views against four questions — *what user question
does this answer, what artifact data powers it, what evidence supports it, what action can follow* —
and records what it found. The six gaps it identified are the six things built in this pass; two views
were judged already meaningful and left alone; nothing was removed.

`npm run audit:nav` checks mechanically that the sidebar, the router and `ViewId` agree. It fails if a
view is added to one and forgotten in another.

---

## Connecting a local model (llama 3.2)

The explainer works with no model at all — the engine answers on its own, offline, with no setup.
A language model is something you turn on, and it can only **rewrite** the engine's answer. It never
sees a question without the proof, and its citations always come from the engine.

```bash
# 1. Get the model (one time)
ollama pull llama3.2

# 2. Make sure Ollama is running
ollama serve

# 3. Start the app
npm run dev
```

Then, in the Builder's **Ask the artifact** panel: tick **Rewrite answers with a language model**,
press **Test connection**, and ask a question. The badge changes from `engine only` to
`model prose`.

### Why it works without touching Ollama's settings

The default endpoint is `/llm` — a path on **this app's own origin**. The Vite dev server forwards it
to `http://localhost:11434`. The browser therefore never makes a cross-origin request, so Ollama
never refuses it and `OLLAMA_ORIGINS` never has to be set. It works on a fresh checkout.

```
browser  →  /llm/v1/chat/completions   (same origin, no CORS)
                 ↓  Vite proxy
         →  http://localhost:11434/v1/chat/completions
```

If your model is somewhere else, point at it without editing any file:

```bash
OLLAMA_HOST=http://192.168.1.50:11434 npm run dev
```

Or change the endpoint and model in the app's **Settings** — that choice is remembered per browser.

`npm run dev:model` starts a stand-in model server on port 11434, so the whole path can be exercised
without downloading anything.

### On "make it public"

I have deliberately **not** exposed a port to the internet, and I want to be straight about why.

A public Ollama endpoint means anyone who finds the URL can use your machine's CPU and GPU, run any
model you have pulled, and read whatever the endpoint returns. There is no authentication on
Ollama's OpenAI-compatible API. That is a real decision with real consequences, so it is yours to
make rather than one for me to make silently.

What is in place:

- **Any endpoint works.** Set the URL in Settings to whatever you want — a tunnel, a hosted
  inference provider, another machine on your LAN. The adapter is protocol-aware, not
  Ollama-specific.
- **The request carries no patient data.** The model is handed the engine's answer for one finding —
  the prose and its citations. No identifiers, no documents, no question the user typed. The
  `ExplanationRequest` type has no field that could carry them.
- **Failure is safe.** If the endpoint is unreachable, the engine's own answer is returned with a
  note saying the model was not used. A network failure never looks like a missing finding.

If you do want it reachable from outside your machine, the usual shape is a tunnel with
authentication in front of it (Cloudflare Tunnel, Tailscale, or a reverse proxy with a bearer token)
rather than exposing the port. The adapter sends `Authorization: Bearer <key>` when you set an API
key in Settings, so a token-protected proxy works as-is.

---

## What is new in this evolution

The first version was a provenance-first record. This version turns it into a platform, without
weakening the invariant that made the first version trustworthy.

The through-line across all of it: **every new capability reads from the artifact and the proof
rather than inventing its own numbers.** A saved run stores the corpus and re-derives the graph. A
branch re-runs the rules and reports which proof moved. A comparison resolves each difference down to
the premises on both sides. The Research Lab opens one artifact and answers what depends on what, how
stable each finding is, and what would change if the evidence did. Nothing here has a second source of
truth.

### 0. A front door that builds for real

The builder is not a landing page with a loading animation. Pressing Build runs the actual pipeline
in the browser and the preview is populated from the artifact it produced. See
[the front door](#the-front-door-the-builder).

### 0b. The invariant is now checked at runtime, on screen

`src/engine/verify.ts` re-reads every fact from its source span and validates every proof graph. The
tests have always asserted this; now the product does too, live, and reports it in a persistent
status pill. A score of 100 means *nothing* failed — it is capped below 100 the moment anything does,
because a claim about correctness has no tolerance for rounding.

### 0c. Verifiable, and now reproducible

Those are different claims, and the second is the stronger one.

| | Claim | Answered by |
| --- | --- | --- |
| **Verifiable** | every fact re-reads from its own span, every proof is a well-formed DAG | `src/engine/verify.ts` |
| **Reproducible** | the same record and the same engine give the same result, bit for bit | `src/engine/identity.ts` |

Every build is named:

```
MM-27C7-F194
   │     └── result hash: the findings, their rule, severity and confidence
   └──────── corpus hash: the documents, hashed order-independently
```

The name is computed, never assigned, and it combines the input and the output — so quoting it names
both. Alongside it are two versions: the engine and the rule set. Both are recorded because a change
to either can change the result without any change to the record.

**Reproduce this artifact** re-ingests the corpus from scratch, rebuilds the graph, runs the rules
again, hashes the output and compares it finding by finding. It reports one of three outcomes:

- **identical** — same corpus, same rule set, same result, every finding unchanged
- **changed** — reproducible, but something moved, and it says exactly what: which findings were
  added, which were removed, and which had a severity or confidence change
- **incompatible** — a different engine or identity schema. A migration is required rather than a
  silent re-derivation, mirroring how persistence treats a version mismatch.

The identity hash is FNV-1a over the corpus and the result. It is an identity, not a security
control: nothing here defends against a forged artifact, only against an unnoticed change.

### 0d. The version number is a history, not a constant

`ENGINE_VERSION` used to be a magic string someone had to remember to bump. It is now the head of a
declared, dated history in `src/engine/versions.ts`: each release carries its summary, the rules it
introduced, the rules it retired, and whether it was **breaking** — meaning a result from either side
cannot be compared with the other.

That buys three things:

- An artifact can say not just which engine produced it but **what that engine was**.
- A comparison between two artifacts can explain a difference in findings as a change in the engine.
  The difference between "the numbers moved" and "14 rules were added in 2.0.0" is the difference
  between a report and an explanation.
- A version this build has never heard of is reported as such rather than guessed at.

### 0e. Compare runs — rule evolution, made inspectable

Two runs, side by side, compared at the level of the **proof** rather than the count.

```
RUN A                          RUN B
2.2.0 · same rule set          2.2.0 · same rule set
18 documents, same hash        18 documents, same hash

37 findings                    40 findings
                               +3 added
2 changed
```

Click a changed finding and both proofs are shown in full:

```
BEFORE                              AFTER
gap.monitoring_absent               gap.monitoring_absent
high · grade A · conf 0.8300        high · grade B · conf 0.7100
6 premises                          4 premises
─────────────────────────           ─────────────────────────
Documented — T2DM active from…      Documented — T2DM active from…
Rule applied — Expected A1c, TSH    Rule applied — Expected A1c only
Rule applied — Not documented…      Rule applied — Not documented…
Conclusion — active with no…        Conclusion — active with no…
```

Every difference is named: a rule change, a severity move, an evidence-grade move, a confidence move,
a change in the premises the proof rests on, or a change in the number of steps. A finding that
survives a change keeps its identity, so it is reported as *changed* rather than as an add plus a
remove.

When the two runs read different records, the comparison says so instead of blaming the engine. When
the engine versions differ, it explains what changed between them. It never presents a difference it
cannot account for as a finding about the record.

### 0f. A durable registry — a saved run is a claim, and opening it checks the claim

The identity from 0c named a result. A registry makes that name *durable*: save a run, close the tab,
come back next week, and the run is still there with its corpus intact.

The design decision that matters is **what is stored**:

| Stored | Not stored |
| --- | --- |
| the identity (corpus hash, result hash, engine, rule set) | the graph |
| the corpus itself — every document, verbatim | the facts |
| a cache of the finding titles, for listing | the proofs |
| the provenance verdict at the time of saving | the quality report |
| the lineage, when it is a branch | the FHIR bundle |

The graph is **re-derived** from the stored corpus when the run is opened. That is the whole point:
a saved run cannot drift from its sources, because the sources are what is kept. The cached findings
exist so the list is readable without re-deriving forty runs, and they are checked against a fresh
derivation the moment one is opened — a stale cache is detected rather than believed.

So opening a saved run is not a lookup, it is a **claim being tested**:

```
MM-3F2A-9B41: Reproduces exactly
Re-derived from its own documents: corpus, engine, rule set and result all match.
```

Three verdicts, and none of them is a shrug:

- **identical** — same corpus, engine, rule set and result. The strongest thing the system can say.
- **changed** — reproducible, but something differs, and it names what.
- **incompatible** — a different engine or identity schema, so a migration is required rather than a
  silent re-derivation.

What this buys immediately: **Compare Runs becomes cross-session.** Two runs built weeks apart can be
put side by side, because both sides are re-derived from stored corpora rather than from objects
living in one page's memory. The section says so when it is doing that.

### 0g. Research branches — what changed, and which proof caused it

Duplicate a run with exactly one thing changed, and see what moves:

```
                    ┌── Branch: withhold gap.monitoring_absent
Original MM-3F2A ───┼── Branch: evaluate as of 2024-03-01
                    └── Branch: add a document
```

Every branch offered is one this build **can actually run**, which is a narrower set than it first
appears:

| Branch | What it really does |
| --- | --- |
| Withhold a rule | re-derives with that rule removed from the registry |
| Evaluate at an earlier date | re-derives as of a date the record supports |
| Add a document | re-derives with one more document in the corpus |

**"Run this under engine 2.1" is deliberately absent.** There is one engine in the binary. The
version manifest from 0d records *which* engine produced a run; it does not pretend to run another
one. Offering it would be a promise the code cannot keep.

The two properties that make this more than a toy:

**A branch changes the rule set version, not the corpus hash.** Withholding a rule produces an
artifact whose `corpusHash` is identical to its parent's and whose `rulesetVersion` differs — because
the identity now hashes the *effective* rule set, not the whole registry. Without that, two runs
reasoning with different rules would claim the same version, which is exactly the confusion the
version exists to prevent.

**Lineage is recorded on the artifact, not inferred from the session.** The parent's identity is
written into the request and carried onto the artifact, so it survives being saved, reloaded and
compared across sessions.

And an unavailable branch is shown **disabled with its reason**, rather than hidden:

> *Withhold a rule* — No rule fired on this record, so there is nothing to withhold.

A reader is entitled to know what the system cannot do as well as what it can.

### 0h. The Research Lab — where the artifacts are the point

A workspace that opens one durable artifact and answers everything that can be asked of it without
leaving the page.

**Baseline · Branches · Proof Diff · Impact · Stability · Questions · Lineage**

The header states the four things that determine the result — engine, rule set, corpus, content
address — plus the verification score for the artifact in front of you, not for a fixture.

### 0i. Counterfactuals, labelled as such

> *If "Urgent care visit, acute sinusitis" had never been written…*

The engine answers, and the answer is **not** presented as history. Every counterfactual carries:

```
COUNTERFACTUAL
baseline MM-3F2A-9B41 · 13 findings  →  branch MM-71C4-22E8 · 12 findings  →  1 proof changed

· This is not a statement about the record. Nothing here says what was true,
  only what would follow if the record had been different.
· No clinical recommendation follows from this. A counterfactual result is not
  advice, and this system does not produce advice.
· A finding disappearing does not mean it was wrong. It means the remaining
  evidence no longer supports it.
· A finding appearing does not mean it is correct. It means the added evidence
  would support it under the same rules.
```

Those four statements are hard-coded in the engine, not configurable. A caller that could remove
them could present a hypothetical as a finding, which is the one thing this layer exists to prevent.

**And removing evidence is not subtraction.** Withholding one document from the real record takes it
from 13 findings to **17**: the visit that documents a problem is also the thing that stops the
record being silent about it. Take the visit away and silence and monitoring-gap rules fire where
none did before. That is the strongest available evidence that a branch is a real re-derivation
rather than a filter over the parent's conclusions, and there is a test asserting it.

### 0j. Impact analysis — a chain, not a count

```
DOCUMENT doc_h2sscw1vig9pu removed
↓  14 facts invalidated
↓  3 entities lose evidence
↓  2 derivations cannot be derived
↓  1 finding disappeared
↓  FHIR export: 14 facts would leave the bundle
```

Every edge carries the reason it exists, in terms a reader can check against the source:

```
document:doc_h2ssc → contains → fact:fact_9f21
  "Temperature: 38.4 °C" is read from this document.
fact:fact_9f21 → cites → derivation:deriv_h2ssc.gap
  "Active problem silent in the record" rests on this premise, which the removal takes away.
```

Nothing here re-derives. It reads the dependency structure the engine already recorded —
`fact.docId`, `derivation.factIds`, `entity.factIds` — and propagates along it, which is why the
report can name the reason for every edge rather than asserting a total.

The distinction between a **lost** finding and a **thinned** one is kept throughout: one is a
conclusion the record no longer supports, the other is a conclusion it supports less well.

### 0k. Proof diff — added · removed · replaced · changed · unchanged

```
BASELINE                              BRANCH
premise: Documented — T2DM…           premise: Documented — T2DM…
premise: Documented — HbA1c 8.9…      —                      ← removed
rule: Expected A1c, TSH               rule: Expected A1c, TSH
conclusion: Active with no…           conclusion: Active with no…
```

Alignment is by `(kind, label)` with a longest-common-subsequence walk, **not** by step id. Ids are
positional in some proofs, so an inserted premise would otherwise make every following step look
replaced. A step removed and one added at the same position, of the same kind, is reported as
`replaced` rather than as an add plus a remove — and there are tests for both.

### 0l. Evidence stability — derived, never scored

For every finding: evidence count, independent documents, supporting spans, flagged spans, dependency
depth, rules involved, branch sensitivity, date sensitivity. Then one of four labels:

**stable · sensitive · fragile · unsupported**

These are not confidence numbers and they do not replace one. A confidence number says what the
engine thinks of *one proof*; stability says whether that proof would survive a different record.

The property that keeps it honest: **where a value cannot be measured it is `null`, and the label
says so.** With no branches run, branch sensitivity is *not measured* — never zero:

> *stable* — It rests on more than one document, no premise is flagged, and it is not a single-fact
> conclusion. **Branch sensitivity has not been measured: no branch has been run against this
> artifact, so nothing here says whether it would survive one.**

And when a structural weakness decides the label, a *measured* branch sensitivity is still reported
in the reasons. The classification is one word and has to choose; the reasons do not.

### 0m. Research questions — assembled, never generated

Seven questions, each resolved through a real computation over the artifact and its proofs:

| Question | Resolved by |
| --- | --- |
| Why does this finding exist? | its own proof, plus what the rule refuses to conclude |
| What evidence is responsible? | premise facts, documents, depth, stability profile |
| What would make it disappear? | per-premise impact, separating unique from shared |
| What changed between these two runs? | finding-by-finding, with corpus and engine compared first |
| Which conclusions depend on this document? | the full impact chain |
| Which findings are most sensitive? | stability profiles, least-supported first |
| What was knowable as of a date? | **a real as-of branch, or a refusal** |

Every answer carries its citations and its limitations. The last is the clearest example of the
discipline:

> This needs a branch evaluated at that date. Run one and the answer will be computed from the
> re-derivation rather than estimated from the baseline.
>
> *Nothing is claimed. Answering from the baseline would present later evidence as if it had existed
> earlier, which is the exact error this question exists to expose.*

### 0n. Content-addressed artifacts

An artifact now carries **two names**, and they answer different questions:

```
artifactId   8f3c1e9a4b27…   SHA-256 over corpus · rule set · engine · result
id           MM-3F2A-9B41     short enough to quote aloud
```

The address is equal exactly when the corpus, the engine, the effective rule set and the result are
all equal. **Nothing else.** The short id is derived from the same material at 32 bits, so it is a
label rather than an identity — collisions are possible and nothing depends on it.

SHA-256 is implemented in `src/engine/hash.ts` rather than imported, for one reason: the identity has
to be computable **synchronously**. `crypto.subtle` is async, and an async identity would mean a
build could not name its own result until a promise settled — so every caller downstream would have
to handle a window in which the result exists but has no name. It is asserted against the published
FIPS 180-4 vectors, including the padding boundaries at 55 and 56 bytes and multi-byte UTF-8.

Storage is keyed by content address, so saving the same run twice replaces rather than duplicates —
and that falls out of the key rather than being enforced by a comparison.

### 0o. The store is an interface, not localStorage

```
save() · get() · list() · delete() · compare() · reproduce() · lineage()
```

Three implementations: **memory** (the reference, used in tests), **localStorage** (the shipped
adapter), **HTTP** (a server that wants to hold the registry). The interface is async even where the
implementation is not, because a synchronous one would make the server adapter impossible without
changing every caller.

What is persisted does not vary by adapter: **corpus + identity + lineage + metadata + a cached
listing**. The derived graph is never authoritative state and is never sent as such. It is re-derived
on open and checked against the identity that was stored.

`lineage()` is computed from the stored parent pointers every time. There is no separate lineage
table that could fall out of step with the artifacts it describes — the graph *is* the parent
pointers, read back.

An unreachable server is reported as `unreachable`, not as an empty registry. *"You have no saved
runs"* and *"I could not ask"* are different answers and must not look the same.

### 0p. Release governance that can fail

```bash
npm run verify:versions         # dated, ordered, breaking ⇔ major bump
npm run verify:rules            # coverage, retirements, rule set hash moves when rules move
npm run verify:artifacts        # addresses recompute, caches match a re-derivation, lineage resolves
npm run verify:reproducibility  # every scenario builds twice to the same identity
```

Each exits non-zero on any error finding, so it fails a build rather than printing a warning nobody
reads. Findings name what to do:

```
FAIL  rule-coverage (28 examined)
      error gap.smuggled_rule
        This rule is in the registry but no release records introducing it. Add it to
        the rulesAdded list of the release that introduced it.
```

The checks are **pure functions of their inputs**, not readers of module globals, so they can be
pointed at a deliberately corrupted history and asserted to notice. A governance check that cannot
fail is decoration, and the only way to know one works is to watch it fail — so there are mutation
tests for all of it: a rule added with no release, a rule deleted with no retirement, a retirement of
a rule that never existed, a breaking release without a major bump, a major bump not marked breaking,
dates going backwards, a running version that is not the head, a malformed version *and* a malformed
date (both reported, neither hiding the other), a rule set change that leaves the hash unmoved, and a
hash that moves when the rule set did not.

**These checks caught real drift on the first run.** Releases 2.1.0 and 2.2.0 shared a date, and the
check refused to accept the ordering. The fix was not to invent a date: two releases genuinely can
ship on the same day, so the rule is now that the date must not go *backwards*, with a test asserting
both the rejection and the same-day allowance.

### 0q. A page that explains the whole thing in plain language

Every project accumulates tabs, and a tab nobody understands may as well not exist. **How it works**
is a reading page, not a control surface: one idea, then every tab explained the same three ways.

> **Every conclusion comes with a receipt.**
>
> This reads medical records, finds the important things, and shows you the exact sentence in the
> exact document behind every single conclusion it reaches.

Then a worked example, because the shape is easier to show than to describe:

```
FINDING            Blood sugar has been above target for about two years.
WHERE IT CAME FROM "HbA1c 8.9% (target <7.0%)" — Lab report, 14 March 2024, line 12
```

Then all fifteen tabs, grouped the way the sidebar groups them, each answering **what it is**, **when
to use it** and **what you will see** — and each card is a link, so the page is a way in rather than a
description of one. Then nine words that make the rest of the app readable, six things the system will
never do, and a way home at the top and the bottom.

Two properties are asserted rather than assumed. The test **names all fifteen tabs**, so a tab added
to the sidebar and forgotten here fails the suite — a guide that quietly omits a page is worse than no
guide. And the prose is checked for jargon (`derivation`, `provenance`, `deterministic`), with the
glossary as the single exempt section, because that is where those words are explained.

### 0r. A local model, connected without opening anything up

The explainer already worked with no model at all. Connecting one is now a checkbox rather than a
build step, and the interesting part is how it avoids the usual CORS fight.

```
browser  →  /llm/v1/chat/completions   (this app's own origin)
                 ↓  Vite proxy
         →  http://localhost:11434/v1/chat/completions
```

Ollama refuses browser requests from an unlisted origin, so talking to it directly means setting
`OLLAMA_ORIGINS` and restarting it. Proxying `/llm` through the dev server means the browser only ever
talks to its own origin. **It works on a fresh checkout with no configuration**, and a reader pointing
at a model somewhere else sets one variable or edits the endpoint in the interface.

The adapter is protocol-aware rather than Ollama-specific: `openai` covers Ollama, vLLM, LM Studio and
llama.cpp, and `open-webui` covers Open WebUI, which is OpenAI-compatible under a different path.

**And the boundary holds at the wire.** The model receives the engine's answer for one finding as its
entire context — prose and citations — and returns prose. The citations shown to the reader are the
engine's, always. There is a test that hands the model a citation it invented and asserts it does not
appear in the answer, and another that asserts the system prompt forbids adding a claim and forbids
answering a clinical question.

Failure is safe in three ways, each tested: an unreachable endpoint, an HTTP error, and an empty
answer all fall back to the engine's own words with a note saying the model was not used. A network
failure must never look like a missing finding.

**On making it public.** I did not expose a port to the internet, and the README says why rather than
doing it quietly: Ollama's OpenAI-compatible API has no authentication, so a public endpoint lets
anyone use your hardware. What is in place instead is any-endpoint support, a bearer token for a
token-protected proxy, and the fact that the request carries no patient data — the `ExplanationRequest`
type has no field that could carry an identifier, a document, or the question the user typed.

### 0s. A conversation with the record

The explainer lived inside the Builder as a panel. A panel is right for one question about the finding
in front of you, and wrong for a conversation — which is how people actually interrogate a record. So
the panel now hands off to a full page, and that page is where the product becomes usable.

What makes it not a chatbot is on **every** reply, and there are four things:

**The engine answers first.** Questions about change, conflict, absence and time are assembled
directly from the structures the views already use — `changes`, `contradictions`, `quality`,
`snapshot` — so a chat answer *cannot disagree* with the view that shows the same data. Everything
else goes to the explainer, which owns the proof-shaped answers.

**Every answer says what it does not say.** Not a disclaimer — a specific limitation:

> *A change is between two documents, not between two days. The engine knows what the record shows at
> each end of the window; it does not know when in between the change actually happened, and it does
> not know what happened that nobody wrote down.*

The chat layer **guarantees** one on every reply. Building it surfaced a real gap: the explainer
supplied a limitation for some intents and `null` for others, so a reply could read as complete. Now
the explainer's own words are preferred and there is a floor behind them, because nothing here is ever
complete.

**Every answer offers something real to do next.** An action is a link to a proof, to the exact
characters behind a claim, or to the view that owns the question. A test asserts that no action can be
empty — it must name a view, a proof or a set of spans.

**Every answer carries a receipt.** The same six facts in the same order every time, so a reader
learns to read it once and then trusts it everywhere. The last line is the one that matters: whether a
model wrote the prose.

And the header is the state of the record, not a dashboard: `documents · facts · findings · changes ·
conflicts · verified`, every number read from the artifact, and every one of them a button.

### 0t. Intent detection that survives how people actually ask

Two bugs found by writing the tests, and both were the same mistake:

```
\bconflict\b     did not match "conflicts"
\bcontradict\b   did not match "contradiction"
```

A closing word boundary after a stem means the *inflected* form — which is the natural way to ask —
falls through to the generic path. The fix is to match the stem with `\w*` and keep the leading
boundary, so `\bchange\w*` catches "changed" and "changes" while "exchange" stays out.

### 0u. The product-meaning audit

`docs/product-audit.md` runs every one of the 17 views against four questions:

> What user question does this answer? What artifact data powers it? What evidence supports it? What
> action can follow?

It found six gaps, which are the six things built in this pass. It found two views already answering
their four questions with linked evidence, and left them alone rather than rewriting them for the
appearance of work. And it found nothing to remove — I would rather report that than delete a view to
look decisive.

`npm run audit:nav` enforces the part that is mechanical: the sidebar, the router and `ViewId` must
agree, and it fails if a view is added to one and forgotten in another.

### 1. The Derivation Engine — conclusions became proof objects

`src/engine/derive/` is the new core. Every rule returns the same shape, and the engine owns
ordering, de-duplication and ranking, so a new rule is a pure function and nothing else changes.

A derivation is a DAG of steps:

| Step kind | What it is |
| --- | --- |
| **premise** | one documented statement, with its document and span |
| **interval** | a period reconstructed from premises |
| **rule** | the inference, with the rule id and its declared reliability |
| **conclusion** | the single claim, and nothing beyond it |

Confidence is **propagated, never asserted**: it is the premises' source authority combined through
the rule's declared reliability. That is why a finding resting on a patient questionnaire can never
outrank one resting on a lab report, and why two findings on the same evidence always score the
same.

The UI renders the graph (`ProofGraph`) with premises on the left and the conclusion on the right.
This is the part that cannot be copied by putting a language model in front of a PDF.

### 2. Interval reasoning — medications are periods, not events

`src/engine/derive/intervals.ts` reconstructs **medication courses** and **condition spans**, and
implements the full Allen interval algebra (thirteen relations: `before`, `meets`, `overlaps`,
`during`, `contains`, `starts`, `finishes`, and their inverses).

Rules now ask *"was A true while B was true"* rather than *"is A's date before B's"*. That single
change is what makes the following possible:

- a stopped medication that a later list still presents as current
- a prescription whose course **intersects** a recorded allergy interval
- two drugs of one class with genuinely overlapping courses
- a therapy stopped while its indication stayed open, with nothing documented to replace it

An `open` course means the documents do not close it. It is explicitly **not** the same as "still
taking", and the interface says so everywhere the word appears.

### 3. Trajectory analysis — direction only when the line fits

`src/engine/derive/trajectory.ts` fits an ordinary least squares line, reports R², and refuses to
talk about direction when the fit is poor or there are fewer than three readings. Values *restated*
inside later narrative notes are excluded from the fit, because a number quoted in a 2026 note about
2024 is documentation of an earlier event.

Fast-change thresholds come from a small **declared** table (`FAST_CHANGE_LIMITS`), not a formula.
Where no threshold is declared, no finding is produced. A rule firing zero times is a valid outcome,
and the rule registry shows those rows rather than hiding them.

### 4. Fourteen rules across five categories

| Category | Rules |
| --- | --- |
| **Consistency** | `temporal.list_contradicts_course` |
| **Safety** | `temporal.allergy_prescription_overlap`, `safety.duplicate_therapy`, `safety.contraindicated_pair` |
| **Care gaps** | `gap.monitoring_absent`, `gap.unresolved_discontinuation`, `gap.immunization_due`, `gap.documentation_silence` |
| **Trajectory** | `trend.threshold_crossed`, `trend.rapid_change` |
| **Data quality** | `quality.implausible_value`, `quality.unit_mismatch`, `quality.same_day_conflict`, `quality.demographic_mismatch` |

That is the complete list. `RULE_REGISTRY` in `src/engine/derive/engine.ts` is the only place a
conclusion can originate, which is what makes the surface area auditable: there is a finite,
inspectable set of the ways this system is capable of forming an opinion.

The counts in the interface are read from the registry rather than written into the copy, so a
sentence that says "14 rules across 5 categories" cannot go stale when a rule is added.

Two things that are deliberately **not** rules, and are not counted above:

- **External evidence linkage** (`src/engine/evidence/`) attaches published references to findings
  that already exist. It produces no conclusions of its own.
- **Conflict detection** (`src/engine/contradiction.ts`) answers a different question: *do two
  documents disagree?* It produces no conclusions either. It produces the raw material.

### Where disagreement is detected, and where it is interpreted

Detecting a disagreement and deciding what it means are separate jobs, so they live in separate
layers:

```
Facts  →  Raw conflicts          →  Derivation rules        →  Proofs
          findContradictions        quality.same_day_conflict
          (contradiction.ts)        quality.demographic_mismatch
                                    temporal.*, safety.*, gap.*, trend.*
```

`conflicts` sits on the rule context beside `courses` and `spans`, because it is the same kind of
thing: a reconstruction of the graph that rules consume, rather than a property of it. Rules that
care about disagreement read it instead of scanning the graph themselves, so the two layers cannot
disagree about whether a disagreement exists.

Before this, `measurementValueConflicts` and `quality.same_day_conflict` implemented identical
day-and-unit grouping independently, and `demographicConflicts` and `quality.demographic_mismatch`
did the same. Detection is now shared; only presentation stays with the rule.

The rules that reason over **time** still build their own intervals, because that is inference rather
than detection — a medication is a period, and the conflict layer has no opinion about periods.

One thing this had to preserve: `findContradictions` has no notion of "as of", but the Time Machine
does. `conflictsOf(ctx, kinds)` drops any conflict whose evidence is not entirely dated on or before
the evaluation date, because you cannot know two documents disagree until you have read both. There
is a test that scrubs to one day before a conflict and asserts it is not yet visible.

The care-gap rules are guideline-anchored and name the exact documentation that would clear them.
Every rule carries a `question` and a `notConcluded` string, and the type system will not let a rule
omit them.

### 5. Evidence grading and source authority

`src/engine/derive/grade.ts` declares how much each document type is worth — a lab report is not a
wearable summary, and a reconciliation list is frequently copied forward without review. Grades run
A to D and a derived claim inherits the **worst** grade of its premises, because a chain of reasoning
is only as strong as its weakest documented link.

---

## The platform layer

`src/engine/platform/` holds the things that make this a platform rather than a single-patient
tool. All of it is pure, none of it touches the DOM, and all of it is tested.

### Terminology coding (`codes.ts`)

A curated, deliberately **partial** mapping to LOINC, RxNorm, SNOMED CT, ICD-10 and CVX. Concepts
outside the table stay text-only, and the export reports exactly which concepts were coded and which
were not. A silently guessed code is worse than an honest gap, because a wrong code propagates into
other systems as though it had been verified.

### FHIR R4 round-trip (`fhir.ts`, `fhirExport.ts`, `fhirResources.ts`)

`exportFhir(graph)` produces a collection bundle where **every clinical resource carries a
provenance extension** naming the source document, date, character span, extractor and section, plus
the quoted line and the extraction confidence. That is the difference between an export something
downstream can audit and one it has to take on faith.

The manifest reports resource counts, coding coverage, and its own cautions. Facts with no clean R4
home (symptoms, social history, demographics) are **counted as unmapped rather than forced into a
resource that would misrepresent them**.

`importFhir(json)` reads a bundle back by turning it into one source document with each resource on
its own labelled lines. Provenance still holds — facts point at characters in a document — and
unrecognised resource types are named in the warnings rather than quietly dropped.

### De-identification (`redactPolicy.ts`, `redactApply.ts`)

Three policies: full record, clinical share, and a research export that shifts every date by a
constant offset. Date shifting preserves intervals and durations exactly while breaking the link to
a calendar date, which is why the interval rules still work on a shifted record.

The redaction:
- **never mutates the input graph**
- **recomputes every identifier** so the export cannot be joined back to the original
- emits a **manifest** of every removal, with counts
- states its **residual risk** — unshifted dates, retained free text, small-record distinctiveness

An export that cannot say what was taken out cannot be audited.

### Record quality (`quality.ts`)

Nine weighted dimensions, each a statement about the *documents* rather than the patient:
provenance integrity, extraction confidence, source authority, documentation continuity, freshness,
internal consistency, unit consistency, terminology coverage, monitoring completeness. A low score
means the record is hard to reason over, not that care was poor — and the interface says so.

### Cohort analysis (`cohort.ts`)

The same rules, iterated over several subjects. Rule prevalence becomes a number, and seven cohort
queries ship with the platform. Every query carries a `caveat`, and the analysis always states that
prevalence here is prevalence *within this cohort of imported records*, not in a population.

Three synthetic subjects with structurally different records ship with the build, so the cohort view
has something real to compare.

### Audit and persistence (`audit.ts`, `persistence.ts`)

An append-only audit log records every ingest, query, view, export and redaction. Persistence is
versioned and pluggable: the **corpus is stored, not the derived graph**, so the graph is always a
faithful function of the record. A future schema version is reported as requiring a migration rather

### MCP control plane (`mcp/`)

The bridge to the local MCP server is a first-class platform surface, not a side effect. The rule it
exists to enforce:

> **A tool result is an external computation, not evidence.**

`McpGateway` discovers the server's tools, gates every call through a permission allowlist and
argument-schema validation, and wraps the output as an `ExternalComputation` that is **always**
`unverified` with `external-computation` provenance. There is no code path from a tool result into
the graph: the output is an opaque value, and only an explicit `reviewComputation` (a human decision)
can mark it usable as evidence. Every call is recorded in an append-only log with a reproducible
output digest, so a computation can be re-derived and audited after the fact.

The transport is behind an interface (`McpTransport`): a `MemoryMcpTransport` for tests, and a
`McpStdioTransport` (Node-only, excluded from the browser bundle) that speaks JSON-RPC-over-stdio to
the local FastMCP server.

than loaded silently.

Both are wired into the interface rather than merely available in it:

- **Saving happens automatically** whenever the imported corpus changes, and a fresh mount restores
  it. A restore is gated so that an empty first render cannot wipe a record that is about to load.
  The Records view reports what is stored, when, and offers to forget it. Imported documents used to
  disappear on reload, which made the intake surface a demonstration rather than a tool.
- **The audit log filters by kind and exports** as a schema-tagged JSON envelope. The filter chips
  are built from the kinds actually present, so the control never offers an empty list.
- **Terminology coding is inspectable per concept.** The Interop view lists every resolved concept
  with the codes it mapped to, sorted so the *uncoded* ones come first — they are the ones a reader
  can act on — and states plainly that an uncoded concept was exported as text rather than given a
  plausible-looking code.



---

## What makes it structurally different

Most medical AI products put a language model in front of a pile of documents. This one puts a
**provenance engine** in front of them, and the non-generative parts are the parts that matter.

### 1. Nothing exists without a span

Every `Fact` carries:

| Field | Meaning |
| --- | --- |
| `docId` | which document it came from |
| `span: [start, end]` | the exact character range in that document |
| `quote` | the clause it was read from, never paraphrased |
| `extractor` | which reader produced it (`lab.table-row`, `med.section-list`, …) |
| `confidence` | an explainable score with every adjustment justified |
| `flags` | what the engine noticed and questioned |
| `sectionKind` | the heading it sat under |

A test enforces the core invariant across the whole corpus: *the characters the engine claims to
have read must be inside the quote it shows the user.*

```ts
expect(fact.quote).toContain(doc.text.slice(fact.span[0], fact.span[1]));
```

### 2. Section context changes meaning

`Atorvastatin` under **Current Medications** and under **Discontinued Medications** is the same
string and the opposite fact. The extractor resolves the section first, then the sentence, then
falls back to type defaults — and records which of those three decided the status.

### 3. The engine refuses to believe implausible values

A lab report containing `Potassium 45 mmol/L` is not a clinical finding; it is a decimal-shift
typo. Every concept carries a plausible window, so the value is read, **flagged**, and reported as
a data-quality problem rather than a critical result. The engine never silently corrects a source
value — it flags it and asks.

### 4. Units are compared, never coerced

Values are only compared across documents when the units match. If one document reports mmol/L and
another mg/dL, the engine says so and computes no trend, rather than inventing one.

---

## The engines

### Extraction (`src/engine/extract/`)

Line-oriented, section-aware, lexicon-driven. It is deliberately *not* a language model: a
transformer would be far better at prose and far worse at this, because the job is not
comprehension — it is locating a value and recording where it was.

- `segments.ts` — splits documents into sections and segments. Handles the real-world case where a
  heading and its content share a line (`Current Medications: Lisinopril 10 mg daily`), so the
  medication is not silently swallowed by the heading.
- `values.ts` — reads values, comparators, H/L flags, reference ranges and units; converts only
  where a published factor exists; assesses plausibility; rejects non-units (so `A1c 6.4 in June`
  is not read as 6.4 inches).
- `status.ts` — infers active / discontinued / resolved / ordered / scheduled from sentence cues,
  bounded to the current line so a cue from a neighbouring sentence cannot leak across.
- `draft.ts` — assembles a fact, applies every adjustment, and leaves a flag or attribute behind
  for each one so the evidence drawer can justify the confidence score.

### Temporal folding (`src/engine/timeline.ts`)

`snapshotAt(graph, date)` folds each entity's facts forward to a point in time. The rule is simple
and auditable: the most recent *explicit* status wins, `unknown` never overwrites a known status,
and the full trail of how a status was reached is retained.

`diffSnapshots(a, b)` produces documented change: added, removed, status changed, dose changed,
value changed, unit changed, new document. **Every change carries a caveat** stating what the
documents do not establish — for example, that absence from a later summary is not a
discontinuation.

### Contradiction Engine (`src/engine/contradiction.ts`)

Ten rules, each returning the conflicting statements, their sources, the one question that would
resolve it, and an explicit statement of what the engine refuses to conclude:

| Rule | Catches |
| --- | --- |
| `medication_status_conflict` | stopped, then documented as active again |
| `medication_listed_after_stop` | still present on a later "current medications" list |
| `medication_allergy_conflict` | prescribed against a recorded allergy (with cross-reactivity) |
| `measurement_value_conflict` | same measurement, same day, two values |
| `implausible_measurement` | values outside the plausible window |
| `demographic_conflict` | e.g. two different blood types |
| `condition_resolution_conflict` | resolved, then documented again |
| `dose_conflict` | two different doses on one date |
| `duplicate_conflicting_detail` | same event, two dates |
| `documentation_gap` | still "active" but silent for 18+ months |

### Query planner (`src/engine/query.ts`)

`ask(graph, question, { asOf })` classifies an intent, resolves concepts (longest-alias-first, so
"LDL cholesterol" beats "cholesterol"), plans a query, and assembles an answer from facts that
already exist. It returns the plan, the citations, the coverage and the limitations — all of which
the UI displays.

### External evidence (`src/engine/evidence/`)

A quarantined layer of curated references (FDA labeling via DailyMed, MedlinePlus, CDC,
ClinicalTrials.gov). Every link points at the source's own lookup page and was verified to
resolve. External evidence is counted and labelled separately from personal facts, and the
separation is shown as a bar in every answer.

Research Mode also performs a **live** ClinicalTrials.gov lookup, and is fail-soft: an unreachable
registry is reported as unreachable, because "no trials found" and "could not ask" are different
answers.

---

## The synthetic record

`src/data/` contains three subjects with structurally different records, so the cohort layer has
something real to compare.

**Subject A — Alex Morgan, 18 documents, March 2022 to September 2026.** Deliberately not clean; it
contains the ordinary failure modes of real longitudinal records:

- **Atorvastatin** documented as discontinued on 2025-03-09, then still present on the 2025-06-24
  "current medications" list. Caught by interval reasoning: the stop is sentence-level evidence, the
  list is heading-level evidence, and the rule weights them differently.
- **Amoxicillin/clavulanate** prescribed in February 2024 against a penicillin allergy recorded in
  2022. Caught because the medication *course interval* intersects the *allergy interval*.
- **Blood type A positive** in one document, **O positive** in another.
- **Potassium 45 mmol/L** — a decimal-shift typo, flagged and never believed. It also produces a
  same-day value conflict, because the reconciliation note reports 4.1 on the same date.
- **Sinusitis** resolved in one note, then on the problem list months later.
- **A1c** 5.9 → 5.8 → 6.4 → 6.1 → 6.6 across four years, including values *restated* inside later
  narrative notes, which are marked `restated` and excluded from the fit.
- **Semaglutide** dose escalation 0.25 → 0.5 → 1 mg, detected as a documented change.

**Subject B — Priya Raman, 6 documents.** A well-kept, tightly monitored record: thyroid dose
titration with TSH followed at every step, immunizations present, all monitored parameters in range.
It produces few findings, and that is the point.

**Subject C — Tomas Vidal, 3 documents.** The opposite: a two-year gap, two NSAIDs prescribed
together in one emergency note and never revisited, hypertension documented and never rechecked, and
no immunizations anywhere.

The same fourteen rules run over all three. The differences in what they produce are the entire
reason the cohort layer exists.

None of these patterns were added to make the demo look clever. They are the patterns the engines
exist to catch.



---

## The front door: the builder

`/` opens on the builder, not on a dashboard. It is a full-viewport page with a composer as its
centre of gravity, and it exists because the honest first question about a system like this is not
"what does it do" but "show me it doing it".

The critical design decision: **the build is real work, not a progress animation.** Pressing Build
runs the actual pipeline — ingest, graph, derive, assess, export — in the browser, and every number
the preview shows is read back out of the artifact that pipeline produced. If the preview says 412
facts, 412 facts were extracted. There is no scripted timeline anywhere.

```
src/builder/
  types.ts        the state model: request, plan, step, artifact, backend interface
  scenarios.ts    eight real slices of the corpus, and the prompt matcher
  backend.ts      LocalBuildBackend — runs the real engine, step by step
  useBuild.ts     the React binding; knows nothing about how a build is produced
  scroll.ts       scroll progress, reveal, animated placeholder, reduced motion
```

`BuildBackend` is the seam that matters. It is four members wide:

```ts
interface BuildBackend {
  plan(request: BuildRequest): BuildPlan;
  run(request: BuildRequest, onStep: (step: BuildStep) => void): Promise<BuildArtifact>;
}
```

A server-side generator implements that and nothing in the interface or the presentation layer
changes. `useBuild` is a hook over the interface; the components take a `BuildState` and never touch
the backend. A test constructs a stub backend and drives it through the same hook.

### The prompt genuinely drives the build

Matching is transparent by design. `scorePrompt` scores a scenario by **how many characters of the
prompt its vocabulary explains**, merging overlapping matches so that a short keyword contained in a
longer one cannot score the same text twice — `"monitoring"` scores 10, not 17 for also containing
`"monitor"`. The plan carries the keywords it matched on, and the interface shows them.

When nothing matches, the plan says `matchedBy: 'fallback'` and the panel says the default record was
used. It does not pretend the prompt was understood.

### The build is a real pipeline

Six stages, each reporting counts from work already done:

| Stage | What it actually does |
| --- | --- |
| Planning | matches the prompt, resolves the document slice, states its caveats |
| Reading documents | one step per document, running fact total |
| Building the graph | entity, edge and inferred-edge counts |
| Applying rules | the registry size, then derivation and severity counts |
| Packaging | quality dimensions, FHIR resource and coding-coverage counts |
| Ready | the preview is replaced by the built product |

The pipeline rail shows stages that have not happened yet as pending. Nothing animates into
existence on a timer.

### Scrollytelling

The pipeline section pins while the narrative advances, and the four chapters cross-fade rather than
cut. Under `prefers-reduced-motion` the section collapses to a plain list with the same content, and
on narrow viewports it stacks with the visuals above the text.

**The four diagrams are drawn from the artifact, not hand-written.** This was the last part of the
page that described the product without being downstream of it, and it is worth being precise about
what each one now shows:

| Chapter | What is drawn |
| --- | --- |
| Read | a real document from the artifact, with the real character spans highlighted in place |
| Link | the concept written the most different ways, with the actual text at each stored span |
| Reason | real reconstructed courses and spans on a real axis, red when a finding cites them |
| Prove | a real derivation's proof graph, laid out by dependency depth |

Two details that matter. First, the surface forms in chapter two are `doc.text.slice(fact.span)` —
the characters the engine actually read. `fact.label` is the canonical label the extractor resolved
to, so using it would have made the diagram assert something the data does not contain. Second,
chapter two counts *lexical* variation, not raw distinct strings: blood pressure written eight times
with eight different readings is one way of writing it, not eight. There is a test for that.

When no artifact exists yet — the frame before the automatic build lands — every diagram is an
unlabelled schematic and the caption reads `—`. They never show invented data.

Scroll position drives CSS custom properties (`--hero-settle`, `--hero-lift`) rather than React
state, so scrolling never re-renders the tree.

### Mobile

Built independently rather than reflowed. The composer becomes the primary interface at full width
with 44px touch targets; the example wall becomes a horizontally scrolling rail with snap points;
the pipeline section unpins; navigation drops to the brand and a single call to action; and the
layout respects `env(safe-area-inset-*)`.

### Degradation

Every motion driver degrades to a static page. No `IntersectionObserver` means content is revealed
immediately rather than trapped at `opacity: 0` — there is a test for exactly this, because jsdom has
no `IntersectionObserver` and the failure mode is invisible content. No `requestAnimationFrame` means
scroll progress is computed directly. `prefers-reduced-motion` disables the choreography.

### The live engine status

A persistent pill sits in the builder nav and in the workspace top bar, showing the same component
because "this is real" is a claim about the whole product rather than about the landing page:

```
● Live engine   512 facts · 37 entities · 14 derivations   [100]
```

Every number is read from the artifact, and the verdict dot is green only because
`verifyProvenance` re-read every fact from its source span on this render. Clicking it opens the
**artifact inspector**: the verdict, the six provenance checks with what each one means, the pipeline
as it actually ran, the documents with their fact counts, every derivation with its step count and
confidence, and the export coverage.

The inspector is the answer to "prove it", so it recomputes rather than displays a stored result. A
test mutates a span, a dependency order, a conclusion id and a citation, and asserts the check fails
on each — because a check that cannot fail is not a check.

### Attachments

Drop a text file onto the composer, or use the attach button. The file becomes a `DocumentInput`,
which is exactly what the built-in corpus produces, so from that point on it is indistinguishable
from any other document: same extractors, same spans, same rules.

The document kind is inferred from the content first and the filename second, and the tray shows
which of the two decided it plus the reason. The reader can override it with a dropdown, because the
extractors are section-aware and a wrong kind genuinely degrades extraction. A file called
`lab-results.txt` containing a medication list is read as a medication list.

Two things are refused rather than faked:

- **Files with no text layer** (PDF, images, office documents) are rejected because there is nothing
  to anchor a span to.
- **JSON is not read as a document.** A FHIR bundle goes through the Interop view, where its
  provenance extensions survive instead of being flattened.

Every refusal carries a reason the reader can act on. Silently dropping a file is the worst possible
behaviour for an import, so there is a test for each rejection path.

### Ask the artifact — where the AI goes

The rule this section exists to enforce:

> **AI explains the evidence. The evidence determines the inference.**

An explainer is handed a graph, the derivations over it, and a question. It is never handed a bare
question, and it has no path back into the graph. The shape of an answer is prose *about derivations
that already exist*, with the spans underneath.

```
src/explain/
  types.ts       ExplainerBackend, Explanation, ExplanationSource
  grounded.ts    the shipped backend — deterministic, offline, engine-only
  openWebUi.ts   an adapter for an OpenAI-compatible endpoint
```

**The shipped backend is deterministic and offline.** Its entire vocabulary is the set of
derivations it was handed, so there is no code path in it that produces a claim the proof does not
contain. It answers eight intents — why, summary, severity, evidence, limits, identity, count, and an
honest refusal — by assembling paragraphs from the proof graph. Every answer carries
`ExplanationSource[]`, and a test asserts every cited fact id resolves to a real fact.

**The Open WebUI adapter is the interesting case.** It works like this:

1. The engine answers first, completely and on its own.
2. That answer — not the reader's question — becomes the model's entire context.
3. The model is asked to rewrite it, with a system prompt that forbids adding any claim, number or
   recommendation, and forbids answering a clinical question.
4. The prose comes back; **the citations stay the engine's.**

So even if the model produces something odd, the sources underneath it are the ones the engine
emitted, and the surface labels the prose as generated. If the endpoint is unreachable, the engine's
own answer is returned with a note saying the model was not used — a network failure must never look
like a missing finding. There are tests for all four of those properties.

#### Two badges, and they are not equal

Every answer carries a provenance badge:

| Badge | What it means |
| --- | --- |
| `ENGINE-DERIVED` | the engine's own statement, assembled from the proof |
| `MODEL-EXPLAINED` | the engine's statement, rewritten for readability |

`MODEL-EXPLAINED` is **visually subordinate on purpose**: muted text on a plain surface with a dashed
border, where `ENGINE-DERIVED` gets the strongest accent in the application. Rewriting prose is not
evidence, and a badge that looked more authoritative than the one beside it would imply that it was.
The citations under a `MODEL-EXPLAINED` answer are still the engine's.

The distinction is enforced in the type system rather than by convention: `provenanceOf` is derived
from `Explanation.generated`, which only the backend can set, and the notes attached to each label
say what the badge does and does not claim.

### Scrolling

The scroll architecture is stated once, in `layout.css`, because it is easy to break invisibly:

```
html, body, #root   height: 100% (with a dvh fallback), body clips
.shell              fills the viewport, is a grid
.main               a grid item, min-height: 0 so it may shrink
.view               the ONE scroll container, min-height: 0, overflow-y: auto
```

The `min-height: 0` declarations are load-bearing. A grid item defaults to `min-height: auto`, which
means it refuses to shrink below its content: the element meant to be the scroll container grows to
fit instead, spills past `body { overflow: hidden }`, and the content becomes permanently
unreachable. The page looks broken while every component test still passes, because the DOM is
exactly right.

jsdom has no layout engine, so `src/styles/layout.test.ts` reads the stylesheets from disk and asserts
the chain is declared correctly. It is a contract test, and it is the only honest way to guard this
from a test runner.

### Code splitting

The builder is loaded eagerly, because a landing page that shows a spinner before it can show a
composer has already lost. Everything below the fold and everything in the workspace is loaded on
demand — including the scrollytelling and the explainer, each of which carries its own derivation
module rather than having it passed in.

| | Initial JS | gzip |
| --- | --- | --- |
| Before splitting | 567 kB | 170 kB |
| After splitting the workspace views | 497 kB | 152 kB |
| After adding identity, the explainer and persistence, then splitting both | **494 kB** | **151 kB** |

That last row is the interesting one: the round added an identity engine, a grounded explainer, an
LLM adapter, a session panel and a layout test suite, and the initial bundle got *smaller*. The two
new below-fold sections are 24 kB of deferred chunks.

The engine is shared, so it stays in the initial chunk either way. What is deferred is thirteen
screens of layout, the canvas graph, the proof viewer, the cohort tables, the pipeline diagrams and
the chat.

---

## The interface

The app opens on the **Builder** (see above). Behind it, thirteen workspace views in four groups,
plus a persistent **Time Machine scrubber** pinned to the bottom of the window. Dragging it changes
the date *every* view answers as of — overview, graph, measurements, inference and the Ask engine all
obey it. Ticks on the rail mark documents, detected changes and open findings.

Switching to the Builder from the sidebar returns to the front door and takes back the full
viewport: the sidebar, top bar and scrubber are not rendered while it is open.

### Reconstruct

| View | Purpose |
| --- | --- |
| **Overview** | current state, record quality, recent change, highest-ranked findings |
| **Time Machine** | two pins, two reconstructions of the record, and the diff between them |
| **Intervals** | courses and spans as a Gantt on one axis, plus the Allen relations between them |
| **Health Graph** | force-laid-out concept graph; inferred edges drawn differently from stated ones |

### Inspect

| View | Purpose |
| --- | --- |
| **Records** | document library, text import, and an inspector that highlights every extracted span in place |
| **Measurements** | every reading with its own chart, reference range and flagged points |
| **Debugger** | contradictions and documented change, each with its question and its non-conclusion |

### Reason

| View | Purpose |
| --- | --- |
| **Inference** | every derivation with its proof DAG, plus the full rule registry including zero-finding rows |
| **Ask** | query the graph; the plan, citations, coverage and limitations are all shown |
| **Research Mode** | personal graph fenced off from external evidence, plus a live trial lookup |

### Platform

| View | Purpose |
| --- | --- |
| **Record Quality** | the nine-dimension scorecard and the append-only audit log |
| **Cohort** | rule prevalence across subjects, seven cohort queries, subject comparison |
| **Interop & Sharing** | FHIR export with provenance, structural de-identification, bundle import |

### Notable components

- **`ProofViewer.tsx`** — lays a derivation out as columns by dependency level with SVG connectors,
  so the reasoning reads left to right: premises → intervals → rule → conclusion.
- **`graphLayout.ts`** — a hand-written deterministic force simulation. Nodes are seeded onto
  angular sectors by kind and then relaxed, so the picture is stable between renders; a graph that
  reshuffles every time you look at it is unreadable.
- **`CommandPalette.tsx`** — ⌘K searches views, derived findings and questions, so a specific proof
  is three keystrokes away.
- **`RunsPanel.tsx`** — the durable registry: save a run, browse saved runs, open one (which
  re-derives it and reports the reproduction verdict), delete one, or pick two to compare. Comparison
  across sessions happens here, because both sides are re-derived from stored corpora.
- **`BranchPanel.tsx`** — the three branches this build can actually run, each with its result shown
  as a real re-derivation rather than a hypothetical. A branch that cannot be run is shown disabled
  with the reason.

No UI framework, no chart library, no icon library. The design system is plain CSS custom properties
in `src/styles/`.

---

## Limitations

These are stated rather than discovered later.

- **Text only.** PDFs and scans are not parsed. This is a boundary rather than a hidden failure: the
  extractor reads text, and silently mangling a real lab report would be worse than refusing it.
- **English, US date convention, US units by default.** Other conventions are handled where
  unambiguous and left alone where not.
- **The lexicon is finite.** ~330 concepts across labs, medications, conditions, procedures,
  allergies, immunizations, vitals, symptoms and social history. Anything outside it is not extracted
  — the graph shows what it read, not what it guessed.
- **Terminology mappings are partial.** Coverage is reported per export, and unmapped concepts are
  exported as text. Codes should be validated against a terminology server before clinical use.
- **FHIR import is a reader, not a conformance engine.** A bundle becomes a source document so the
  provenance invariant survives; it is not a validated FHIR endpoint and makes no profile claims.
- **Redaction is structural, not validated de-identification.** Free text is not scanned for
  identifiers. Residual risk is stated in the manifest on every export.
- **Cohort prevalence is prevalence in imported records, not in a population.** The view says so, and
  the tests assert that it says so.
- **Fast-change thresholds are declared conventions**, not clinical findings. Where none is declared,
  no finding is produced.
- **Saved runs live in this browser.** The registry is pluggable over a storage backend, but the
  shipped backend is `localStorage`. Runs do not follow you to another machine, and clearing site data
  removes them. The interface reports when storage is unavailable rather than pretending a run was
  kept.
- **The registry keeps a bounded number of runs** (40, newest kept). This is a research log rather
  than an archive; an unbounded one would silently fail on quota instead of saying so.
- **A branch can only change what the engine can re-run.** Rules can be withheld, documents withheld,
  the evaluation date moved, documents added. The engine cannot be swapped, because there is one engine
  in the binary.
- **Impact analysis is a dependency calculation, not a re-derivation.** It reads the structure the
  engine recorded and propagates along it. It is right about what *depends* on what; the branch is
  what confirms the findings actually move. The Lab shows both, side by side, and says which is which.
- **Evidence stability labels are not probabilities**, and branch sensitivity is `not measured` until a
  branch has been run. A `stable` label on an unmeasured finding means its structure is sound, not that
  it has been tested.
- **The HTTP store has no server in this repository.** The adapter and its contract are real, and a
  development server is a small piece of work, but what ships is `localStorage`. The adapter reports
  an unreachable server as `unreachable` rather than as an empty registry.
- **Governance covers the rule set and the version history, not clinical content.** It can prove that
  every rule was introduced by a release and that the hash moves when the rules do. It cannot prove a
  rule is clinically correct, and nothing in it tries.
- **The subjects are synthetic.** None of these people exist.

---

## Deliberate boundaries

Medical software crosses regulatory lines depending on what it does, so this build deliberately
stays on the safe side of them. It **organises, explains, cites, checks and researches**. It does not
diagnose, does not recommend treatment, and does not tell anyone what to do.

That restraint is implemented rather than asserted:

- Every derivation carries a `notConcluded` field, and the type system will not let a rule omit it.
- Every derivation carries the `question` that would resolve or clear it.
- Every change carries a `caveat` stating what the documents do not establish.
- Contradictions never resolve to a winner.
- Implausible values are reported as reported, with a flag — never corrected.
- Units are never converted without a declared factor, and never compared across units.
- External evidence is never blended into a sentence about the patient.
- Every answer lists what it cannot tell you.
- A rule firing zero times is shown as zero, not hidden.

This is not a medical device and is not for clinical use.


## Repository layout

```
src/
  engine/                 # the product: no React imports anywhere in this tree
    types.ts              # the data model — the whole design lives here
    ingest.ts             # document → sections → facts, with reconciliation
    graph.ts              # facts → entities → edges, inferred edges marked
    verify.ts             # re-reads every fact from its span; validates every proof DAG
    identity.ts           # names a result: corpus hash, result hash, engine and rule set
    hash.ts               # synchronous SHA-256, asserted against the FIPS vectors
    versions.ts           # the engine's own dated release history
    compare.ts            # two runs, compared at the level of the proof
    timeline.ts           # time machine snapshots and the change detector
    analysis/             # THE RESEARCH LAYER, all pure
      impact.ts           #   dependency propagation: document → fact → entity → finding
      proofDiff.ts        #   step-level diff: added · removed · replaced · changed
      stability.ts        #   evidence stability, and `null` where it cannot be measured
      counterfactual.ts   #   baseline → intervention → changed proof, labelled
      questions.ts        #   seven research questions, each resolved by a real computation
    governance/           # RELEASE GOVERNANCE, pure and therefore failable
      checks.ts           #   rule coverage, retirements, version history, rule set evolution
      artifacts.ts        #   addresses recompute, caches match, lineage resolves
    contradiction.ts      # raw document-versus-document conflict detection
    query.ts              # intent detection, entity resolution, answer assembly
    relations.ts          # declared relations, monitoring maps, interaction pairs
    evidence/             # quarantined external evidence + live trial lookup
    extract/              # section detection, value reading, status inference
    text/                 # lexicons, normalisation, unit handling
    derive/               # THE INFERENCE LAYER
      types.ts            #   Derivation, DerivationStep, intervals, quality, audit
      grade.ts            #   source authority, confidence algebra, ProofBuilder
      intervals.ts        #   Allen algebra, medication courses, condition spans
      conflicts.ts        #   raw conflicts, filtered to the evaluation date
      trajectory.ts       #   OLS fit, R², threshold crossing
      engine.ts           #   the rule registry and the inference pass
      rule.ts             #   rule scaffolding and derivation finalisation
      rules*.ts           #   temporal · safety · gaps · trends · quality · silence
    platform/             # THE PLATFORM LAYER
      codes.ts            #   LOINC · RxNorm · SNOMED · ICD-10 · CVX
      fhir.ts             #   bundle assembly, manifest, bundle import
      fhirExport.ts       #   shared FHIR types and the provenance extension
      fhirResources.ts    #   one builder per R4 resource type
      redactPolicy.ts     #   the three de-identification policies
      redactApply.ts      #   structural redaction with a removal manifest
      quality.ts          #   the nine-dimension record scorecard
      cohort.ts           #   multi-subject analysis and cohort queries
      audit.ts            #   append-only audit log
      persistence.ts      #   versioned, pluggable storage of the corpus
      registry.ts         #   versioned, pluggable storage of saved runs
      artifactStore.ts    #   the ArtifactStore contract: memory · localStorage · HTTP
      mcp/                #   THE MCP CONTROL PLANE
        types.ts          #   ExternalComputation — a tool result is not evidence
        classify.ts       #   the only path to "usable as evidence" (explicit review)
        schema.ts         #   argument-schema validation before a tool runs
        gateway.ts        #   discover · permission · audit · wrap as unverified
        transport.ts      #   McpTransport interface + in-memory transport
        stdio.ts          #   Node-only JSON-RPC-over-stdio transport
  data/                   # three synthetic subjects
  builder/                # THE FRONT DOOR: state model, scenarios, backend, hooks
    types.ts              #   BuildRequest → BuildPlan → BuildStep[] → BuildArtifact
    scenarios.ts          #   eight real corpus slices + transparent prompt matching
    attachments.ts        #   File → DocumentInput, with kind inference and refusals
    story.ts              #   the four pipeline diagrams, derived from one artifact
    backend.ts            #   LocalBuildBackend, and reproduceArtifact
    runs.ts               #   artifacts ↔ stored runs; branch options and requests
    useBuild.ts           #   the React binding; backend-agnostic
    scroll.ts             #   scroll progress, reveal, reduced motion
  explain/                # WHERE THE AI GOES
    types.ts              #   ExplainerBackend, Explanation, provenance badges
    grounded.ts           #   the shipped backend: deterministic, offline, engine-only
    config.ts             #   where the model lives, and the protocol it speaks
    remote.ts             #   the model-backed backend, and the connection test
    openWebUi.ts          #   an OpenAI-compatible adapter that can only rewrite a proof
  lib/engineStatus.ts     # one status shape, built from either a builder artifact or the store
  lib/download.ts         # handing a file to the browser, guarded for environments without it
  components/             # UI primitives, proof viewer, canvas, palette
    EngineStatusPill.tsx  #   the persistent "Live engine" pill
    ArtifactInspector.tsx #   the answer to "prove it"
    builder/              #   BuilderHero, PromptComposer, LivePreview, GeneratedAppFrame,
                          #   BuildState, AttachmentTray, CapabilityStrip, RunCompare,
                          #   RunsPanel, BranchPanel,
                          #   InfrastructureSection, ExampleGallery, BuildCTA, Scrollytelling
    lab/LabPanels.tsx     #   the Research Lab's seven areas
  views/                  # one file per screen, plus BuilderView (eager; the rest are lazy)
                          #   HowItWorksView is the plain-language guide to every tab
  chat/conversation.ts    # the conversation: intent, assembly, actions, follow-ups, receipt
  styles/                 # design tokens and CSS
  state/store.tsx         # single source of truth wired to the engine
```

```
scripts/
  verify.mts              # the governance runner behind the four npm run verify:* scripts
  mock-model.mjs          # a stand-in model server, so the whole path can be exercised offline
```

The engine has no dependency on React or the DOM, and neither does the platform layer. That is
intentional: it is the part worth keeping, testing and reusing, and it can be lifted into a server,
a CLI or a mobile client unchanged.

---

## Tests

**670 tests, all passing.**

- **Record questions** — deterministic generation from the artifact (one question per conflict, gap,
  weak finding, inferred-but-unstated finding, and unpinned change), a stable id for every question,
  and a lifecycle that cycles open → investigating → answered → dismissed without touching the
  generated content. A mutation suite corrupts an input (drop a contradiction, weaken a grade, strip
  a caveat) and asserts the change is detected.
- **The State of the Record** — the Overview renders five sections and a receipt generated from the
  artifact, and every empty state says what was searched, what was found, and what the absence does
  not conclude.
- **Chat → meaning layer** — the chat answers "what are the open questions?" from the same
  `generateQuestions` the Overview uses, and every answer action points at a real view.
- **Contextual AI handoff** — a view hands the AI a structured `AIContext` (never raw prose); the
  composer shows a "Asking about: …" chip with source/proof/back actions; pronouns ("this",
  "explain this", "what does this mean") resolve to the focused object; and a stale context (a
  deleted document, a re-derived finding) is reported rather than silently substituted.
- **General conversation** — greetings, thanks, small talk and "what can you do?" are answered
  conversationally, never as a failed medical intent. A general-chat layer (`src/chat/general.ts`)
  routes ordinary conversation to the configured model (Open WebUI, Ollama, or any
  OpenAI-compatible endpoint via `VITE_LLM_*`) and falls back to a warm deterministic reply when no
  model is running. The evidence engine stays out of chit-chat, and stays in charge of record
  questions.
- **MCP control plane** — a tool result is always `unverified` with `external-computation`
  provenance; only an explicit `reviewComputation` makes it usable as evidence; permission and
  schema gates refuse invalid calls; the execution log's digest is reproducible; and an end-to-end
  test drives the real local FastMCP server over stdio.

- **Document identity & reconciliation** — `assessDuplicate` classifies two records as *exact*,
  *normalized*, *likely-same*, *related*, or *distinct*, with the matching/differing fields and the
  reasoning laid out (never a single fuzzy score). `compareFacts`/`changedFacts` produce the
  fact-level diff, and `reconcileImpact` actually re-runs the engine to report the real consequence
  of keeping or discarding a document. A `ReconciliationPanel` renders all of it — the default
  action is always non-destructive.

- **Extraction** — provenance invariant across every document, confidence and flag presence, A1c and
  LDL series, implausible-value flagging, dosing-unit rejection, inferred-edge marking, restatement
  detection.
- **Derivation engine** — every rule runs without throwing; every derivation carries a proof, a
  question and a non-conclusion; **proof graphs are asserted acyclic and topologically ordered**;
  every premise resolves to a real span; confidence is asserted to never exceed its weakest premise;
  output is deterministic across runs.
- **Interval algebra** — Allen relations classified correctly; courses reconstruct with correct open
  and closed states; a course is never closed without a closing statement.
- **Trajectory** — a line is fitted only with enough readings; restated values are excluded; values
  are never compared across units; insufficient data is marked rather than guessed.
- **Terminology and FHIR** — codes resolve for known concepts; **every clinical resource in the
  bundle carries a span and a quote**; the bundle round-trips through the reader; unmapped resource
  types are named rather than dropped; invalid JSON fails with an explanation.
- **De-identification** — the input graph is never mutated; excluded kinds are removed and reported;
  **date shifting preserves intervals exactly**; identifiers are recomputed so the export cannot be
  joined back; every fact is still anchored to a span afterwards.
- **Quality and cohort** — nine dimensions scored; provenance integrity asserts 100; different
  records score differently; every cohort query runs and carries a caveat.
- **Audit and persistence** — the log appends, filters and exports; a future schema is reported as
  requiring migration rather than loaded silently; corruption is reported rather than thrown.
- **Verification** — the real corpus verifies clean on all three subjects; and the check provably
  fails on a moved span, a span past the end of its document, a missing document, a misordered
  proof dependency, a dependency outside the proof, a conclusion that is not a step, a finding citing
  nothing, and a dangling citation.
- **Identity and reproduction** — hashing is deterministic, order-independent over the corpus, and
  sensitive to a single character or a document kind; the same record and engine give the same name;
  a real build reproduces **exactly**, across every scenario and for attachment builds; a tampered
  corpus is reported as changed rather than reproduced; a different engine is reported as
  incompatible; added, removed and altered findings are each named individually.
- **Version history** — every release is dated and ordered; the running version is the head of the
  history rather than a constant; the rules each release introduced are recorded; a version the build
  does not know is reported as unknown rather than guessed at; a breaking release is flagged between
  two versions that have one between them and not between two that do not.
- **The run registry** — a run round-trips through storage and **re-derives to the same identity**, the
  strongest available test of cross-session reproduction; a saved run does not depend on the keyword
  matcher agreeing a second time, because the corpus is what is stored; the cached finding list is
  asserted equal to a fresh derivation; saving the same identity twice replaces rather than
  duplicates; a schema this build does not understand is reported as requiring migration rather than
  loaded; unparseable storage is reported rather than shown as empty; unavailable storage says so
  rather than silently losing the run; the list is bounded.
- **Research branches** — only experiments the build can execute are offered, and an engine-version
  branch is asserted **absent**; withholding a rule changes the rule set version while leaving the
  corpus hash untouched; it removes **exactly** the findings that rule produced and nothing else;
  evaluating earlier drops what the record did not yet support; a branch records its parent, and the
  lineage survives being saved and reloaded; a branch reproduces from its own stored corpus; a branch
  and its parent are two runs rather than one run twice.
- **Comparing runs** — identical runs are reported identical; two different records are reported as
  such rather than blamed on the engine; a confidence move, a severity move, a rule change, a premise
  change and a proof-length change are each named individually and keep both sides of the proof; a
  moved finding is counted once rather than as an add plus a remove; differences sort before findings
  that did not move.
- **SHA-256** — matches the published FIPS 180-4 vectors, including the padding boundaries at 55 and
  56 bytes and the empty input; multi-byte UTF-8 is encoded as code points rather than code units; a
  surrogate pair is one code point and not two.
- **Content addressing** — the address changes when **any** of its four determinants changes and
  stays put when none does; the display id keeps its short form; storage keyed by address replaces
  rather than duplicates.
- **Dependency impact** — removing a document takes exactly the facts that document carries and names
  exactly the findings that lose a premise; a withheld rule removes its findings and no facts; a
  finding is never reported as both lost and thinned; every edge carries a reason; an unknown target
  removes nothing rather than everything.
- **Proof diff** — an identical proof is entirely unchanged; a proof present on one side only is
  shown in full rather than as a bare fact; **an inserted step does not rewrite everything after it**;
  a swap at the same position is one `replaced` rather than an add plus a remove; a step that keeps
  its label but changes its premises is `changed`; the premises that moved are named.
- **Evidence stability** — every finding is profiled from its own proof; branch sensitivity is
  `null` rather than zero when no branch has been run, and the label says so; a single-fact conclusion
  is fragile; a proof citing no fact, or graded D, is unsupported; a measured sensitivity is reported
  in the reasons even when a structural weakness decided the classification.
- **Counterfactuals** — every result is labelled and carries all four statements of what it does not
  claim; an unrun branch infers **nothing**; a withheld rule reports its findings as lost, each with
  the proof that vanished; **removing a document can add findings**, and the test asserts it, because
  the engine re-derives rather than subtracts.
- **Research questions** — a question needing a branch is refused with `requiresBranch` and no
  citations rather than estimated; a question about an id that is not in the artifact says so; every
  answer carries at least one limitation; the least-supported findings rank first.
- **Governance** — the real repository passes all four checks; and each of eleven deliberate
  corruptions is caught: a smuggled rule, an unrecorded retirement, a retirement of a rule that never
  existed or is still present, a breaking release without a major bump, a major bump not marked
  breaking, dates going backwards, a running version that is not the head, a malformed version *and*
  date, no summary, a rule set change with a constant hash, and a hash that moves with no change.
- **Connecting a model** — the default endpoint is this app's own origin and the default model is
  `llama3.2`; each protocol builds the right path and a trailing slash is not doubled; a saved choice
  is remembered and can be forgotten; an unreadable override does not break the page.
- **The model boundary, at the wire** — the request goes to the right path with the right model; the
  **citations returned are the engine's, not the model's**, and a model that invents a citation
  cannot get it into the answer; the model receives the engine's answer as its entire context, with a
  system prompt that forbids inference and forbids adding a claim; an unreachable endpoint, an HTTP
  error and an empty answer each fall back to the engine's own words with a note, and a network
  failure is never reported as a missing finding.
- **Reading model prose** — paragraphs are split on blank lines *before* anything is stripped, so a
  multi-paragraph answer is not silently merged into one block; headings, bullets and rules are
  removed without changing what a sentence says.
- **The chat surface** — it answers from the engine alone with no model configured and says
  `engine only`; the model is off by default and has nothing to configure until it is on; an
  unreachable model is reported calmly and a question still gets a real answer with real sources; a
  reachable one reports its model count and offers them to pick from.
- **The how-it-works page** — every tab in the application is listed, and the test names all sixteen
  so a tab added to the sidebar and forgotten here fails; every card says the same three things;
  the prose contains no jargon, and the glossary is the one place jargon is allowed because that is
  where it is explained; the page states six things the system will never do; and there is a way home
  at the top and the bottom, both of which actually navigate.
- **Reading the question** — each of change, conflict, absence and time routes to the capability that
  can answer it, including the inflected phrasings ("contradiction", "conflicts", "intervals"); and a
  change question that also contains a summary word is read as a change question, because that is what
  was asked.
- **The four answers the record gives directly** — change is reported from the same structure the Time
  Machine shows, with a source per change; conflict is reported without ever picking a side; absence
  says what an absence means; intervals come from the snapshot and say the window is what the documents
  establish, not how long anything lasted; and each explains what was searched when there is nothing
  to report.
- **The receipt** — names the artifact, the engine, the ruleset and the verification; carries the proof
  length only when the answer is about a proof; reports `modelUsed` correctly, which is the one thing
  about an answer the engine cannot know; and is attached to every reply on every path.
- **What to ask next** — openings are chosen from what the record contains, so no suggestion leads
  nowhere; a question about change is not offered when nothing changed; a way to find the limits is
  always offered; and follow-ups build on the answer they follow.
- **Every reply** — says what it does not say on every path, with a floor guaranteeing it; offers only
  actions that name a view, a proof or a set of spans; never claims a model wrote an answer it did not
  write; and answers from the engine alone when no model is configured.
- **The chat page** — states the record with real counts where every value is finite and positive and
  every number is a button; opens with answerable questions; answers with the engine's prose, a
  limitation and a receipt; lists sources; offers an action that actually navigates and a follow-up
  that actually works; keeps the model off unless turned on; and survives an environment where
  `scrollIntoView` does not exist.
- **The explainer** — every intent is recognised and an unrecognised question is refused rather than
  guessed; cited fact ids all resolve; the limits answer quotes the engine's own `notConcluded` text;
  no rule is ever mentioned that the artifact did not fire. The Open WebUI adapter returns the
  model's prose with the engine's citations, sends the proof as the entire context with a system
  prompt forbidding inference, and falls back to the engine's own answer when the endpoint fails.
- **Layout** — the scroll chain declares a definite viewport height with a `dvh` fallback, every grid
  item in the chain can shrink, the view is the one scroll container, and no ancestor hides its
  overflow.
- **Story diagrams** — the document sample comes from a real document, its highlights are inside
  their own line and slice real text, and the highlighted run appears in the document; the entity
  sample is written more than one way but not merely with different numbers; interval positions stay
  inside the axis and name intervals that exist; every proof edge points forwards, one node per step,
  and the shape string is the real step-kind sequence.
- **Conflict layer** — detection happens once, so the raw conflicts and the derivations built from
  them cannot disagree on a count; a conflict is invisible one day before its evidence exists and
  visible on the day; no conflict ever cites a fact dated after the evaluation date.
- **Attachments** — content beats filename for kind inference; filename is the fallback; guessing is
  reported as guessing; PDF, image, JSON, empty, binary and oversized files are each refused with a
  specific reason; the cap is enforced; the reader can correct the kind.
- **Builder** — prompt matching resolves to the right scenario and reports its fallback honestly;
  overlapping keywords are not double-counted; the plan's document count equals the documents
  actually ingested; progress never moves backwards and touches every stage in order; **every
  derivation in every scenario cites a fact or a document**; every cited fact resolves to a real
  character span inside its document; two runs over the same input agree; a stub backend satisfies
  the same interface.
- **Builder UI** — the composer is the centre of the page; the auto-build populates the preview with
  the real record; typing a prompt and pressing Enter plans the matching scenario; a suggestion chip
  runs its build; a paced build completes and swaps the preview; a dropped file reaches the pipeline
  and the build reads one document instead of eighteen; **every section is revealed even without
  `IntersectionObserver`**, which is the failure mode that would silently hide the page.
- **Status and inspector** — the pill reports real counts and a verified verdict; the inspector shows
  six passing provenance checks, the pipeline, the documents, the derivations and the export; opening
  a derivation navigates to the view that renders its proof.
- **Application** — full DOM mount with effects; the app opens on the builder and hands off to the
  workspace; **all thirteen workspace views opened and each asserted to have rendered its own
  content**, not merely the surrounding chrome; a question run end to end; the Time Machine slider
  moved; **a proof graph rendered with real nodes and edges**; the rule registry showing zero-finding
  rows; the command palette opened.


