import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendChatLog,
  chatLogAlpha,
  chatLogEntries,
  chatLogText,
  clearChatLog,
  noteChatLogPresence,
  presenceChanges,
  resetChatLogPresence,
  subscribeChatLog,
  CHAT_LOG_FADE_MS,
  CHAT_LOG_HOLD_MS,
  CHAT_LOG_MAX_ENTRIES,
} from './chatLog';

const roster = (...names: string[]) => names.map((name) => ({ sessionId: `s-${name}`, name }));

test('the log keeps the last few lines and tells anyone watching', () => {
  clearChatLog();
  let notices = 0;
  const stop = subscribeChatLog(() => { notices += 1; });
  for (let index = 0; index < CHAT_LOG_MAX_ENTRIES + 3; index += 1) {
    appendChatLog({ kind: 'message', name: 'Ari', text: `line ${index}`, at: 0 });
  }
  assert.equal(notices, CHAT_LOG_MAX_ENTRIES + 3);
  const entries = chatLogEntries();
  assert.equal(entries.length, CHAT_LOG_MAX_ENTRIES);
  // The oldest fall off the top, not the newest off the bottom.
  assert.equal(entries[entries.length - 1]!.text, `line ${CHAT_LOG_MAX_ENTRIES + 2}`);
  assert.equal(entries[0]!.text, 'line 3');
  stop();
  appendChatLog({ kind: 'message', name: 'Ari', text: 'after', at: 0 });
  assert.equal(notices, CHAT_LOG_MAX_ENTRIES + 3);
});

test('a line reads as a message, a join or a leave', () => {
  assert.equal(chatLogText({ id: 1, kind: 'message', name: 'Ari', text: 'hello', at: 0 }), 'Ari: hello');
  assert.equal(chatLogText({ id: 2, kind: 'join', name: 'Bo', text: '', at: 0 }), 'Bo joined the village');
  assert.equal(chatLogText({ id: 3, kind: 'leave', name: 'Bo', text: '', at: 0 }), 'Bo left the village');
});

test('a line holds, then fades, then is gone', () => {
  const entry = { id: 1, kind: 'message' as const, name: 'Ari', text: 'hi', at: 1_000 };
  assert.equal(chatLogAlpha(entry, 1_000), 1);
  assert.equal(chatLogAlpha(entry, 1_000 + CHAT_LOG_HOLD_MS), 1);
  const fading = chatLogAlpha(entry, 1_000 + CHAT_LOG_HOLD_MS + CHAT_LOG_FADE_MS / 2);
  assert.ok(fading > 0 && fading < 1);
  assert.equal(chatLogAlpha(entry, 1_000 + CHAT_LOG_HOLD_MS + CHAT_LOG_FADE_MS), 0);
});

test('presence changes are the difference between two rosters', () => {
  const before = new Map([['s-1', 'Ari'], ['s-2', 'Bo']]);
  const after = new Map([['s-2', 'Bo'], ['s-3', 'Cy']]);
  assert.deepEqual(presenceChanges(before, after), { joined: ['Cy'], left: ['Ari'] });
  assert.deepEqual(presenceChanges(after, after), { joined: [], left: [] });
  // A rename keeps the session, so it is neither a join nor a leave.
  assert.deepEqual(
    presenceChanges(new Map([['s-1', 'Ari']]), new Map([['s-1', 'Arianne']])),
    { joined: [], left: [] },
  );
});

test('the first roster on a connection is a baseline, not a room full of arrivals', () => {
  clearChatLog();
  // Everyone already here was here before we were; announcing them would say
  // something false and bury the log doing it.
  noteChatLogPresence(roster('Ari', 'Bo'), 0);
  assert.deepEqual(chatLogEntries(), []);

  noteChatLogPresence(roster('Ari', 'Bo', 'Cy'), 10);
  assert.deepEqual(
    chatLogEntries().map((entry) => [entry.kind, entry.name]),
    [['join', 'Cy']],
  );

  noteChatLogPresence(roster('Cy'), 20);
  assert.deepEqual(
    chatLogEntries().slice(1).map((entry) => [entry.kind, entry.name]),
    [['leave', 'Ari'], ['leave', 'Bo']],
  );
});

test('a torn-down connection is not everybody walking out and back in again', () => {
  clearChatLog();
  noteChatLogPresence(roster('Ari', 'Bo'), 0);
  noteChatLogPresence(roster('Ari', 'Bo', 'Cy'), 10);
  assert.equal(chatLogEntries().length, 1);

  // What the bridge does when the socket goes (see clearRemote): it drops the
  // roster without announcing it, because nobody left the village. The first
  // snapshot after it comes back is a baseline again, so the same three people
  // are not greeted as new arrivals.
  resetChatLogPresence();
  noteChatLogPresence(roster('Ari', 'Bo', 'Cy'), 20);
  assert.equal(chatLogEntries().length, 1);

  // And once there is a baseline again, the log picks up where it left off.
  noteChatLogPresence(roster('Ari', 'Bo'), 30);
  assert.deepEqual(
    chatLogEntries().map((entry) => [entry.kind, entry.name]),
    [['join', 'Cy'], ['leave', 'Cy']],
  );
});

test('being the only one online, then not, is a join', () => {
  clearChatLog();
  noteChatLogPresence([], 0);
  noteChatLogPresence(roster('Ari'), 10);
  assert.deepEqual(
    chatLogEntries().map((entry) => [entry.kind, entry.name]),
    [['join', 'Ari']],
  );
});
