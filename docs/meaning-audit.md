# Meaning audit

Every reachable view answers one primary question, draws from one part of the
artifact, points at a real proof or evidence source, offers one primary action,
has a meaningful empty state, and hands off to the AI chat at a real
destination. This table is the single source of truth for all six.

It is machine-checked by `npm run audit:meaning`: every `ViewId` must appear
exactly once, every cell must be filled, and every **AI handoff** must name a
view that actually exists.

| View | Primary question | Artifact data | Proof / evidence | Primary action | Meaningful empty state | AI handoff |
| --- | --- | --- | --- | --- | --- | --- |
| `home` | What does my health record say, in plain view? | patient, snapshot totals, changes, questions, verification | every area → the view that shows its source | Ask, see changes, see open questions, read the record | Each area links to a real view; a missing change/question is stated, not hidden | `chat` |
| `whatis` | Why does this software exist, and why does it matter? | none (product explanation, three depths) | each section → the same claim at three depths; the engine is unchanged | Pick an explanation depth | None — the explanation is always present, at whatever depth is chosen | `chat` |
| `reset` | What can I undo, and what does each action remove? | user document count, storage state, audit state | each action → states exactly what it removes and what it leaves | Confirm a destructive action | None — every action is always listed, with an explicit confirmation | `chat` |
| `overview` | What does this record establish right now? | snapshot, contradictions, derivations, changes, quality, questions | fact → document/span; finding → proof; question → evidence gap | Read the State of the Record, advance a question's status | Each section says what was searched, what was found, and what the absence does not conclude | `chat` |
| `timemachine` | What changed, and when did it become documented? | snapshots across `asOf`, change events | change → both facts and both documents | Move `asOf` and watch every view update together | No change in window: names the window searched and the two dates compared | `chat` |
| `temporal` | Over what interval was each state documented? | reconstructed intervals per entity | interval → the fact spans that bound it | Inspect an interval's bounding documents | No interval: the entity was stated once, so there is no reconstructed span | `chat` |
| `graph` | How are the documented entities connected? | entities, facts, edges | edge → the facts that produced it | Trace a connection back to its facts | No edge: the two entities share no documented fact | `chat` |
| `records` | What exactly does each document state? | facts, documents, spans | fact → document and character span | Open the exact characters behind a fact | No fact for a query: names what was searched | `chat` |
| `debugger` | Where does the record disagree with itself? | contradictions | contradiction → the two conflicting facts | See both sides without picking one | No contradiction: names the documents evaluated and the rules that did not fire | `chat` |
| `inference` | Why is this finding present? | derivations, rules | finding → full proof (premises, rule, spans) | Open the proof for a derivation | No derivation: the rule fired on nothing at this date | `chat` |
| `measurements` | What has been measured, and how has it trended? | measurement states, series | reading → the fact that recorded it | Open a series and its reference range | No measurement: the type was never documented in this record | `chat` |
| `quality` | How well supported is this record? | quality report, dimensions | dimension → the facts that justify its score | Open a low dimension to its evidence | No weak dimension: every dimension is above threshold | `chat` |
| `cohort` | How does this record compare across a cohort? | cohort graphs | comparison → the underlying graphs | Compare one record against the cohort | Empty cohort: nothing was loaded to compare against | `chat` |
| `interop` | Can this record be shared without loss? | artifact, mapping | mapping → the source facts it round-trips | Export and re-import the artifact | No mapping: the format carries nothing to map | `chat` |
| `research` | What would a researcher want to reproduce? | artifact, provenance | every output → its provenance | Open a reproducible output | No output: the query produced nothing reproducible | `chat` |
| `lab` | What do the rules do on raw inputs? | raw documents, rule registry | rule → its inputs and outputs | Run a rule on a chosen input | No rule matched: the rule's conditions were not met | `chat` |
| `ask` | What has been asked, and what did the engine answer? | ask turns | answer → the facts it was grounded in | Re-open a past question and its answer | No turns: nothing has been asked yet | `chat` |
| `guide` | How does this product work? | none (product explanation) | each card → the real view it describes | Jump into the described view | Every card links to a view that exists | `chat` |
| `builder` | What will this artifact contain before it exists? | pipeline stages | each stage → the counts it has produced so far | Run the build and watch each stage report real counts | A stage shows `0` until the pipeline has produced it | `chat` |
| `chat` | What does the record say, and what can it not say? | everything the engine reads | answer → sources with spans; receipt | Ask a question and act on a real destination | Every reply names its limitation and offers a real destination | `chat` |

## What the audit enforces

- **One primary question per view.** A view that answers two questions is two
  views; a view that answers none is chrome.
- **Artifact data, never invented numbers.** A count on screen must be readable
  from the artifact. The builder is the exception only in that it shows counts
  *as the pipeline produces them* — it never animates a number before the step
  that produces it has run.
- **A real proof or evidence source.** Every line a reader might quote must link
  to the fact, document, span, or proof that produced it.
- **A meaningful empty state.** "No data", "no finding", "not enough evidence",
  "not evaluated", and "nothing applicable" are five different things, and every
  empty state says what was searched, what was found, and what the absence does
  not allow a reader to conclude.
- **An AI handoff at a real destination.** The chat may not point anywhere that
  does not exist; the audit fails if a handoff names a non-view.
