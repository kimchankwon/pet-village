/**
 * Timing for Sled Run reconciliation.
 *
 * The server starts integrating our steering the moment it receives it, so its
 * snapshot of our sled is always one round trip behind the key we are holding.
 * Correcting toward that snapshot as if it described *now* is what makes steering
 * feel like a tug of war: it drags the sled short while a key is held and shoves
 * it onward after the key is released.
 *
 * These two pieces let the scene compare like with like instead — a round-trip
 * estimate taken from the input sequence numbers the server echoes back, and a
 * short trace of the lanes we predicted, so a snapshot can be checked against
 * where we thought we were when that snapshot was made.
 */

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Assumed round trip until the first echo comes back. */
export const SLED_DEFAULT_RTT_MS = 90;
export const SLED_MAX_RTT_MS = 400;
/** How fast a slower round trip is believed; a faster one is believed at once. */
export const SLED_RTT_RISE_GAIN = 0.1;

/**
 * Round-trip estimate built from `inputSeq`, which the server already mirrors
 * back in racer state, so this costs no extra messages.
 */
export class SteerAckClock {
  private readonly sentAt = new Map<number, number>();
  private rtt = SLED_DEFAULT_RTT_MS;
  private samples = 0;

  /** Remember when an input went out, so its echo can be timed. */
  sent(seq: number, at: number) {
    if (Number.isFinite(seq) && seq > 0) this.sentAt.set(seq, at);
  }

  /**
   * Fold in the newest sequence the server has acknowledged. Returns whether it
   * produced a sample — anything we never sent (a fresh race resets `inputSeq`)
   * only clears the backlog.
   */
  acked(seq: number, at: number): boolean {
    const outAt = this.sentAt.get(seq);
    for (const pending of [...this.sentAt.keys()]) {
      if (pending <= seq) this.sentAt.delete(pending);
    }
    if (outAt === undefined) return false;
    const sample = clamp(at - outAt, 0, SLED_MAX_RTT_MS);
    // Every sample is inflated by up to a server tick plus a patch interval, so
    // trust a fast one immediately and let a slow one pull the estimate up
    // gradually rather than reading one late patch as a worse connection.
    this.rtt = this.samples === 0 || sample < this.rtt
      ? sample
      : this.rtt + (sample - this.rtt) * SLED_RTT_RISE_GAIN;
    this.samples += 1;
    return true;
  }

  get roundTripMs() {
    return this.rtt;
  }

  /**
   * Whether the round trip has actually been measured. Until it has, a snapshot
   * cannot be placed in time, and guessing wrong would correct the sled for a
   * latency that was never there — so reconciliation waits for this.
   */
  get measured() {
    return this.samples > 0;
  }

  /** Drop un-echoed inputs at a race boundary, keeping the measured round trip. */
  clearPending() {
    this.sentAt.clear();
  }
}

/** A short history of the lanes we predicted, so a snapshot can be time-aligned. */
export class SteerTrace {
  private readonly samples: Array<{ at: number; x: number }> = [];

  constructor(private readonly windowMs = 1_000) {}

  record(at: number, x: number) {
    this.samples.push({ at, x });
    while (this.samples.length > 1 && at - this.samples[0]!.at > this.windowMs) this.samples.shift();
  }

  /**
   * Where we predicted the sled was at `at`, interpolated between frames. Reads
   * outside the trace clamp to its ends, and an empty trace has no answer.
   */
  sample(at: number): number | undefined {
    if (this.samples.length === 0) return undefined;
    const first = this.samples[0]!;
    if (at <= first.at) return first.x;
    const last = this.samples[this.samples.length - 1]!;
    if (at >= last.at) return last.x;
    for (let index = 1; index < this.samples.length; index += 1) {
      const after = this.samples[index]!;
      if (after.at < at) continue;
      const before = this.samples[index - 1]!;
      const span = after.at - before.at;
      return span <= 0 ? after.x : before.x + (after.x - before.x) * ((at - before.at) / span);
    }
    return last.x;
  }

  /**
   * Move the whole history by a correction that has just been applied. Without
   * this, every snapshot still in flight is compared against lanes recorded
   * before the correction, so the same disagreement is answered once per
   * snapshot for a full round trip — harmless when a fraction is eased in,
   * an oscillation when a wide error is absorbed in one go.
   */
  shift(delta: number) {
    if (delta === 0) return;
    for (const sample of this.samples) sample.x += delta;
  }

  clear() {
    this.samples.length = 0;
  }
}
