import type { AIContext } from './context';
import { CONTEXT_KIND_LABEL } from './context';
import { converse, type ChatContext, type ChatReply } from '../chat/conversation';
import type { RecordQuestion } from '../engine/questions';
import { friendlyFallback, GENERAL_SYSTEM_PROMPT } from '../chat/general';
import type { LlmConfig } from '../explain/config';
import { RemoteExplainer } from '../explain/remote';
import type { ExplainerBackend } from '../explain/types';
import { runResearch } from '../engine/research';
import { streamChat, type StreamStatus, type ChatMessage } from '../explain/stream';
import { validateAIResponse, buildValidationContext } from './validate';
import {
  expandFollowUp,
  extractConcern,
  routeMessage,
  type ConversationRoute,
} from './router';
import {
  initialConversationState,
  updateConversationState,
  type ConversationState,
} from './conversationState';

/* ------------------------------------------------------------------ */
/* Medical Memory AI Gateway                                           */
/*                                                                    */
/* Medical Memory UI → this gateway → Open WebUI / engine / research   */
/*                                                                    */
/* The gateway owns routing, conversation state, and safety boundaries.  */
/* Open WebUI (or any OpenAI-compatible provider) is the conversational  */
/* layer. The engine remains the source of truth for personal records.   */
/* ------------------------------------------------------------------ */

export interface MedicalSections {
  answer: string[];
  fromRecord: string[];
  external: string[];
  unclear: string[];
}

export interface GatewayReply extends ChatReply {
  route: ConversationRoute;
  sections: MedicalSections | null;
  status: StreamStatus;
}

export interface GatewayInput {
  message: string;
  chatContext: ChatContext;
  aiContext: AIContext | null;
  conversationState: ConversationState;
  llmConfig: LlmConfig;
  /** When true, general and research routes use the model; record routes may rewrite prose. */
  useModel: boolean;
  questions: RecordQuestion[];
}

export interface GatewayHandlers {
  onStatus?: (status: StreamStatus) => void;
  onChunk?: (text: string) => void;
}

const EXTERNAL_MEDICAL_PROMPT = [
  GENERAL_SYSTEM_PROMPT,
  '',
  'When explaining general medical concepts, be accurate and concise.',
  'Label external information clearly. Never claim something is in the user\'s personal record unless structured evidence is supplied.',
  'Do not diagnose, prescribe, or tell someone to start or stop medication.',
].join('\n');

function sectionsFromRecord(reply: ChatReply): MedicalSections {
  return {
    answer: reply.paragraphs,
    fromRecord: reply.sources.map((source) => source.label),
    external: [],
    unclear: reply.notAnswered ? [reply.notAnswered] : [],
  };
}

function sectionsFromResearch(
  paragraphs: string[],
  personal: string[],
  external: string[],
  limitations: string[],
): MedicalSections {
  return {
    answer: paragraphs,
    fromRecord: personal,
    external,
    unclear: limitations,
  };
}

function healthWorryAck(message: string): string[] {
  const concern = extractConcern(message);
  return [
    concern
      ? `I hear you — ${concern} can feel unsettling when you're looking at numbers without context.`
      : "I hear you — lab results can feel unsettling when you're looking at numbers without context.",
    'I can walk through what your record actually documents, show you what changed, and point at the exact source lines. What would you like to look at first?',
  ];
}

async function tryModelChat(
  config: LlmConfig,
  messages: ChatMessage[],
  useModel: boolean,
  handlers: GatewayHandlers,
  fallback: () => string[],
): Promise<{ paragraphs: string[]; generated: boolean }> {
  if (!useModel) return { paragraphs: fallback(), generated: false };
  try {
    handlers.onStatus?.('generating');
    const content = await streamChat(config, messages, handlers);
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (paragraphs.length === 0) return { paragraphs: fallback(), generated: false };
    return { paragraphs, generated: true };
  } catch {
    return { paragraphs: fallback(), generated: false };
  }
}

/**
 * The single entry point for Medical Memory AI conversation.
 */
