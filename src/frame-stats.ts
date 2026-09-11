/** Measures animation-frame cadence from requestAnimationFrame timestamps. */
export class FrameStats {
  private last = 0;
  private elapsed = 0;
  private frames = 0;
  private slowest = 0;
  private started = false;

  reset(): void {
    this.started = false;
    this.elapsed = this.frames = this.slowest = 0;
  }

  sample(now: number): string | null {
    if (!this.started) {
      this.last = now;
      this.started = true;
      return null;
    }
    const ms = now - this.last;
    this.last = now;
    this.elapsed += ms;
    this.frames++;
    this.slowest = Math.max(this.slowest, ms);
    if (this.elapsed < 1000) return null;
    const text = `${Math.round(this.frames * 1000 / this.elapsed)} FPS · max ${this.slowest.toFixed(1)} ms`;
    this.elapsed = this.frames = this.slowest = 0;
    return text;
  }
}
