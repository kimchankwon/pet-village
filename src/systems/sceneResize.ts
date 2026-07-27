interface EventSource {
  on(event: string, handler: () => void): unknown;
  off(event: string, handler: () => void): unknown;
}

interface LifecycleEvents {
  once(event: string, handler: () => void): unknown;
}

/** Bind one stable resize callback and remove it for either scene lifecycle exit. */
export function bindSceneResize(scale: EventSource, events: LifecycleEvents, handler: () => void): void {
  let bound = true;
  const cleanup = () => {
    if (!bound) return;
    bound = false;
    scale.off('resize', handler);
  };
  scale.on('resize', handler);
  events.once('shutdown', cleanup);
  events.once('destroy', cleanup);
}
