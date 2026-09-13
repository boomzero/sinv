import type { Asteroid } from '../entities/types';
import { materialVersion, paintMaterial } from './materials';

const cache = new WeakMap<Asteroid, { version: number; canvas: HTMLCanvasElement }>();

export function drawAsteroid(ctx: CanvasRenderingContext2D, a: Asteroid): void {
  const version = materialVersion();
  let cached = cache.get(a);
  if (!cached || cached.version !== version) {
    const icy = a.composition === 'ice';
    const canvas = document.createElement('canvas');
    const extent = Math.ceil(a.radius + 4);
    canvas.width = canvas.height = extent * 2;
    const surface = canvas.getContext('2d')!;
    surface.translate(extent, extent);
    const v = a.verts;
    surface.beginPath();
    surface.moveTo(v[0], v[1]);
    for (let i = 2; i < v.length; i += 2) surface.lineTo(v[i], v[i + 1]);
    surface.closePath();
    surface.save();
    surface.clip();
    // Different crops of the same material, locked to each rotating rock.
    const offset = Math.abs(v[0] * 13) % 220;
    surface.save();
    surface.translate(offset, -offset);
    // Keep several ice fractures visible even on the smallest comet.
    const materialScale = icy ? a.radius * 2 / 160 : 1;
    surface.scale(materialScale, materialScale);
    paintMaterial(surface, icy ? 'ice' : 'rock', (extent + offset) / materialScale);
    surface.restore();
    const shade = surface.createLinearGradient(-a.radius, -a.radius, a.radius, a.radius);
    shade.addColorStop(0, icy ? 'rgba(183,215,229,0.18)' : 'rgba(210,203,186,0.22)');
    shade.addColorStop(0.5, 'rgba(0,0,0,0)');
    shade.addColorStop(1, icy ? 'rgba(3,16,28,0.22)' : 'rgba(3,6,12,0.7)');
    surface.fillStyle = shade;
    surface.fillRect(-extent, -extent, extent * 2, extent * 2);
    surface.strokeStyle = icy ? 'rgba(25,66,85,0.3)' : 'rgba(10,13,18,0.55)';
    surface.lineWidth = icy ? 1.5 : 7;
    surface.stroke();
    surface.restore();
    surface.strokeStyle = icy ? '#a3c1d188' : '#827f7788';
    surface.lineWidth = 1.5;
    surface.stroke();
    cached = { version, canvas };
    cache.set(a, cached);
  }
  const pos = a.body.translation();
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(a.body.rotation());
  ctx.drawImage(cached.canvas, -cached.canvas.width / 2, -cached.canvas.height / 2);
  ctx.restore();
}
