/**
 * The line you type a village message into.
 *
 * It is drawn on the canvas like the rest of the game's UI (see HUD / Menu /
 * Prompt), but the typing itself goes through a real `<input>` laid over the
 * drawn line, transparent and the same size. That is not a detail: a canvas
 * cannot ask a phone for its keyboard, so before this the Chat button opened a
 * line nobody on a touch device could put a single character into. A real field
 * also means an IME has somewhere to compose — Korean and Japanese were never
 * going to arrive one `keydown` at a time.
 *
 * The field is the one holding the text; the canvas line just draws whatever it
 * says. Enter sends, Escape gives up, and so does tapping anywhere else, which
 * is the gesture a phone reaches for when it wants out of a text box.
 *
 * While it is open the scene's own input is held off through nav.blockUi(), the
 * same latch menus use, so WASD, E/Space, I, P and Escape stay out of the way,
 * plus nav.blockPointerUi() so a click cannot open a menu that would answer to
 * the same Enter and Escape. Phaser's global key capture is handed back through
 * beginTextEntry() for as long as the field is open, or it would swallow half
 * the alphabet before the field ever saw it.
 */

import Phaser from 'phaser';
import {
  chatCaretVisible,
  chatComposerAction,
  chatComposerText,
  chatDraftToSend,
  clipChatDraft,
  composerBottomOffset,
  softKeyboardInset,
  CHAT_MAX_LENGTH,
} from './chat';
import { markAsUi } from './cameraZoom';
import { blockPointerUi, blockUi, unblockPointerUi, unblockUi } from './nav';
import { beginTextEntry, endTextEntry } from './textEntry';

/** Above toasts (1500) and the bottom buttons (1450), below menus (2000). */
const COMPOSER_DEPTH = 1600;
const OPEN_KEY = 't';

export type ChatComposerOptions = {
  /** False while a menu owns the keyboard, so T does not steal it. */
  canOpen: () => boolean;
  /**
   * Post a finished line. False means it was refused — the cooldown has not run
   * out — and the draft is kept so Enter can try again a moment later.
   */
  onSend: (text: string) => boolean;
};

export class ChatComposer {
  private readonly scene: Phaser.Scene;
  private readonly options: ChatComposerOptions;
  private readonly line: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  /** The field the browser types into, and the only copy of the draft. */
  private readonly field: HTMLInputElement;
  private opened = false;
  private caretOn = true;
  private disposed = false;
  /**
   * Set by a tap outside, acted on in the next frame rather than there and then.
   * Phaser queues pointer events and works through them at the top of a step,
   * after this listener has already run; closing here would unblock pointer UI
   * first, and the Chat button the tap landed on would take that as an
   * invitation to open us straight back up.
   */
  private closePending = false;
  /**
   * When the last close happened. Tapping the Chat button while a line is
   * already open is one gesture, and it means "put this away" — but the tap that
   * closes it is also a tap on the button that opens it, and the two are handled
   * in the same frame. Whichever order they land in, one close stays closed.
   */
  private closedAt = Number.NEGATIVE_INFINITY;

