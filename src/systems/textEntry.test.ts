import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginTextEntry,
  endTextEntry,
  isTextEntryOpen,
  registerKeyboardCapture,
  textEntryKeyAction,
} from './textEntry';

test('opening a text field releases Phaser key capture and closing re-arms it', () => {
  const keyboard = { preventDefault: true };
  registerKeyboardCapture(keyboard);

  beginTextEntry();
  assert.equal(keyboard.preventDefault, false, 'the browser must receive WASD/Space while typing');
  assert.equal(isTextEntryOpen(), true);

  endTextEntry();
  assert.equal(keyboard.preventDefault, true);
  assert.equal(isTextEntryOpen(), false);
});

test('nested fields only re-arm capture once the last one closes', () => {
  const keyboard = { preventDefault: true };
  registerKeyboardCapture(keyboard);

  beginTextEntry();
  beginTextEntry();
  endTextEntry();
  assert.equal(keyboard.preventDefault, false, 'a field is still open');
  endTextEntry();
  assert.equal(keyboard.preventDefault, true);
  // Unbalanced closes must not go negative and strand the capture.
  endTextEntry();
  assert.equal(isTextEntryOpen(), false);
});

test('registering a new game resets the open-field count', () => {
  const first = { preventDefault: true };
  registerKeyboardCapture(first);
  beginTextEntry();
  const second = { preventDefault: true };
  registerKeyboardCapture(second);
  assert.equal(isTextEntryOpen(), false);
  beginTextEntry();
  endTextEntry();
  assert.equal(second.preventDefault, true);
});

test('Enter saves, Escape closes, and every other key is just typing', () => {
  assert.equal(textEntryKeyAction('Enter'), 'save');
  assert.equal(textEntryKeyAction('Escape'), 'close');
  for (const key of ['w', 'a', 's', 'd', ' ', 'e', 'i', 'p', 'ArrowLeft']) {
    assert.equal(textEntryKeyAction(key), 'type', key);
  }
});
