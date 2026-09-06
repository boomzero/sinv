import type { Landmark, Structure } from '../world/generate';
import { materialVersion, paintMaterial } from './materials';

const cache = new WeakMap<Landmark, { version: number; canvas: HTMLCanvasElement }>();

function path(ctx: CanvasRenderingContext2D, s: Structure): void {
  ctx.moveTo(s.verts[0], s.verts[1]);
  for (let i = 2; i < s.verts.length; i += 2) ctx.lineTo(s.verts[i], s.verts[i + 1]);
  ctx.closePath();
}

/** Static high-detail surfaces are rasterized once, never rebuilt per frame. */
function surface(l: Landmark): HTMLCanvasElement {
  const textureVersion = materialVersion();
  const existing = cache.get(l);
  if (existing?.version === textureVersion) return existing.canvas;
  const canvas = document.createElement('canvas');
  const size = Math.ceil((l.radius + 30) * 2);
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  for (const material of ['metal', 'rock'] as const) {
    const solids = l.structures.filter(s => s.material === material);
    if (!solids.length) continue;
    // Shared collider edges are implementation details, not cracks in the art.
    const edges = new Map<string, { v: number[]; count: number }>();
    for (const s of solids) for (let i = 0; i < s.verts.length; i += 2) {
      const j = (i + 2) % s.verts.length;
      const v = [s.verts[i], s.verts[i + 1], s.verts[j], s.verts[j + 1]];
      const key = [`${v[0].toFixed(3)},${v[1].toFixed(3)}`, `${v[2].toFixed(3)},${v[3].toFixed(3)}`].sort().join('/');
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { v, count: 1 });
    }
    ctx.save();
    ctx.beginPath();
    for (const s of solids) path(ctx, s);
    ctx.fillStyle = material === 'metal' ? '#273947' : '#373a42';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 9;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.save(); ctx.clip();
    ctx.save();
    // Geometry is already rotated; rotate material coordinates with it.
    ctx.rotate(l.angle);
    const extent = size / 2;
    paintMaterial(ctx, material, extent);
    const light = ctx.createLinearGradient(-extent, -extent, extent, extent);
    light.addColorStop(0, 'rgba(160,190,210,0.08)');
    light.addColorStop(1, 'rgba(0,8,19,0.32)');
    ctx.fillStyle = light; ctx.fillRect(-extent, -extent, size, size);
    ctx.restore();
    // Inset rim adds depth without painting over open flight lanes.
    ctx.beginPath();
    for (const { v, count } of edges.values()) if (count === 1) {
      ctx.moveTo(v[0], v[1]); ctx.lineTo(v[2], v[3]);
    }
    ctx.strokeStyle = 'rgba(3,8,14,0.48)';
    ctx.lineWidth = material === 'metal' ? 7 : 10; ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = material === 'metal' ? '#9bb8c077' : '#aaa69666';
    ctx.lineWidth = 1.5; ctx.stroke();
    if (material === 'metal') {
      ctx.strokeStyle = l.color; ctx.lineWidth = 2;
      ctx.shadowColor = l.color; ctx.shadowBlur = 7;
      let index = 0;
      for (const { v, count } of edges.values()) {
        if (count !== 1 || index++ % 3 !== 0) continue;
        const [ax, ay, bx, by] = v;
        ctx.beginPath();
        ctx.moveTo(ax * 0.55 + bx * 0.45, ay * 0.55 + by * 0.45);
        ctx.lineTo(ax * 0.45 + bx * 0.55, ay * 0.45 + by * 0.55);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  cache.set(l, { version: textureVersion, canvas });
  return canvas;
}

export function drawLandmark(ctx: CanvasRenderingContext2D, l: Landmark, time: number, labels = true): void {
  ctx.save();
  ctx.translate(l.x, l.y);
  const glow = ctx.createRadialGradient(0, 0, 80, 0, 0, l.radius + 120);
  glow.addColorStop(0, `${l.color}0e`);
  glow.addColorStop(1, `${l.color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(-l.radius - 120, -l.radius - 120, (l.radius + 120) * 2, (l.radius + 120) * 2);
  if (l.structures.length) {
    const c = surface(l);
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
  }
  // Slow dust glints communicate scale, without looking like collectibles.
  ctx.fillStyle = l.color;
  for (let i = 0; i < 18; i++) {
    const a = i * 2.399 + time * 0.008;
    const r = l.radius * (0.7 + Math.sin(i * 37) * 0.14);
    ctx.globalAlpha = 0.12 + 0.12 * Math.sin(time * 0.7 + i);
    ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  if (labels) {
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    ctx.fillStyle = `${l.color}aa`;
    ctx.fillText(l.name, 0, -l.radius - 30);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#8d9faa';
    ctx.fillText(l.condition.toUpperCase(), 0, -l.radius - 12);
  }
  ctx.restore();
}
