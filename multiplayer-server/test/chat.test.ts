import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_COOLDOWN_MS, CHAT_MAX_LENGTH, PlayerState, TownState } from '@pet-village/multiplayer-protocol';
import { TownRoom } from '../src/TownRoom.ts';

type RoomInternals = { chat: (client: { sessionId: string }, payload: { text: unknown }) => void };

function roomWithSpeaker() {
  const room = new TownRoom();
  room.setState(new TownState());
  const player = new PlayerState();
  Object.assign(player, { userId: 'user-a', active: true, scene: 'town' });
  room.state.players.set('session-a', player);
  return { room, player, chat: (room as unknown as RoomInternals).chat.bind(room) };
}

const client = { sessionId: 'session-a' };

test('a chat message is sanitized by the server, not trusted from the sender', () => {
  const { player, chat } = roomWithSpeaker();
  chat(client, { text: '  hello   village\nfriends  ' });
  assert.equal(player.chatText, 'hello village friends');
  // The id carries the send time, which is what the next message is measured against.
  const sentAt = Number(player.chatId.split(':')[0]);
  assert.ok(Math.abs(Date.now() - sentAt) < 5_000);
  assert.ok(player.chatId.length > String(sentAt).length + 1);
});

test('a chat message with nothing to say posts no bubble', () => {
  const { player, chat } = roomWithSpeaker();
  chat(client, { text: '   ' });
  chat(client, { text: '' });
  chat(client, { text: undefined });
  chat(client, { text: 42 });
  chat(client, { text: 'a'.repeat(CHAT_MAX_LENGTH * 8 + 1) });
  assert.equal(player.chatText, '');
  assert.equal(player.chatId, '');
});

test('chat is rate limited per player and only while they are in a scene', () => {
  const { player, chat } = roomWithSpeaker();
  player.chatId = `${Date.now()}:already-said-something`;
  chat(client, { text: 'again' });
  assert.equal(player.chatText, '');

  player.chatId = `${Date.now() - CHAT_COOLDOWN_MS - 1}:said-a-moment-ago`;
  chat(client, { text: 'again' });
  assert.equal(player.chatText, 'again');

  // Someone away in a minigame is not standing in the village to speak.
  const quiet = roomWithSpeaker();
  quiet.player.active = false;
  quiet.chat(client, { text: 'hello?' });
  assert.equal(quiet.player.chatText, '');
});

test('chat from a session with no player is ignored', () => {
  const { room, chat } = roomWithSpeaker();
  chat({ sessionId: 'session-ghost' }, { text: 'boo' });
  assert.equal(room.state.players.get('session-a')?.chatText, '');
});
