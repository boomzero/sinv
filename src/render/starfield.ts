import { mulberry32, hash2 } from '../util/rng';
import type { Camera } from '../camera';

const TILE = 512;

interface Layer {
  parallax: number;
  density: number;
  maxSize: number;
  brightness: number;
}

const LAYERS: Layer[] = [
  { parallax: 0.2, density: 14, maxSize: 1.2, brightness: 0.35 },
  { parallax: 0.5, density: 9, maxSize: 1.7, brightness: 0.6 },
  { parallax: 0.8, density: 5, maxSize: 2.4, brightness: 0.9 },
];

/**
 * Infinite tiled parallax starfield. Star positions are derived from a hash of
 * the tile coordinates, so nothing is stored and the field repeats nowhere
 * visible.
 */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  time: number,
): void {
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, w, h);

  for (let li = 0; li < LAYERS.length; li++) {
    const layer = LAYERS[li];
    const ox = cam.x * layer.parallax;
    const oy = cam.y * layer.parallax;
    const x0 = Math.floor((ox - w / 2) / TILE);
    const x1 = Math.floor((ox + w / 2) / TILE);
    const y0 = Math.floor((oy - h / 2) / TILE);
    const y1 = Math.floor((oy + h / 2) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const rng = mulberry32(hash2(tx, ty, li + 7));
        for (let i = 0; i < layer.density; i++) {
          const sx = (tx + rng()) * TILE - ox + w / 2;
          const sy = (ty + rng()) * TILE - oy + h / 2;
          const size = 0.6 + rng() * layer.maxSize;
          const twinkle = rng() < 0.25;
          let a = layer.brightness * (0.5 + rng() * 0.5);
          if (twinkle) a *= 0.6 + 0.4 * Math.sin(time * (1 + rng() * 3) + rng() * 7);
          ctx.globalAlpha = a;
          ctx.fillStyle = '#cfd8ff';
          ctx.fillRect(sx, sy, size, size);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}
