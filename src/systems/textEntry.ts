/**
 * Hands the keyboard back to the browser while a shell modal has a text field.
 *
 * Phaser's keyboard manager captures every key the scenes bind — W/A/S/D, Space,
 * I, P, the arrows — by calling preventDefault on the window. That happens no
 * matter what has focus, so typing a name into a React <input> in front of the
 * canvas dropped most of the characters. Modals with a text field wrap themselves
 * in beginTextEntry()/endTextEntry(); the scenes still gate their own actions on
 * nav.isUiBlocked(), so releasing the capture only affects the browser default.
 */

/** The slice of Phaser's KeyboardManager we touch (kept structural for tests). */
export type KeyboardCaptureTarget = { preventDefault: boolean };

let target: KeyboardCaptureTarget | null = null;
let openFields = 0;

/**
 * Push the current open-field count onto the manager.
 *
 * Phaser recomputes `preventDefault` inside addCapture/removeCapture, which run
 * whenever a scene calls addKey or createCursorKeys — so a scene starting behind
 * an open modal re-arms the capture and starts eating keystrokes again. Callers
 * re-assert through here instead of setting the flag once.
 */
export function syncKeyboardCapture() {
  if (target) target.preventDefault = openFields === 0;
}

/** Registers the live manager; passing null (teardown) forgets the state too. */
export function registerKeyboardCapture(manager: KeyboardCaptureTarget | null) {
  target = manager;
  if (!manager) {
    openFields = 0;
    return;
  }
  // A modal can outlive the canvas it was opened over (a remount keeps the React
  // tree), so hand the new manager the state the open fields already asked for.
  syncKeyboardCapture();
}

/** Nested modals are counted, so the inner one closing does not re-arm capture. */
export function beginTextEntry() {
  openFields += 1;
  syncKeyboardCapture();
}

export function endTextEntry() {
  openFields = Math.max(0, openFields - 1);
  syncKeyboardCapture();
}

export function isTextEntryOpen() {
  return openFields > 0;
}

export type TextEntryKeyAction = 'save' | 'close' | 'type';

/**
 * Enter commits the form, Escape hands the key to the modal's own handler, and
 * everything else is just typing — the game must not see any of it.
 */
export function textEntryKeyAction(key: string): TextEntryKeyAction {
  if (key === 'Enter') return 'save';
  if (key === 'Escape') return 'close';
  return 'type';
}
