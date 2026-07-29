/**
 * Village chat: what you are allowed to type, and how long a bubble stays up.
 *
 * The composer is drawn on the canvas like the rest of the game's UI, but the
 * typing itself goes through a real text field the browser owns — otherwise a
 * phone never raises its keyboard and an IME has nothing to compose into.
 * Everything here is pure: the Phaser side (`chatComposer`) and the renderer
 * (`worldMultiplayer`) only draw what these functions decide.
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

export type ChatKeyAction = 'send' | 'cancel' | 'ignore';

/**
 * What became of a line the moment Enter was pressed.
 *
 * `offline` is not a failure. Most of the village is played with no server in
 * reach — a guest save, a dropped connection, the multiplayer host simply not
 * running — and a message typed then is still the player's own line: it gets
 * their bubble and their log entry, it just has nobody to travel to. Only
 * `cooldown` holds the draft back, and only for the moment it takes to pass.
 */
export type ChatSendResult = 'sent' | 'offline' | 'cooldown';

/**
 * What a keystroke means to an open composer.
 *
 * Only the two that end the message are read: the text field is the one being
 * typed into, so every other key is already its business, and modified keys are
 * left alone so browser shortcuts (copy, reload, tab away) keep working.
 *
 * `isComposing` is the one that matters for a language with an IME. Mid-word,
 * Enter accepts the candidate you are looking at — it is not the Enter that
 * sends. The field is still assembling a character, so the composer keeps its
 * hands off and waits for the next one.
 */
export function chatComposerAction(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}): ChatKeyAction {
  // 229 is what a browser reports for a keystroke an IME has swallowed; some
  // send it without ever setting isComposing.
  if (event.isComposing || event.keyCode === 229) return 'ignore';
  if (event.ctrlKey || event.metaKey || event.altKey) return 'ignore';
  if (event.key === 'Enter') return 'send';
  if (event.key === 'Escape') return 'cancel';
  return 'ignore';
}

/**
 * A draft made of whatever the text field currently holds.
 *
 * The field is the browser's, so it can arrive with things the game's own key
 * reader never had to consider: a pasted paragraph, a newline, a tab, more
 * characters than the server will take. Unsafe characters become spaces rather
 * than vanishing, so a paste keeps its word boundaries, and the cap counts
 * characters rather than code units so it cannot cut an emoji in half.
 *
 * Runs of whitespace are left alone — collapsing them here would fight the
 * person typing "hello  " on the way to a second word. `chatDraftToSend` tidies
 * that up at the end.
 */
export function clipChatDraft(value: string): string {
  const safe = Array.from(value, (character) => (isChatCharacter(character) ? character : ' '));
  return safe.slice(0, CHAT_MAX_LENGTH).join('');
}

/** Whether this draft has anything the server would accept. */
export function chatDraftToSend(draft: string) {
  return sanitizeChatText(draft);
}

/**
 * How far above the bottom of the screen the composer line sits, at rest.
 *
 * Clear of the bottom button bar (see UI.bottomButtons), which the line used to
 * run straight through. That was only ugly while the line was painted on the
 * canvas; now that a real text field is laid over it, an overlap would also mean
 * the field swallowing taps meant for the Chat and Pet buttons underneath.
 */
export const CHAT_COMPOSER_BOTTOM_PAD = 62;

/**
 * How much of the screen a phone's keyboard is covering, in CSS pixels.
 *
 * The layout viewport does not shrink when a soft keyboard slides up on iOS, so
 * the page has no idea anything happened; the visual viewport does. Zero on a
 * desktop, and zero on the Androids that resize the page instead — there the
 * canvas has already shrunk and the line moved with it.
 */
export function softKeyboardInset(
  viewport: { height: number; offsetTop: number } | null | undefined,
  windowHeight: number,
): number {
  if (!viewport) return 0;
  return Math.max(0, windowHeight - (viewport.height + viewport.offsetTop));
}

/**
 * Where to draw the composer line, as a distance up from the bottom edge.
 *
 * A keyboard that covers the bottom of the screen covers the line you are
 * typing into, which is the whole difficulty with a canvas text field on a
 * phone. Lift it clear — but never so far that it climbs off the top, which a
 * short landscape screen under a tall keyboard would otherwise do.
 */
export function composerBottomOffset(insetGamePx: number, cameraHeight: number): number {
  const lifted = CHAT_COMPOSER_BOTTOM_PAD + Math.max(0, insetGamePx);
  const highest = Math.max(CHAT_COMPOSER_BOTTOM_PAD, cameraHeight - 56);
  return Math.min(lifted, highest);
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
