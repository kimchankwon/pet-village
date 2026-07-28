export type SteeringInput = {
  left: boolean;
  right: boolean;
  pointerDown: boolean;
  pointerX: number;
  width: number;
};

export function steerAxisFrom(input: SteeringInput): -1 | 0 | 1 {
  if (input.left || input.right) {
    if (input.left === input.right) return 0;
    return input.left ? -1 : 1;
  }
  if (!input.pointerDown) return 0;
  return input.pointerX < input.width / 2 ? -1 : 1;
}

/**
 * How often the held steering is repeated. The server drops inputs that arrive
 * within 12ms of each other, which a 120Hz display can do on two consecutive
 * frames, and a dropped change leaves the server steering the wrong way until
 * the next message — so the heartbeat is what bounds that, not bandwidth.
 */
export const STEER_HEARTBEAT_MS = 250;

export function shouldSendSteer(previous: number, next: number, now: number, lastSentAt: number) {
  return previous !== next || now - lastSentAt >= STEER_HEARTBEAT_MS;
}
