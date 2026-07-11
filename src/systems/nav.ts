/** Bridge between Phaser scenes and the React shell for leaving the game. */

type LeaveHandler = () => void;

let leaveHandler: LeaveHandler | null = null;
let uiBlockDepth = 0;
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
  // Closing a menu with Escape must not also leave the game in the same frame.
  suppressLeaveUntil = performance.now() + 200;
}

export function isUiBlocked() {
  return uiBlockDepth > 0 || performance.now() < suppressLeaveUntil;
}

export function resetUiBlock() {
  uiBlockDepth = 0;
  suppressLeaveUntil = 0;
}
