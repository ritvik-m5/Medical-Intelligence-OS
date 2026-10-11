import type { ConversationRoute } from './router';

/* ------------------------------------------------------------------ */
/* Conversation memory                                                 */
/*                                                                    */
/* Structured state the router uses across turns. This is not model     */
/* memory and must never become medical truth — it only tracks what     */
/* the conversation is about so follow-ups resolve correctly.           */
/* ------------------------------------------------------------------ */

export interface ConversationState {
  activeConcern: string | null;
  activeEntityKeys: string[];
  lastRoute: ConversationRoute | null;
  lastIntent: string | null;
  lastQuestion: string | null;
  turnCount: number;
}

export function initialConversationState(): ConversationState {
  return {
    activeConcern: null,
    activeEntityKeys: [],
    lastRoute: null,
    lastIntent: null,
    lastQuestion: null,
    turnCount: 0,
  };
}

export function updateConversationState(
  state: ConversationState,
  message: string,
  route: ConversationRoute,
  intent: string,
  concern: string | null,
  entityKeys: string[] = [],
): ConversationState {
  return {
    activeConcern: concern ?? state.activeConcern,
    activeEntityKeys: entityKeys.length > 0 ? entityKeys : state.activeEntityKeys,
    lastRoute: route,
    lastIntent: intent,
    lastQuestion: message.trim(),
    turnCount: state.turnCount + 1,
  };
}
