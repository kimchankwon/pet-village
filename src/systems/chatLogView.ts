/**
 * The chat log, drawn in the top-left corner.
 *
 * One line per entry, newest at the bottom, each fading out on its own once it
 * has been up long enough — so a busy minute reads as a conversation and a quiet
 * one leaves the screen clear. The corner is chosen by elimination: the HUD and
 * the joystick own the bottom left, the buttons the bottom right, the zoom
 * slider the right edge, and the composer the bottom middle.
 *
 * The entries live in `chatLog`, at module scope, because walking through a door
 * builds a new scene and the conversation did not stop. This only draws them.
 */

import Phaser from 'phaser';
import {
  CHAT_LOG_MAX_ENTRIES,
  chatLogAlpha,
  chatLogEntries,
  chatLogText,
  subscribeChatLog,
  type ChatLogEntry,
} from './chatLog';
import { markAsUi } from './cameraZoom';

/** Under the composer (1600) and menus, over the world and the bottom bar. */
const CHAT_LOG_DEPTH = 1550;
const LINE_HEIGHT = 16;
const PAD = 10;

const COLORS: Record<ChatLogEntry['kind'], string> = {
  message: '#ffffff',
  join: '#a7e0a0',
  leave: '#e6b3b3',
};

export class ChatLogView {
  private readonly scene: Phaser.Scene;
  private readonly lines: Phaser.GameObjects.Text[] = [];
  private readonly unsubscribe: () => void;
  private disposed = false;
  /** Entry id in each slot, so unchanged lines are not re-laid out every frame. */
  private readonly drawn: number[] = [];
  /** The width those lines were wrapped to, which a rotation changes. */
  private wrappedTo = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    for (let index = 0; index < CHAT_LOG_MAX_ENTRIES; index += 1) {
      const line = scene.add
        .text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffffff',
          backgroundColor: '#141a30cc',
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(CHAT_LOG_DEPTH)
        .setVisible(false);
      this.lines.push(line);
      this.drawn.push(-1);
    }
    markAsUi(scene, ...this.lines);
    // A line arriving has to redraw immediately; the fade can wait for a frame.
    this.unsubscribe = subscribeChatLog(() => this.render());
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
    this.render();
  }

  /** Repaints the fade; the scene calls this every frame. */
  update() {
    this.render();
  }

  private render = () => {
    if (this.disposed) return;
    const now = performance.now();
    const visible = chatLogEntries().filter((entry) => chatLogAlpha(entry, now) > 0);
    const camera = this.scene.cameras.main;
    const maxWidth = Math.round(Math.min(380, Math.max(180, camera.width - PAD * 2)));
    // Lines already on screen were wrapped to the old width, and skipping them
    // for being unchanged would leave a rotated phone showing the last screen's
    // line breaks until they faded out.
    if (maxWidth !== this.wrappedTo) {
      this.wrappedTo = maxWidth;
      this.drawn.fill(-1);
    }
    // Stacked by measured height rather than a fixed step: a long message wraps
    // onto a second row, and the line under it has to start below all of it.
    let y = PAD;
    for (const [index, line] of this.lines.entries()) {
      const entry = visible[index];
      if (!entry) {
        line.setVisible(false);
        this.drawn[index] = -1;
        continue;
      }
      if (this.drawn[index] !== entry.id) {
        this.drawn[index] = entry.id;
        line
          .setWordWrapWidth(maxWidth, true)
          .setText(chatLogText(entry))
          .setColor(COLORS[entry.kind])
          .setVisible(true);
      }
      line.setPosition(PAD, y);
      line.setAlpha(chatLogAlpha(entry, now));
      y += Math.max(LINE_HEIGHT, line.height) + 2;
    }
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.render, this);
    for (const line of this.lines) line.destroy();
  }
}
