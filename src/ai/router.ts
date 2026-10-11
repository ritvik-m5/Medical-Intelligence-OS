import type { AIContext } from './context';
import { isPronounQuestion } from './context';
import { isGeneralChat } from '../chat/general';
import { detectChatIntent, type ChatIntent } from '../chat/conversation';

/* ------------------------------------------------------------------ */
/* Three-layer conversation router                                     */
/*                                                                    */
/* GENERAL CHAT  → Open WebUI / model (natural conversation)           */
/* RECORD        → Medical Memory engine (personal artifact)           */
/* RESEARCH      → external medical knowledge (+ optional registry)    */
/*                                                                    */
/* A greeting is not a medical query. A follow-up is not re-keyworded    */
/* from the final sentence alone — conversation state matters.           */
/* ------------------------------------------------------------------ */

export type ConversationRoute = 'general' | 'record' | 'research';

// Broad general-medical vocabulary: anything that reads like a question about
// how the body works or what a substance does, not about what is in the record.
// Placed here (before PERSONAL) so these questions go to external research
// rather than the personal record engine.
const GENERAL_MEDICAL =
  /\b(what (is|are|was|were|will|can|should|would|could)|tell me about|explain|define|describe|what happens if|what would happen if|what could happen if|what if|what should i|is there|are there|does|do|will|can|how)\b/i;


const PERSONAL =
  /\b(my|me|mine|i\b|my record|this record|my document|this document|my lab|my result|my medication|my meds|this finding|this result|this proof|this document|what changed|what is missing|open question|in my record|from my record|does my record|what does my)\b/i;

const EXTERNAL =
  /\b(fda|clinical trials?|clinicaltrials|guideline|current information|external|web search|what does the fda|find (current )?information|latest research)\b/i;


const HEALTH_WORRY =
  /\b(worried|concerned|anxious|nervous|scared|stress(ed)?)\b.*\b(lab|result|medication|health|record|symptom|diagnosis|test)\b/i;

const FOLLOW_UP =
  /\b(what about|and the|why is that|why is this|explain that|show me the source|more simply|what changed afterward|the previous|that result|that one)\b/i;

const RECORD_INTENTS = new Set<ChatIntent>([
  'changed',
  'conflicts',
  'missing',
  'timeline',
  'questions',
]);

export function isFollowUp(message: string): boolean {
  return FOLLOW_UP.test(message.trim());
}

/** Pull a health concern from conversational worry, not from the engine. */
export function extractConcern(message: string): string | null {
  const text = message.trim();
  const lab = text.match(/\b(my )?(lab results?|labs|blood work)\b/i);
  if (lab) return 'lab results';
  const med = text.match(/\b(my )?(medications?|meds)\b/i);
  if (med) return 'medications';
  const term = text.match(/\b(worried|concerned) about (?:my )?(.+?)[.!?]*$/i);
  if (term) return term[2].trim().slice(0, 80);
  return null;
}

/**
 * Expand a pronoun or vague follow-up using conversation state.
 * The router sees the expanded question; the UI still shows what the user typed.
 */
export function expandFollowUp(
  message: string,
  state: { activeConcern: string | null; lastQuestion: string | null },
  aiContext: AIContext | null,
): string {
  const text = message.trim();
  if (aiContext && isPronounQuestion(text)) return text;

  const concern = state.activeConcern ?? aiContext?.title ?? null;
  if (!concern) return text;

  if (/medication/i.test(text)) return `What does my record say about my medications?`;
  if (/previous result|that result|that one/i.test(text)) {
    return `What does my record say about ${concern}?`;
  }
  if (/explain that more simply|more simply/i.test(text)) {
    return `Explain ${concern} in simpler terms`;
  }
  if (/what changed afterward|what changed after/i.test(text)) {
    return `What changed after ${concern}?`;
  }
  if (/show me the source|the source/i.test(text)) {
    return `Show me the evidence for ${concern}`;
  }
  if (/why is that|why is this/i.test(text)) {
    return `Why is ${concern} in my record?`;
  }
  if (/what about/i.test(text)) {
    return `What does my record say about ${concern}?`;
  }
  return text;
}

export function routeMessage(
  message: string,
  options: {
    aiContext: AIContext | null;
    activeConcern: string | null;
    expanded?: string;
  },
): ConversationRoute {
  const raw = message.trim();
  const text = (options.expanded ?? raw).trim();

  if (isGeneralChat(raw)) return 'general';
  if (HEALTH_WORRY.test(raw)) return 'general';

  if (options.activeConcern && isFollowUp(raw)) return 'record';
  if (/\b(explain the|my .+ result|this result|the result|what does my)\b/i.test(text)) return 'record';

  const recordIntent = detectChatIntent(text);
  if (RECORD_INTENTS.has(recordIntent)) return 'record';

  if (options.aiContext) return 'record';
  if (isPronounQuestion(text)) return 'record';

  // General medical questions go to research before the personal record check
  if (GENERAL_MEDICAL.test(text) && !/\bresult\b/i.test(text)) {
    return 'research';
  }

  if (PERSONAL.test(text)) return 'record';
  if (isFollowUp(raw) && options.activeConcern) return 'record';

  if (EXTERNAL.test(text)) return 'research';


  return 'general';
}
