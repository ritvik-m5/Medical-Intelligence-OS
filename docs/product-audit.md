# Product-meaning audit

Every view, against four questions:

1. **What user question does this answer?**
2. **What artifact data powers it?**
3. **What evidence supports it?**
4. **What action can follow?**

A view that cannot answer all four is decoration. This audit was run against the code, not against
intentions, and the findings at the end are the ones I acted on.

---

## Start here

| View | Answers | Powered by | Evidence | Action |
| --- | --- | --- | --- | --- |
| **How it works** | What is this and what does each tab do? | static, plus the tab list | n/a — it explains, it does not claim | every card navigates to the view it describes |
| **Builder** | What do I want to understand? | the corpus, live | the pipeline runs for real and reports each stage | builds an artifact; hands off to every other view |
| **Chat** | What does this record establish? | graph, derivations, changes, contradictions, quality | every answer carries sources, a limitation and a receipt | open the proof, open the span, or go to the view that owns the question |

## Look at the record

| View | Answers | Powered by | Evidence | Action |
| --- | --- | --- | --- | --- |
| **Overview** | What does this record currently establish? | graph, snapshot, derivations, changes | each finding links to its proof; each change to its documents | open a proof, open evidence |
| **Time Machine** | What was knowable at this point in time? | `snapshotAt` at two dates, `diffSnapshots` | every change carries both dates and both documents | move `asOf`; every view follows |
| **Intervals** | How long did things last? | `MedicationCourse`, `ConditionSpan` | each bar cites the statements that bound it | open the bounding statements |
| **Health Graph** | How does this record connect? | `buildGraph` entities and edges | edges carry the fact ids that justify them; inferred edges are marked | click a node to open its facts |
| **Records** | Where did this actually come from? | the corpus | the span is highlighted in place | open the evidence drawer |
| **Measurements** | How did documented measurements change? | `MeasurementState` series | each point is a fact with a span and a reference range | open the reading's source |
| **Debugger** | Where does the record disagree with itself? | `findContradictions` | both sides quoted, with `questionForClinician` and `notConcluded` | open either side |

## Understand the thinking

| View | Answers | Powered by | Evidence | Action |
| --- | --- | --- | --- | --- |
| **Inference** | Why does this conclusion exist? | `derive` | the full proof DAG, topologically ordered, with spans | open the proof, open the evidence |
| **Ask** | What does the record say about X? | `ask` (query planner) | the plan, citations, coverage and limitations are all shown | follow a citation |
| **Research Mode** | What does outside knowledge say? | external evidence, fenced off | sources are labelled as not yours | review an external source |
| **Research Lab** | What happens if I change the evidence? | branches, impact, proof diff, stability | every branch is a real re-derivation with its parent recorded | run a branch, compare, open a diff |

## The platform

| View | Answers | Powered by | Evidence | Action |
| --- | --- | --- | --- | --- |
| **Record Quality** | Is the problem the health or the paperwork? | `assessQuality`, audit log | nine dimensions, each with its reasoning | open the weakest dimension |
| **Cohort** | What patterns hold across patients? | `buildCohortGraphs` | prevalence in imported records, with a caveat on every query | compare subjects |
| **Interop & Sharing** | How do I take this elsewhere safely? | `exportFhir`, `redactApply` | every resource carries its span; redaction has a removal manifest | export, or preview what would be shared |

---

## What the audit found

**Six things were missing. They are the ones I built.**

1. **No conversational surface.** The explainer lived inside the Builder as a panel. A panel is right
   for one question about the finding in front of you; it is the wrong shape for a conversation, which
   is how people actually interrogate a record. → **`ChatView`**, with the engine answering first and a
   model only ever rewriting.

2. **No receipt.** An answer could be read but not *quoted*. Nothing stated what produced it in a form
   a reader could copy. → **`Receipt`**, on every reply, and it is the same six facts in the same order
   every time.

3. **No answer said what it could not say.** The explainer supplied a limitation for some intents and
   `null` for others, so a reply could read as complete. → the chat layer now **guarantees** a
   limitation on every reply, preferring the explainer's own words and putting a floor behind them.

4. **Change, conflict, absence and time were not answerable in words.** The data existed and the views
   showed it, but you had to know which tab to open. → four answers assembled directly from the
   structures those views already use, so they cannot disagree with them.

5. **Follow-up was a dead end.** An answer ended. → every reply now offers questions **this record can
   answer**, chosen from what it actually contains rather than from a fixed list.

6. **Intent detection failed on natural phrasing.** `\bconflict\b` did not match "conflicts", and
   `\bcontradict\b` did not match "contradiction" — so the most natural way to ask fell through to the
   generic path. Caught by a test, fixed by matching stems.

**Two things I judged already meaningful and left alone.** `Overview` and `Debugger` already answer
their four questions with linked evidence; rewriting them would have been churn.

**Nothing was removed.** I did not find a view that exists only because the engine can produce the
data. I would rather say that than delete something to look decisive.

**Three things from the brief I did not do well, and did not fake.** Items 3, 9 and 10 — a *State of
the Record* summary, a *Record Questions* system, and empty states that explain what was searched —
are partly served by the Chat view: its header is the state of the record, its answers are the
questions, and its empty states say what was searched. They are not a separate screen, and they should
be. That is the next piece of work, and it belongs on the Overview rather than bolted on somewhere
new.

## Coherence

Checked mechanically by `npm run audit:nav`, which fails if the sidebar, the router and `ViewId` ever
disagree:

```
ViewId   : 17
nav      : 17
routes   : 16   (builder is routed by the shell, because it takes the full viewport)

in ViewId but not in the sidebar : (none)
in ViewId with no route          : (none)
in the sidebar but not a ViewId  : (none)
```

The how-it-works page lists every one of them, and a test names all sixteen cards, so a view added to
the sidebar and forgotten in the guide fails the suite.

