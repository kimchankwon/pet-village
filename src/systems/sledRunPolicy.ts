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

export function shouldSendSteer(previous: number, next: number, now: number, lastSentAt: number) {
  return previous !== next || now - lastSentAt >= 1_000;
}
