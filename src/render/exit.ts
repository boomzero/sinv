import { paintMaterial } from './materials';
import type { Game } from '../game';
import type { Structure } from '../world/generate';

function polygon(ctx: CanvasRenderingContext2D, s: Structure): void {
  ctx.beginPath();
  for (let i = 0; i < s.verts.length; i += 2) {
    const x = s.x + s.verts[i], y = s.y + s.verts[i + 1];
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Draw exact physical outlines, including the widening gap, at any map scale. */
export function drawExitStructure(ctx: CanvasRenderingContext2D, game: Game, compact = false): void {
  ctx.save();
  ctx.lineWidth = compact ? 10 : 2;
  for (const wall of game.gate.layout.walls) {
    polygon(ctx, wall); ctx.fillStyle = '#233943'; ctx.fill();
    ctx.strokeStyle = '#7794a2'; ctx.stroke();
    if (!compact) {
      ctx.save(); ctx.clip();
      ctx.save(); ctx.translate(wall.x, wall.y); paintMaterial(ctx, 'metal', 650); ctx.restore();
      ctx.strokeStyle = '#7794a233'; ctx.lineWidth = 1;
      for (let x = wall.x - 650; x < wall.x + 650; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, wall.y - 45); ctx.lineTo(x + 45, wall.y + 45); ctx.stroke();
      }
      ctx.restore();
    }
  }
  for (const [i, chunk] of game.gate.chunks.entries()) {
    const age = chunk.destroyedAt < 0 ? -1 : game.playT - chunk.destroyedAt;
    if (age >= 1.5 || (compact && age >= 0)) continue;
    ctx.save();
    if (age >= 0) {
      ctx.globalAlpha = 1 - age / 1.5;
      ctx.translate(age * (70 + i % 7 * 19), age * (i % 2 ? -90 : 90));
    }
    polygon(ctx, chunk.shape); ctx.fillStyle = '#514940'; ctx.fill();
    ctx.save(); ctx.clip();
    if (!compact) {
      const xs = chunk.shape.verts.filter((_, index) => index % 2 === 0);
      const ys = chunk.shape.verts.filter((_, index) => index % 2 === 1);
      const x = chunk.shape.x + (Math.min(...xs) + Math.max(...xs)) / 2;
      const y = chunk.shape.y + (Math.min(...ys) + Math.max(...ys)) / 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(i * 2.4);
      paintMaterial(ctx, 'rock', 90); ctx.restore();
      const shade = ctx.createLinearGradient(x - 20, y - 16, x + 22, y + 18);
      shade.addColorStop(0, i % 3 === 0 ? '#ead2aa88' : '#ddc6a344'); shade.addColorStop(1, '#080b1488');
      ctx.fillStyle = shade; ctx.fill();
      ctx.strokeStyle = '#171d25aa'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();
    polygon(ctx, chunk.shape); ctx.strokeStyle = '#302c29bb'; ctx.lineWidth = compact ? 5 : 1; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
