/** Bridge between Phaser scenes and the React shell for leaving the game. */

type LeaveHandler = () => void;

let leaveHandler: LeaveHandler | null = null;
let uiBlockDepth = 0;
let pointerUiBlockDepth = 0;
let suppressLeaveUntil = 0;

export function setLeaveHandler(handler: LeaveHandler | null) {
  leaveHandler = handler;
}

export function requestLeave() {
  if (performance.now() < suppressLeaveUntil) return;
  if (uiBlockDepth > 0) return;
  leaveHandler?.();
}

/**
 * Explicit leave (e.g. the escape menu's "Exit game" option). Skips the
 * suppress window that closing the menu itself just armed.
 */
export function forceLeave() {
  leaveHandler?.();
}

/** Menus / placement mode — Escape should close UI, not leave the game. */
export function blockUi() {
  uiBlockDepth += 1;
}

export function unblockUi() {
  uiBlockDepth = Math.max(0, uiBlockDepth - 1);
  // Closing a menu with Escape/Space must not also leave or interact
  // in the same frame (keys are shared with the scene).
  suppressLeaveUntil = performance.now() + 200;
}

export function isUiBlocked() {
  // Depth only — movement resumes immediately when the menu closes.
  return uiBlockDepth > 0;
}

/**
 * Also swallow taps and clicks — for the chat composer, which owns Enter and
 * Escape while it is open. A click that opened a menu or walked through a door
 * would leave both of them listening for the same keys.
 *
 * Separate from `blockUi()` because the two are not the same thing: the house's
 * furniture placement mode blocks UI keys while a click is exactly the gesture
 * it is waiting for.
 */
export function blockPointerUi() {
  pointerUiBlockDepth += 1;
}

export function unblockPointerUi() {
  pointerUiBlockDepth = Math.max(0, pointerUiBlockDepth - 1);
}

export function isPointerUiBlocked() {
  return pointerUiBlockDepth > 0;
}

/** True while a menu just closed — skip E/Space interact for a beat. */
export function isInteractSuppressed() {
  return performance.now() < suppressLeaveUntil;
}

export function resetUiBlock() {
  uiBlockDepth = 0;
  suppressLeaveUntil = 0;
}
