import { chatPath, type LlmConfig } from '../explain/config';

/* ------------------------------------------------------------------ */
/* General conversation                                                */
/*                                                                    */
/* The assistant must be able to talk naturally, not just answer         */
/* medical queries. Greetings, small talk, thanks, "what can you do?" —  */
/* these are normal conversation and must never dead-end at "not          */
/* answered".                                                            */
/*                                                                    */
/* Two layers:                                                          */
/*   - `friendlyFallback` answers casually with no model at all.         */
/*   - `generalChat` sends the message to the configured model (Open      */
/*     WebUI, Ollama, or any OpenAI-compatible endpoint) with a general   */
/*     assistant prompt, so real conversation goes through the model.     */
/*                                                                    */
/* Neither path touches the evidence engine: general chat is explicitly  */
/* NOT a record question, and must never be forced through intent         */
/* detection.                                                             */
/* ------------------------------------------------------------------ */

export const GENERAL_SYSTEM_PROMPT = [
  "You are Medical Memory's conversational assistant.",
  'Be natural, helpful, concise and conversational.',
  'When the user is simply chatting — greetings, small talk, thanks, or a general question — respond normally.',
  'When the user asks about their personal health record, do not invent facts: the structured Medical Memory evidence is supplied separately, and you only explain what it contains.',
  'Never fabricate a medical fact, a source, a diagnosis, or a recommendation about the user.',
].join('\n');

const GREETING = /^(hi|hello|hey|hiya|howdy|yo|sup|good (morning|afternoon|evening))\b/i;
const THANKS = /^(thanks|thank you|thx|thankyou)\b/i;
const CAPABILITIES = /(what can you do|who are you|what are you|help me understand|what do you do)/i;
const SMALL_TALK = /(how are you|how's it going|what's up|how are things|how are you doing)/i;
const JOKE = /(tell me a joke|joke)/i;
const FAREWELL = /^(bye|goodbye|see you|cya|take care)\b/i;
const AFFIRMATION = /^(ok|okay|cool|got it|nice|great|sounds good)\b/i;

/**
 * Whether a message is ordinary conversation rather than a question about the
 * record. This is deliberately narrow: only unambiguous small talk is routed
 * here, so a real question is never misclassified as chit-chat.
 */
export function isGeneralChat(question: string): boolean {
  const text = question.trim();
  if (text.length > 80) return false;
  return (
    GREETING.test(text) ||
    THANKS.test(text) ||
    CAPABILITIES.test(text) ||
    SMALL_TALK.test(text) ||
    JOKE.test(text) ||
    FAREWELL.test(text) ||
    AFFIRMATION.test(text)
  );
}

/** Warm, deterministic responses for casual conversation with no model. */
export function friendlyFallback(question: string): string[] {
  const text = question.trim();

  if (GREETING.test(text)) {
    return [
      "Hi! I'm Medical Memory. I can help you understand your health records, explain medical terminology, explore what changed over time, and answer questions using the evidence in your record.",
      'What would you like to look at?',
    ];
  }
  if (THANKS.test(text)) {
    return ["You're welcome. Anything else you'd like to look at in your record?"];
  }
  if (CAPABILITIES.test(text)) {
    return [
      'I can explain your health records in plain language, show you what changed, what conflicts, and what is missing, and point at the exact source line behind every finding.',
      'Ask me a question, or open a document and ask me about it.',
    ];
  }
  if (SMALL_TALK.test(text)) {
    return ["I'm doing well, thank you. How can I help with your health records today?"];
  }
  if (JOKE.test(text)) {
    return [
      'Why did the medical record go to therapy? It had too many unresolved contradictions.',
      "(The engine flags contradictions; it never resolves them for you.)",
    ];
  }
  if (FAREWELL.test(text)) {
    return ['Take care. Your records are here whenever you want to look at them again.'];
  }
  return [
    "I'm here to help you understand your health records. Ask me about a medication, a lab result, or what changed — or open a document and ask me to explain it.",
  ];
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  message?: { content?: string };
  error?: { message?: string };
}

/**
 * Send a general message to the configured model and return it as prose
 * paragraphs. Works against Open WebUI (`protocol: 'open-webui'`), Ollama, or
 * any OpenAI-compatible endpoint — all of which speak the same chat shape.
 */
export async function generalChat(config: LlmConfig, message: string): Promise<string[]> {
  const response = await fetch(chatPath(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: GENERAL_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`The model answered ${response.status} ${response.statusText}.`);
  }

  const body = (await response.json()) as ChatCompletion;
  if (body.error?.message) throw new Error(body.error.message);
  const content = body.choices?.[0]?.message?.content ?? body.message?.content ?? '';
  return content
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
