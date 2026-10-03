/** Exponential backoff with full jitter on the upper half: 1, 2, 4 … max seconds. */
export class Backoff {
  private attempt = 0;

  constructor(
    private readonly baseMs = 1000,
    private readonly maxMs = 60_000,
    private readonly random: () => number = Math.random,
  ) {}

  next(): number {
    const ceiling = Math.min(this.maxMs, this.baseMs * 2 ** this.attempt);
    if (ceiling < this.maxMs) this.attempt++;
    return Math.round(ceiling / 2 + (this.random() * ceiling) / 2);
  }

  reset(): void {
    this.attempt = 0;
  }
}
