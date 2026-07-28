/**
 * The canvas line you type a village message into.
 *
 * T opens it, Enter sends, Escape gives up. It is drawn like the rest of the
 * game's UI (see HUD / Menu / Prompt) rather than as a DOM input, so it reads
 * keystrokes itself — `chat.ts` decides what each one means. While it is open the
 * scene's own input is held off through nav.blockUi(), which is the same latch
 * menus use, so WASD, E/Space, I, P and Escape all stay out of the way.
 */

import Phaser from 'phaser';
import {
  appendChatInput,
  backspaceChatInput,
  chatCaretVisible,
  chatComposerAction,
  chatComposerText,
  chatDraftToSend,
  CHAT_MAX_LENGTH,
} from './chat';
import { markAsUi } from './cameraZoom';
import { blockUi, unblockUi } from './nav';

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
  private draft = '';
  private opened = false;
  private caretOn = true;
  private disposed = false;

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
      .text(0, 0, `Enter send · Esc cancel · ${CHAT_MAX_LENGTH} max`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#8a8a9e',
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(COMPOSER_DEPTH)
      .setVisible(false);
    markAsUi(scene, this.line, this.hint);
    this.place();

    scene.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyDown, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.place, this);
  }

  isOpen() {
    return this.opened;
  }

  private place = () => {
    const camera = this.scene.cameras.main;
    this.line.setFixedSize(composerWidth(camera.width), 0);
    this.line.setPosition(camera.width / 2, camera.height - 22);
    this.hint.setPosition(camera.width / 2, this.line.y - this.line.height - 4);
  };

  private onKeyDown(event: KeyboardEvent) {
    if (this.disposed) return;
    if (!this.opened) {
      if (event.key.toLowerCase() !== OPEN_KEY) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!this.options.canOpen()) return;
      this.open();
      return;
    }
    const action = chatComposerAction(event);
    if (action === 'ignore') return;
    if (action === 'send') {
      this.send();
      return;
    }
    if (action === 'cancel') {
      this.close();
      return;
    }
    this.draft = action === 'backspace'
      ? backspaceChatInput(this.draft)
      : appendChatInput(this.draft, event.key);
    this.render();
  }

  private open() {
    this.opened = true;
    this.draft = '';
    blockUi();
    this.line.setVisible(true);
    this.hint.setVisible(true);
    this.render();
    this.place();
  }

  private send() {
    const text = chatDraftToSend(this.draft);
    if (text && !this.options.onSend(text)) return;
    this.close();
  }

  close() {
    if (!this.opened) return;
    this.opened = false;
    this.draft = '';
    this.line.setVisible(false);
    this.hint.setVisible(false);
    unblockUi();
    // Keys pressed while composing left their Phaser Key objects down; without
    // this the next frame reads them as a fresh press (a typed 'i' would open
    // the inventory the moment the composer closed).
    this.scene.input.keyboard?.resetKeys();
  }

  /** Blinks the caret; the scene calls this every frame. */
  update(nowMs: number) {
    if (!this.opened) return;
    const caretOn = chatCaretVisible(nowMs);
    if (caretOn === this.caretOn) return;
    this.caretOn = caretOn;
    this.render();
  }

  private render() {
    this.line
      .setText(chatComposerText(this.draft, this.caretOn))
      .setColor(this.draft.length === 0 ? '#8a8a9e' : '#ffffff');
    this.place();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.close();
    this.scene.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyDown, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.place, this);
    this.line.destroy();
    this.hint.destroy();
  }
}

function composerWidth(cameraWidth: number) {
  return Math.round(Math.max(240, Math.min(520, cameraWidth - 48)));
}
