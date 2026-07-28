/**
 * The running list of what has been said, and who has come and gone.
 *
 * Bubbles float over heads and then they are gone, so a message you were not
 * looking at never happened. This is the other half: a few lines in the corner
 * that outlast the bubble, the way every game with a chat box has had since
 * Minecraft, and the only place a join or a leave gets announced at all.
 *
 * It lives at module scope rather than on a scene, because walking through a
 * door builds a whole new scene and the conversation did not stop. The Phaser
 * side (`chatLogView`) subscribes and draws; everything here is data.
 */

/** How a line reads: somebody talking, or the village noting a comings-and-goings. */
export type ChatLogKind = 'message' | 'join' | 'leave';

export type ChatLogEntry = {
  /** Monotonic, so a renderer can tell a redraw from a new line. */
  id: number;
  kind: ChatLogKind;
  /** Who it is about. Empty for a line that is nobody's in particular. */
  name: string;
  /** What was said — empty for a join or a leave, which read from `kind`. */
  text: string;
  /** Scene clock when it landed, for the fade. */
  at: number;
};

/** Lines kept. Enough to catch up on, few enough to stay out of the way. */
export const CHAT_LOG_MAX_ENTRIES = 8;
/** How long a line stays up on its own before fading, as Minecraft's does. */
export const CHAT_LOG_HOLD_MS = 12_000;
export const CHAT_LOG_FADE_MS = 800;

let entries: ChatLogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

export function chatLogEntries(): readonly ChatLogEntry[] {
  return entries;
}

export function subscribeChatLog(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function appendChatLog(entry: Omit<ChatLogEntry, 'id'>) {
  entries = [...entries, { ...entry, id: nextId++ }].slice(-CHAT_LOG_MAX_ENTRIES);
  listeners.forEach((listener) => listener());
}

/** How readable a line is at `now`: full, fading, or finished and hidden. */
export function chatLogAlpha(entry: ChatLogEntry, now: number): number {
  const age = now - entry.at;
  if (age <= CHAT_LOG_HOLD_MS) return 1;
  const fading = age - CHAT_LOG_HOLD_MS;
  return fading >= CHAT_LOG_FADE_MS ? 0 : 1 - fading / CHAT_LOG_FADE_MS;
}

/** The line as it reads on screen. */
export function chatLogText(entry: ChatLogEntry): string {
  if (entry.kind === 'join') return `${entry.name} joined the village`;
  if (entry.kind === 'leave') return `${entry.name} left the village`;
  return `${entry.name}: ${entry.text}`;
}

/**
 * Comings and goings between two rosters, by display name.
 *
 * Names come from the roster rather than the session id because that is what
 * the line has to read, and a leaver's name is only still known on the side
 * they are leaving from.
 */
export function presenceChanges(
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
): { joined: string[]; left: string[] } {
  const joined: string[] = [];
  const left: string[] = [];
  for (const [sessionId, name] of next) if (!previous.has(sessionId)) joined.push(name);
  for (const [sessionId, name] of previous) if (!next.has(sessionId)) left.push(name);
  return { joined, left };
}

/**
 * The roster the next snapshot is compared against. Null means there is nothing
 * to compare with yet — the connection is new, or it has just been torn down.
 */
let roster: ReadonlyMap<string, string> | null = null;

/**
 * Take a roster snapshot and announce what changed since the last one.
 *
 * The first snapshot on a connection only sets the baseline: everybody already
 * on the server was there before we arrived, and announcing the lot of them as
 * having just joined would say something false and bury the log doing it.
 */
export function noteChatLogPresence(rows: ReadonlyArray<{ sessionId: string; name: string }>, at: number) {
  const next = new Map(rows.map((row) => [row.sessionId, row.name]));
  const previous = roster;
  roster = next;
  if (!previous) return;
  const { joined, left } = presenceChanges(previous, next);
  for (const name of left) appendChatLog({ kind: 'leave', name, text: '', at });
  for (const name of joined) appendChatLog({ kind: 'join', name, text: '', at });
}

/**
 * Forget the roster, without announcing that everyone on it left.
 *
 * A dropped connection empties the snapshot in one go; the village did not.
 */
export function resetChatLogPresence() {
  roster = null;
}

/**
 * Test seam — the log is module state, so a test has to be able to empty it.
 * Ids keep counting: a view caches what it has drawn by id, and handing out a
 * number it has already seen would leave it showing a line that is gone.
 */
export function clearChatLog() {
  entries = [];
  roster = null;
  listeners.forEach((listener) => listener());
}
