# AI Gateway Audit

This documents the *actual* runtime path of Medical Memory's AI system, as it
exists in `src/ai/`, `src/chat/`, `src/explain/`, and `src/engine/research/`.
Every branch names its input, classifier, engine/tool, model, provenance,
fallback, and output. It is the source of truth for `npm run audit:ai-gateway`.

## The pipeline

```
User message
  ↓
ChatView (src/views/ChatView.tsx)
  ↓
gatewayConverse(input, handlers)          src/ai/gateway.ts
  ↓
expandFollowUp(raw, state, aiContext)     src/ai/router.ts
  ↓
routeMessage(raw, { aiContext, concern, expanded })   src/ai/router.ts
  ↓
┌───────────────┬──────────────────┬─────────────────┐
│ GENERAL       │ RECORD           │ RESEARCH        │
└───────────────┴──────────────────┴─────────────────┘
        ↓                 ↓                  ↓
  friendlyFallback    converse()          runResearch()
  or model chat       (engine first)      (external evidence)
  (GENERAL_PROMPT)    (+ RemoteExplainer) (+ model explanation)
        ↓                 ↓                  ↓
  GatewayReply + nextState (ConversationState)
        ↓
  ChatView renders paragraphs / sections / sources / receipt
```

## Model claim validation

After the model writes an explanation and before it is rendered, `validateAIResponse`
(`src/ai/validate.ts`) verifies that every checkable claim resolves to the evidence
the gateway supplied — never the raw user question. It is deterministic: there is no
second model judging the first.

- **Numbers** — a value must appear in the evidence with a matching unit; `6.6` and
  `6.60` are equivalent, `6.7` is not, and `45 mmol/L` is not `45 mg/dL`.
- **Dates** — equivalent formats are normalised (`09/15/2026` = `September 15, 2026` =
  `2026-09-15`); a date after `asOf` is rejected.
- **Personal claims** — a `record`-route sentence that names the user's record must
  resolve to a supported value or a known entity, never to external evidence.
- **Conclusions** — a diagnosis or certainty the engine does not establish is rejected
  and replaced with a deterministic limitation, not another model's guess.
- **General chat bypasses validation entirely.**

It is the source of truth for `npm run audit:ai-validation`.

## Router and model boundary, in isolation

`src/ai/router.test.ts` tests `routeMessage` and `expandFollowUp` on their own:
every classifier branch (general greetings and health worries, record questions and
follow-ups, research topics), context-over-text priority (an attached `AIContext` wins
over a would-be research question), pronoun resolution, concern persistence, and
`isFollowUp`.

`src/explain/remote.test.ts` asserts the model boundary at the wire: the model's input
is the engine's answer verbatim (`grounded.paragraphs.join`), and the user's raw
question is never passed through. The model can rewrite wording; it cannot answer the
question itself.


## The three routes

### GENERAL — `src/chat/general.ts`, `src/ai/router.ts`

- **Classifier:** `isGeneralChat(raw)` — greetings, thanks, small talk,
  capabilities, jokes, farewells, affirmations. Also `HEALTH_WORRY` is routed to
  `general` so a bare worry is acknowledged conversationally, never diagnosed.
- **Engine/tool:** none. The medical engine is deliberately *not* invoked.
- **Model:** the configured `LlmConfig` via `streamChat`, with
  `GENERAL_SYSTEM_PROMPT`.
- **Fallback:** `friendlyFallback(raw)` — deterministic, warm, no model needed.
- **Provenance:** `modelUsed` reflects whether the model ran; no sources.
- **Output:** natural paragraphs. Never "intent not recognized".

### RECORD — `src/chat/conversation.ts`, `src/explain/grounded.ts`, `src/explain/remote.ts`

- **Classifier:** `detectChatIntent` (changed/conflicts/missing/timeline/
  questions), `PERSONAL` pronoun/possessive patterns, an active `aiContext`, or a
  follow-up with an active concern.
- **Engine/tool:** `converse()` — the deterministic Medical Memory engine first
  (changes, contradictions, gaps, timeline, questions, grounded explainer).
- **Model:** optional `RemoteExplainer` (OpenAI-compatible / Open WebUI) rewrites
  the engine's prose; the citations stay the engine's.
- **Fallback:** the engine's own answer survives a model outage (the
  `RemoteExplainer`/`OpenWebUiExplainer` catch-path returns the grounded answer
  with a "model was not used" note).
- **Provenance:** `ENGINE-DERIVED` vs `MODEL-EXPLAINED`; sources are facts/spans.

### RESEARCH — `src/engine/research/`, `src/ai/gateway.ts`

- **Classifier:** `EXTERNAL` (FDA / clinical trials / guidelines / "find current
  information") or `GENERAL_MEDICAL` ("what is X") when *not* personal.
- **Engine/tool:** `runResearch()` — external evidence retrieval + personal
  evidence, kept as distinct lists.
- **Model:** optional, with `EXTERNAL_MEDICAL_PROMPT`.
- **Fallback:** if research fails, `limitations` states it; personal and external
  lines are never merged.
- **Provenance:** external claims are labeled external; they can never become a
  `Fact`, `Derivation`, or `Finding` without explicit classification.

## Conversation state — `src/ai/conversationState.ts`

`ConversationState { activeConcern, activeEntityKeys, lastRoute, lastIntent,
lastQuestion, turnCount }`. `updateConversationState` carries `activeConcern`
forward unless a new one is extracted, and replaces entity keys only when new
ones arrive. This is conversation *memory*, explicitly **not** medical truth.

`expandFollowUp` (router.ts) resolves "what about…", "why is that", "show me the
source", "the previous result", and "more simply" against `activeConcern` (or
`aiContext.title`) rather than re-keywording the final sentence alone.

## Streaming — `src/explain/stream.ts`

`streamChat` posts `stream: true` and reads SSE lines; `parseSseChunk` handles
`data:` framing, `[DONE]`, OpenAI `choices[].delta.content` and Ollama
`message.content` shapes, and returns `null` for malformed lines. A non-SSE
response falls back to a single JSON completion. `onStatus` emits
`generating → complete`, and `onChunk` emits text as it arrives.

## Provider abstraction

Open WebUI, Ollama, and OpenAI-compatible providers all speak the same
chat-completions shape, normalised by `config.ts` (`chatPath`/`modelsPath` for
`openai` vs `open-webui`) and by `stream.ts`/`remote.ts` response parsing. The UI
never sees a provider-specific format.

## Boundaries the audit enforces

1. A general greeting never creates a medical finding.
2. A model cannot create a personal fact.
3. External research cannot become personal evidence automatically.
4. A stale context cannot silently resolve to another object.
5. A provider failure cannot erase an engine answer.
6. A streaming failure cannot produce a falsely completed response.
7. Every personal factual answer resolves to artifact evidence.
8. Every external factual answer resolves to an external source.

## Known gaps (not yet automated)

- `src/ai/router.ts` and `src/ai/conversationState.ts` have no dedicated test
  file; routing is asserted inside `gateway.test.ts`.
- `src/explain/stream.ts` had no test file before this audit.
- There is no central `validateAIResponse()` that rejects model prose citing a
  source/finding/number the engine did not produce. The engine already keeps
  citations authoritative (the model never supplies them), but a validator that
  rejects unsupported prose in the *text* is not yet present.