export async function gatewayConverse(
  input: GatewayInput,
  handlers: GatewayHandlers = {},
): Promise<{ reply: GatewayReply; nextState: ConversationState }> {
  const raw = input.message.trim();
  const expanded = expandFollowUp(raw, input.conversationState, input.aiContext);
  const route = routeMessage(raw, {
    aiContext: input.aiContext,
    activeConcern: input.conversationState.activeConcern,
    expanded,
  });

  handlers.onStatus?.(route === 'record' ? 'thinking' : route === 'research' ? 'researching' : 'generating');

  const concern = extractConcern(raw) ?? input.conversationState.activeConcern;

  /* ---- GENERAL ---- */
  if (route === 'general') {
    if (/\b(worried|concerned|anxious|nervous|scared)\b/i.test(raw)) {
      const paragraphs = healthWorryAck(raw);
      const reply: GatewayReply = {
        paragraphs,
        sources: [],
        notAnswered: null,
        actions: [],
        followUps: ['What changed?', 'Summarise what you found', 'What can you not tell me?'],
        receipt: {
          ...(await converse('Hi', input.chatContext)).receipt,
          modelUsed: false,
        },
        generated: false,
        intent: 'greeting',
        understoodAs: null,
        route: 'general',
        sections: null,
        status: 'complete',
      };
      return {
        reply,
        nextState: updateConversationState(
          input.conversationState,
          raw,
          route,
          'greeting',
          concern,
        ),
      };
    }

    const fallback = () => friendlyFallback(raw);
    const history: ChatMessage[] = [{ role: 'system', content: GENERAL_SYSTEM_PROMPT }];
    if (input.conversationState.lastQuestion && input.conversationState.lastRoute === 'general') {
      history.push({ role: 'user', content: input.conversationState.lastQuestion });
    }
    history.push({ role: 'user', content: raw });

    const { paragraphs, generated } = await tryModelChat(
      input.llmConfig,
      history,
      input.useModel,
      handlers,
      fallback,
    );

    const base = await converse('Hi', input.chatContext);
    const reply: GatewayReply = {
      paragraphs,
      sources: [],
      notAnswered: null,
      actions: [],
      followUps: base.followUps,
      receipt: { ...base.receipt, modelUsed: generated },
      generated,
      intent: 'greeting',
      understoodAs: null,
      route: 'general',
      sections: null,
      status: 'complete',
    };
    return {
      reply,
      nextState: updateConversationState(input.conversationState, raw, route, 'greeting', concern),
    };
  }

  /* ---- RESEARCH (external medical knowledge) ---- */
  if (route === 'research') {
    handlers.onStatus?.('researching');
    let externalLines: string[] = [];
    let personalLines: string[] = [];
    let limitations: string[] = [];
    let entityKeys: string[] = [];

    try {
      const research = await runResearch({
        question: expanded,
        context: input.aiContext,
        graph: input.chatContext.graph,
        snapshot: input.chatContext.snapshot,
        asOf: input.chatContext.asOf,
        artifactId: input.chatContext.identity.artifactId,
        derivations: input.chatContext.derivations,
        questions: input.questions,
        contradictions: input.chatContext.contradictions,
        quality: input.chatContext.quality,
      });
      entityKeys = research.entityKeys;
      personalLines = research.personalEvidence.map((item) => item.statement);
      externalLines = research.externalEvidence.map((item) => item.claim);
      limitations = research.limitations;
    } catch {
      limitations = ['External research could not be completed.'];
    }

    const contextBlock = [
      `Question: ${expanded}`,
      personalLines.length > 0 ? `From the user's record:\n${personalLines.join('\n')}` : 'From the user\'s record: (nothing established for this subject)',
      externalLines.length > 0 ? `External sources:\n${externalLines.join('\n')}` : 'External sources: (none retrieved)',
      limitations.length > 0 ? `Limitations:\n${limitations.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const fallback = () => [
      externalLines.length > 0
        ? externalLines[0]
        : `I can explain "${expanded.replace(/\?$/, '')}" in general terms, but no verified external source was retrieved for this subject.`,
      personalLines.length > 0
        ? `Your record documents: ${personalLines.slice(0, 2).join(' ')}`
        : 'Your personal record does not establish a statement about this subject.',
    ];

    const { paragraphs, generated } = await tryModelChat(
      input.llmConfig,
      [
        { role: 'system', content: EXTERNAL_MEDICAL_PROMPT },
        { role: 'user', content: contextBlock },
      ],
      input.useModel,
      handlers,
      fallback,
    );

    // Every checkable claim in the model's prose must resolve to the evidence.
    // The validator runs after generation and before rendering; it never sees
    // the raw user question.
    let verifiedParagraphs = paragraphs;
    if (generated) {
      const validationContext = buildValidationContext(
        input.chatContext.graph,
        input.chatContext.derivations,
        input.chatContext.asOf,
        'research',
      );
      const verified = validateAIResponse(paragraphs.join('\n\n'), validationContext);
      verifiedParagraphs = verified.text.split(/\n\s*\n/).filter(Boolean);
    }

    const engineReply = await converse(expanded, input.chatContext);
    const reply: GatewayReply = {
      paragraphs: verifiedParagraphs,
      sources: engineReply.sources,
      notAnswered:
        limitations.length > 0
          ? limitations.join(' ')
          : 'External information is not the same as your personal record.',
      actions: engineReply.actions,
      followUps: ['What does my record say about this?', 'Show me the sources', 'What can you not tell me?'],
      receipt: { ...engineReply.receipt, modelUsed: generated },
      generated,
      intent: 'concept',
      understoodAs: null,
      route: 'research',
      sections: sectionsFromResearch(verifiedParagraphs, personalLines, externalLines, limitations),
      status: 'complete',
    };
    return {
      reply,
      nextState: updateConversationState(
        input.conversationState,
        raw,
        route,
        'concept',
        concern,
        entityKeys,
      ),
    };
  }

  /* ---- RECORD (Medical Memory engine) ---- */
  handlers.onStatus?.('thinking');
  const backend: ExplainerBackend | undefined = input.useModel
    ? new RemoteExplainer(input.llmConfig)
    : undefined;
  const engineReply = await converse(expanded, input.chatContext, backend);

  const reply: GatewayReply = {
    ...engineReply,
    route: 'record',
    sections: sectionsFromRecord(engineReply),
    status: 'complete',
    understoodAs:
      engineReply.intent === 'unknown' ? null : engineReply.understoodAs,
  };

  if (engineReply.intent === 'unknown' && !input.aiContext) {
    reply.paragraphs = [
      "I don't have enough from your record to answer that directly.",
      'Try asking about a specific lab, medication, or finding — or open a document and ask me to explain it.',
    ];
    reply.notAnswered = null;
  }

  return {
    reply,
    nextState: updateConversationState(
      input.conversationState,
      raw,
      route,
      engineReply.intent,
      concern ?? extractConcern(expanded),
    ),
  };
}

export { initialConversationState, type ConversationState, type ConversationRoute };

/** Label for the health context chip in the chat UI. */
export function contextChipLabel(
  aiContext: AIContext | null,
  asOf: string,
  formatDate: (d: string) => string,
): { mode: 'general' | 'focused'; label: string } {
  if (!aiContext) return { mode: 'general', label: 'General conversation' };
  return {
    mode: 'focused',
    label: `${aiContext.title} · ${CONTEXT_KIND_LABEL[aiContext.kind]} · ${formatDate(asOf)}`,
  };
}
