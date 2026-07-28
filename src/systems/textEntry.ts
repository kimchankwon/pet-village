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

export function registerKeyboardCapture(manager: KeyboardCaptureTarget | null) {
  target = manager;
  openFields = 0;
}

/** Nested modals are counted, so the inner one closing does not re-arm capture. */
export function beginTextEntry() {
  openFields += 1;
  if (target) target.preventDefault = false;
}

export function endTextEntry() {
  openFields = Math.max(0, openFields - 1);
  if (openFields === 0 && target) target.preventDefault = true;
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
