import test from 'node:test';
import assert from 'node:assert/strict';

import { bindSceneResize } from '../../src/systems/sceneResize.ts';

class Emitter {
  listeners = new Map();
  on(name, fn) { this.listeners.set(name, fn); }
  off(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
  once(name, fn) { this.listeners.set(name, fn); }
  emit(name) { this.listeners.get(name)?.(); }
}

test('bindSceneResize registers one stable handler and removes it on shutdown', () => {
  const scale = new Emitter();
  const events = new Emitter();
  const handler = () => {};
  bindSceneResize(scale, events, handler);
  assert.equal(scale.listeners.get('resize'), handler);
  events.emit('shutdown');
  assert.equal(scale.listeners.has('resize'), false);
});

test('bindSceneResize also removes its handler on destroy', () => {
  const scale = new Emitter();
  const events = new Emitter();
  const handler = () => {};
  bindSceneResize(scale, events, handler);
  events.emit('destroy');
  assert.equal(scale.listeners.has('resize'), false);
});
