import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_COOLDOWN_MS } from '@pet-village/multiplayer-protocol';
import {
  appendChatInput,
  backspaceChatInput,
  chatBubbleAlpha,
  chatBubbleDurationMs,
  chatCaretVisible,
  chatComposerAction,
  chatComposerText,
  chatDraftToSend,
  isNewChat,
  CHAT_BUBBLE_FADE_MS,
  CHAT_BUBBLE_MAX_MS,
  CHAT_BUBBLE_MIN_MS,
  CHAT_MAX_LENGTH,
  CHAT_SEND_INTERVAL_MS,
} from './chat';

test('chat composer reads Enter as send, Escape as cancel and letters as text', () => {
  assert.equal(chatComposerAction({ key: 'Enter' }), 'send');
  assert.equal(chatComposerAction({ key: 'Escape' }), 'cancel');
  assert.equal(chatComposerAction({ key: 'Backspace' }), 'backspace');
  assert.equal(chatComposerAction({ key: 'h' }), 'type');
  assert.equal(chatComposerAction({ key: ' ' }), 'type');
  assert.equal(chatComposerAction({ key: '🐧' }), 'type');
});

test('chat composer leaves modified keys and named keys to the browser', () => {
  assert.equal(chatComposerAction({ key: 'Shift' }), 'ignore');
  assert.equal(chatComposerAction({ key: 'F5' }), 'ignore');
  assert.equal(chatComposerAction({ key: 'ArrowLeft' }), 'ignore');
  assert.equal(chatComposerAction({ key: 'r', metaKey: true }), 'ignore');
  assert.equal(chatComposerAction({ key: 'c', ctrlKey: true }), 'ignore');
  // Enter and Escape still work as controls, whatever else is held down.
  assert.equal(chatComposerAction({ key: 'Enter', ctrlKey: true }), 'send');
  assert.equal(chatComposerAction({ key: 'Escape', metaKey: true }), 'cancel');
});

test('chat draft takes spaces, stops at the length the server accepts', () => {
  assert.equal(appendChatInput('hi', ' '), 'hi ');
  assert.equal(appendChatInput('hi ', 'you'), 'hi ');
  assert.equal(appendChatInput('hi', 'Shift'), 'hi');
  const full = 'a'.repeat(CHAT_MAX_LENGTH);
  assert.equal(appendChatInput(full, 'b'), full);
});

test('chat backspace removes one whole character, including an emoji', () => {
  assert.equal(backspaceChatInput('hey🐧'), 'hey');
  assert.equal(backspaceChatInput('h'), '');
  assert.equal(backspaceChatInput(''), '');
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
