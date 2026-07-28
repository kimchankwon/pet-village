/**
 * Village chat: what the keys mean, and how long a bubble stays up.
 *
 * The composer is drawn on the canvas like the rest of the game's UI, so it has
 * to interpret raw keystrokes itself. Everything here is pure — the Phaser side
 * (`chatComposer`) and the renderer (`worldMultiplayer`) only draw what these
 * functions decide.
 */

import {
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LENGTH,
  isChatCharacter,
  sanitizeChatText,
} from '@pet-village/multiplayer-protocol';

export { CHAT_MAX_LENGTH };

/**
 * How long the client waits between messages. Deliberately wider than the
 * server's floor: a message refused there is silently dropped, and the sender
 * has already watched their own bubble appear, so the client must be the stricter
 * of the two rather than sending on the exact boundary and losing the race.
 */
export const CHAT_SEND_INTERVAL_MS = CHAT_COOLDOWN_MS + 200;

/** A bubble is up for reading time, not a fixed beat like a toast (1.2s). */
export const CHAT_BUBBLE_BASE_MS = 2_000;
export const CHAT_BUBBLE_PER_CHARACTER_MS = 70;
export const CHAT_BUBBLE_MIN_MS = 3_500;
export const CHAT_BUBBLE_MAX_MS = 9_000;
export const CHAT_BUBBLE_FADE_MS = 500;
/** Caret half-period, so an idle composer still looks like it wants typing. */
export const CHAT_CARET_BLINK_MS = 480;

export type ChatKeyAction = 'send' | 'cancel' | 'backspace' | 'type' | 'ignore';

/**
 * What a keystroke means to an open composer. Modified keys are left alone so
 * browser shortcuts (copy, reload, tab away) still work while typing.
 */
export function chatComposerAction(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): ChatKeyAction {
  if (event.key === 'Enter') return 'send';
  if (event.key === 'Escape') return 'cancel';
  if (event.ctrlKey || event.metaKey || event.altKey) return 'ignore';
  if (event.key === 'Backspace') return 'backspace';
  // Single printable characters only — 'Shift', 'F5' and friends are not text.
  return isChatCharacter(event.key) ? 'type' : 'ignore';
}

/** Add a keystroke to the draft, stopping at the length the server accepts. */
export function appendChatInput(draft: string, key: string) {
  if (!isChatCharacter(key) || Array.from(draft).length >= CHAT_MAX_LENGTH) return draft;
  return draft + key;
}

export function backspaceChatInput(draft: string) {
  // Split by code point so a backspace over an emoji removes the emoji.
  const characters = Array.from(draft);
  characters.pop();
  return characters.join('');
}

/** Whether this draft has anything the server would accept. */
export function chatDraftToSend(draft: string) {
  return sanitizeChatText(draft);
}

/** Long messages need longer on screen; short ones still outlast a toast. */
export function chatBubbleDurationMs(text: string) {
  const readingTime = CHAT_BUBBLE_BASE_MS + Array.from(text).length * CHAT_BUBBLE_PER_CHARACTER_MS;
  return Math.max(CHAT_BUBBLE_MIN_MS, Math.min(CHAT_BUBBLE_MAX_MS, readingTime));
}

/**
 * Opacity for a bubble that has been up for `elapsedMs`, fading out at the end.
 * Null once it is finished, which is the renderer's cue to hide it.
 */
export function chatBubbleAlpha(elapsedMs: number, durationMs: number): number | null {
  if (elapsedMs < 0) return 1;
  if (elapsedMs >= durationMs) return null;
  const remaining = durationMs - elapsedMs;
  return remaining >= CHAT_BUBBLE_FADE_MS ? 1 : remaining / CHAT_BUBBLE_FADE_MS;
}

/** A message this client has not shown yet — the same test the wave uses. */
export function isNewChat(previousChatId: string | undefined, nextChatId: string | undefined) {
  return Boolean(nextChatId && nextChatId !== previousChatId);
}

export function chatCaretVisible(nowMs: number) {
  return Math.floor(nowMs / CHAT_CARET_BLINK_MS) % 2 === 0;
}

/** The composer's line: draft, blinking caret, and a nudge when it is empty. */
export function chatComposerText(draft: string, caretVisible: boolean) {
  const caret = caretVisible ? '_' : ' ';
  return draft.length === 0 ? `Say something${caret}` : `${draft}${caret}`;
}
