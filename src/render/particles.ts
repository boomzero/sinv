interface Particle {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

const CAP = 600;

export class Particles {
  private items: Particle[] = [];
  private pool: Particle[] = [];
  private replacement = 0;

  emit(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
  ): void {
    // Reuse expired particles and overwrite in O(1) when a burst fills the pool.
    const full = this.items.length >= CAP;
    const p = full ? this.items[this.replacement] : this.pool.pop() ?? {} as Particle;
    p.x = p.previousX = x;
    p.y = p.previousY = y;
    p.vx = vx; p.vy = vy;
    p.life = p.maxLife = life;
    p.size = size; p.color = color;
    if (full) this.replacement = (this.replacement + 1) % CAP;
    else this.items.push(p);
  }

  burst(
    x: number,
    y: number,
    count: number,
    speed: number,
    life: number,
    size: number,
    color: string,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.emit(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        life * (0.5 + Math.random() * 0.5),
        size,
        color,
      );
    }
  }

  update(dt: number): void {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) {
        items[i] = items[items.length - 1];
        items.pop();
        this.pool.push(p);
        continue;
      }
      p.previousX = p.x;
      p.previousY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
    }
  }

  /** Draw in world space (camera transform must already be applied). */
  draw(ctx: CanvasRenderingContext2D, alpha = 1): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t * 0.9;
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + 0.6 * t);
      ctx.fillRect(p.previousX + (p.x - p.previousX) * alpha - s / 2,
        p.previousY + (p.y - p.previousY) * alpha - s / 2, s, s);
    }
    ctx.restore();
  }

  clear(): void {
    this.pool.push(...this.items);
    this.items.length = 0;
    this.replacement = 0;
  }
}
