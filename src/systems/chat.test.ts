import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_COOLDOWN_MS } from '@pet-village/multiplayer-protocol';
import {
  chatBubbleAlpha,
  chatBubbleDurationMs,
  chatCaretVisible,
  chatComposerAction,
  chatComposerText,
  chatDraftToSend,
  clipChatDraft,
  composerBottomOffset,
  isNewChat,
  softKeyboardInset,
  CHAT_COMPOSER_BOTTOM_PAD,
  CHAT_BUBBLE_FADE_MS,
  CHAT_BUBBLE_MAX_MS,
  CHAT_BUBBLE_MIN_MS,
  CHAT_MAX_LENGTH,
  CHAT_SEND_INTERVAL_MS,
} from './chat';

test('chat composer reads only the two keys that end a message', () => {
  assert.equal(chatComposerAction({ key: 'Enter' }), 'send');
  assert.equal(chatComposerAction({ key: 'Escape' }), 'cancel');
  // The text field is the one being typed into; letters are its business now.
  assert.equal(chatComposerAction({ key: 'h' }), 'ignore');
  assert.equal(chatComposerAction({ key: 'Backspace' }), 'ignore');
  assert.equal(chatComposerAction({ key: '🐧' }), 'ignore');
});

test('chat composer leaves modified keys and a half-typed IME character alone', () => {
  assert.equal(chatComposerAction({ key: 'Shift' }), 'ignore');
  assert.equal(chatComposerAction({ key: 'F5' }), 'ignore');
  assert.equal(chatComposerAction({ key: 'r', metaKey: true }), 'ignore');
  assert.equal(chatComposerAction({ key: 'c', ctrlKey: true }), 'ignore');
  // Mid-word in Korean or Japanese, Enter accepts the candidate on screen — it
  // is not the Enter that sends, and taking it would post half a sentence.
  assert.equal(chatComposerAction({ key: 'Enter', isComposing: true }), 'ignore');
  assert.equal(chatComposerAction({ key: 'Enter', keyCode: 229 }), 'ignore');
  // The Enter that comes after the candidate is accepted still sends.
  assert.equal(chatComposerAction({ key: 'Enter', isComposing: false }), 'send');
});

test('a draft from the text field is clipped to what the village will carry', () => {
  assert.equal(clipChatDraft('hello village'), 'hello village');
  // A paste keeps its word boundaries: newlines and tabs become spaces rather
  // than running two words together.
  assert.equal(clipChatDraft('hello\nvillage\tagain'), 'hello village again');
  // Trailing spaces survive — someone is still typing. chatDraftToSend tidies up.
  assert.equal(clipChatDraft('hi  '), 'hi  ');
  // Capped by character, so the cut cannot land inside an emoji.
  assert.equal(Array.from(clipChatDraft('a'.repeat(CHAT_MAX_LENGTH + 40))).length, CHAT_MAX_LENGTH);
  const emoji = '🐧'.repeat(CHAT_MAX_LENGTH + 10);
  const clipped = clipChatDraft(emoji);
  assert.equal(Array.from(clipped).length, CHAT_MAX_LENGTH);
  assert.equal(clipped.endsWith('🐧'), true);
});

test('the composer lifts clear of a soft keyboard, without climbing off the top', () => {
  // No visual viewport (or a desktop, where it matches the window): nothing covered.
  assert.equal(softKeyboardInset(null, 800), 0);
  assert.equal(softKeyboardInset({ height: 800, offsetTop: 0 }, 800), 0);
  // A phone keyboard shrinks the visual viewport while the page stays put.
  assert.equal(softKeyboardInset({ height: 460, offsetTop: 0 }, 800), 340);
  assert.equal(softKeyboardInset({ height: 400, offsetTop: 40 }, 800), 360);

  assert.equal(composerBottomOffset(0, 600), CHAT_COMPOSER_BOTTOM_PAD);
  assert.equal(composerBottomOffset(300, 600), CHAT_COMPOSER_BOTTOM_PAD + 300);
  // A short landscape screen under a tall keyboard: the line stops rather than
  // sliding off the top edge.
  assert.equal(composerBottomOffset(400, 360), 360 - 56);
  assert.ok(composerBottomOffset(400, 60) >= CHAT_COMPOSER_BOTTOM_PAD);
});

test('chat only sends a draft with something in it', () => {
  assert.equal(chatDraftToSend('  hello   village  '), 'hello village');
  assert.equal(chatDraftToSend('   '), null);
  assert.equal(chatDraftToSend(''), null);
});

test('chat composer line shows a prompt when empty and a blinking caret', () => {
  assert.equal(chatComposerText('', true), 'Say something_');
  assert.equal(chatComposerText('', false), 'Say something ');
  assert.equal(chatComposerText('hi', true), 'hi_');
  assert.equal(chatCaretVisible(0), true);
  assert.notEqual(chatCaretVisible(0), chatCaretVisible(500));
});

test('a chat bubble outlasts a toast, and a long one lingers longer still', () => {
  // Toasts fade after 1200ms (see UI.toast); every bubble beats that.
  assert.ok(chatBubbleDurationMs('hi') > 1_200);
  assert.equal(chatBubbleDurationMs('hi'), CHAT_BUBBLE_MIN_MS);
  assert.ok(chatBubbleDurationMs('a'.repeat(60)) > chatBubbleDurationMs('hi'));
  assert.equal(chatBubbleDurationMs('a'.repeat(CHAT_MAX_LENGTH)), CHAT_BUBBLE_MAX_MS);
});

test('a chat bubble holds full opacity, then fades out and retires', () => {
  const duration = 4_000;
  assert.equal(chatBubbleAlpha(0, duration), 1);
  assert.equal(chatBubbleAlpha(duration - CHAT_BUBBLE_FADE_MS, duration), 1);
  const half = chatBubbleAlpha(duration - CHAT_BUBBLE_FADE_MS / 2, duration);
  assert.ok(half !== null && half > 0 && half < 1);
  assert.equal(chatBubbleAlpha(duration, duration), null);
});

test('a chat message is shown once, and one already on screen is not replayed', () => {
  assert.equal(isNewChat(undefined, '10:abc'), true);
  assert.equal(isNewChat('10:abc', '10:abc'), false);
  assert.equal(isNewChat('10:abc', '20:def'), true);
  // A peer with nothing to say must not open an empty bubble.
  assert.equal(isNewChat(undefined, undefined), false);
  assert.equal(isNewChat('10:abc', ''), false);
});

test('the client waits longer than the server between messages', () => {
  // A message the server refuses is dropped silently, and the sender has already
  // seen their own bubble — so the client must never send on the exact boundary.
  assert.ok(CHAT_SEND_INTERVAL_MS > CHAT_COOLDOWN_MS);
  assert.ok(CHAT_BUBBLE_MIN_MS > CHAT_SEND_INTERVAL_MS);
});