  constructor(scene: Phaser.Scene, options: ChatComposerOptions) {
    this.scene = scene;
    this.options = options;
    const camera = scene.cameras.main;
    this.line = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#141a30ee',
        padding: { x: 12, y: 8 },
        fixedWidth: composerWidth(camera.width),
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(COMPOSER_DEPTH)
      .setVisible(false);
    this.hint = scene.add
      .text(0, 0, `Enter send · Esc or tap away · ${CHAT_MAX_LENGTH} max`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#8a8a9e',
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(COMPOSER_DEPTH)
      .setVisible(false);
    markAsUi(scene, this.line, this.hint);
    this.field = createChatField();
    scene.game.canvas?.parentElement?.appendChild(this.field);
    this.place();

    this.field.addEventListener('input', this.onFieldInput);
    this.field.addEventListener('keydown', this.onFieldKeyDown);
    scene.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyDown, this);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.place, this);
    window.visualViewport?.addEventListener('resize', this.place);
    window.visualViewport?.addEventListener('scroll', this.place);
  }

  isOpen() {
    return this.opened;
  }

  /** What the field holds, clipped to something the village would accept. */
  private get draft() {
    return clipChatDraft(this.field.value);
  }

  /**
   * Put the drawn line and the invisible field on the same rectangle.
   *
   * The canvas is scaled to fit its host, so a game pixel is some other number
   * of CSS pixels; the field has to be measured in the latter. Keeping the two
   * aligned is what lets a tap on the line land in the field — and what gives an
   * IME's candidate list somewhere sensible to appear.
   */
  private place = () => {
    const camera = this.scene.cameras.main;
    const insetCss = softKeyboardInset(window.visualViewport, window.innerHeight);
    // displayScale is game units per CSS pixel — the canvas is scaled to fit.
    const bottom = composerBottomOffset(insetCss * (this.scene.scale.displayScale.y || 1), camera.height);
    this.line.setFixedSize(composerWidth(camera.width), 0);
    this.line.setPosition(camera.width / 2, camera.height - bottom);
    this.hint.setPosition(camera.width / 2, this.line.y - this.line.height - 4);
    this.placeField();
  };

  private placeField() {
    const canvas = this.scene.game.canvas;
    const host = this.field.offsetParent as HTMLElement | null;
    if (!canvas || !host) return;
    const canvasRect = canvas.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const scale = this.scene.scale.displayScale;
    const width = this.line.width / (scale.x || 1);
    const height = this.line.height / (scale.y || 1);
    const left = canvasRect.left - hostRect.left + (this.line.x - this.line.width / 2) / (scale.x || 1);
    const top = canvasRect.top - hostRect.top + (this.line.y - this.line.height) / (scale.y || 1);
    Object.assign(this.field.style, {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
      height: `${Math.round(height)}px`,
    });
  }

  private onKeyDown(event: KeyboardEvent) {
    if (this.disposed) return;
    // Open is the only thing read from here: once the field has focus it is the
    // one being typed into, and this listener would only see the same keys twice.
    if (this.opened) return;
    if (event.key.toLowerCase() !== OPEN_KEY) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!this.options.canOpen()) return;
    // Or the T that opened the line would be the first letter in it.
    event.preventDefault();
    this.open();
  }

  private onFieldInput = () => {
    if (!this.opened) return;
    // The field takes anything — a paste, a newline, more than the server will
    // carry. Write the clipped version back so what is typed and what is drawn
    // are never two different sentences.
    const clipped = this.draft;
    if (this.field.value !== clipped) this.field.value = clipped;
    this.render();
  };

  private onFieldKeyDown = (event: KeyboardEvent) => {
    if (!this.opened) return;
    const action = chatComposerAction(event);
    if (action === 'send') {
      event.preventDefault();
      this.send();
      return;
    }
    if (action === 'cancel') {
      event.preventDefault();
      this.close();
    }
  };

  /**
   * A tap somewhere else gives up on the message, the way it closes a text box
   * anywhere else.
   *
   * Listened for on the document rather than through Phaser, because half the
   * things worth tapping are not on the canvas: the shell's own menu bar sits
   * above it in the DOM and Phaser never hears those clicks at all. A tap on the
   * line is the exception — the field is sitting on it, and it is how a phone
   * gets its keyboard back after dismissing it mid-sentence.
   */
  private onDocumentPointerDown = (event: Event) => {
    if (!this.opened || this.disposed) return;
    if (event.target === this.field) return;
    this.closePending = true;
  };

  /**
   * Open it without the key — what the Chat button on the bottom bar taps. The
   * same guard applies: a menu that already owns the keyboard keeps it.
   */
  requestOpen() {
    if (this.disposed || this.opened || !this.options.canOpen()) return false;
    if (this.scene.time.now === this.closedAt) return false;
    this.open();
    return true;
  }

  private open() {
    this.opened = true;
    this.closePending = false;
    blockUi();
    // Clicks too: a menu opened mid-sentence would answer to Enter and Escape
    // alongside the composer, and a door would carry the draft to another scene.
    blockPointerUi();
    // Phaser calls preventDefault on every key the scenes bind, which is most of
    // the alphabet — the field would be typed into with half the letters missing.
    beginTextEntry();
    this.line.setVisible(true);
    this.hint.setVisible(true);
    this.field.value = '';
    this.field.style.display = 'block';
    this.render();
    this.place();
    // Same task as the tap or the keystroke that got us here, which is the only
    // way a phone will raise its keyboard for us.
    this.field.focus({ preventScroll: true });
  }

  private send() {
    const text = chatDraftToSend(this.draft);
    if (text && !this.options.onSend(text)) return;
    this.close();
  }

  close() {
    if (!this.opened) return;
    this.opened = false;
    this.closePending = false;
    this.closedAt = this.scene.time.now;
    this.field.value = '';
    this.field.blur();
    this.field.style.display = 'none';
    this.line.setVisible(false);
    this.hint.setVisible(false);
    endTextEntry();
    unblockPointerUi();
    unblockUi();
    // Keys pressed while composing left their Phaser Key objects down; without
    // this the next frame reads them as a fresh press (a typed 'i' would open
    // the inventory the moment the composer closed).
    this.scene.input.keyboard?.resetKeys();
  }

  /** Blinks the caret and acts on a tap-away; the scene calls this every frame. */
  update(nowMs: number) {
    if (this.closePending) {
      this.close();
      return;
    }
    if (!this.opened) return;
    const caretOn = chatCaretVisible(nowMs);
    if (caretOn === this.caretOn) return;
    this.caretOn = caretOn;
    this.render();
  }

  private render() {
    const draft = this.draft;
    this.line
      .setText(chatComposerText(draft, this.caretOn))
      .setColor(draft.length === 0 ? '#8a8a9e' : '#ffffff');
    this.place();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.close();
    this.field.removeEventListener('input', this.onFieldInput);
    this.field.removeEventListener('keydown', this.onFieldKeyDown);
    this.field.remove();
    this.scene.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyDown, this);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.place, this);
    window.visualViewport?.removeEventListener('resize', this.place);
    window.visualViewport?.removeEventListener('scroll', this.place);
    this.line.destroy();
    this.hint.destroy();
  }
}

/**
 * The field itself: real enough for a keyboard and an IME, invisible enough
 * that the drawn line is what you see. `font-size: 16px` is not cosmetic —
 * anything smaller and iOS zooms the whole page in the moment it gets focus.
 */
function createChatField(): HTMLInputElement {
  const field = document.createElement('input');
  field.type = 'text';
  field.autocomplete = 'off';
  field.setAttribute('autocorrect', 'off');
  field.setAttribute('autocapitalize', 'sentences');
  field.setAttribute('aria-label', 'Say something to the village');
  field.enterKeyHint = 'send';
  // A coarse ceiling in code units; `clipChatDraft` does the real cap by
  // character, so an emoji is one of them rather than two.
  field.maxLength = CHAT_MAX_LENGTH * 2;
  Object.assign(field.style, {
    position: 'absolute',
    display: 'none',
    margin: '0',
    padding: '0',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'transparent',
    caretColor: 'transparent',
    fontSize: '16px',
    zIndex: '5',
  });
  return field;
}

function composerWidth(cameraWidth: number) {
  return Math.round(Math.max(240, Math.min(520, cameraWidth - 48)));
}
