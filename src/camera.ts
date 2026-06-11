export class Camera {
  x = 0;
  y = 0;
  shake = 0;
  shakeX = 0;
  shakeY = 0;

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.shake = 0;
  }

  follow(
    tx: number,
    ty: number,
    vx: number,
    vy: number,
    dt: number,
  ): void {
    // Look ahead along the velocity so fast travel reveals what's coming.
    const lookX = tx + vx * 0.35;
    const lookY = ty + vy * 0.35;
    const k = 1 - Math.exp(-5 * dt);
    this.x += (lookX - this.x) * k;
    this.y += (lookY - this.y) * k;

    this.shake = Math.max(0, this.shake - this.shake * 6 * dt - 2 * dt);
    this.shakeX = (Math.random() * 2 - 1) * this.shake;
    this.shakeY = (Math.random() * 2 - 1) * this.shake;
  }

  addShake(amount: number): void {
    this.shake = Math.min(28, this.shake + amount);
  }

  /** Apply the world->screen transform for a viewport of w x h CSS pixels. */
  apply(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.translate(
      Math.round(w / 2 - this.x + this.shakeX),
      Math.round(h / 2 - this.y + this.shakeY),
    );
  }

  toScreen(wx: number, wy: number, w: number, h: number): { x: number; y: number } {
    return { x: wx - this.x + w / 2, y: wy - this.y + h / 2 };
  }
}
