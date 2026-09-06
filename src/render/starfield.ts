import { mulberry32, hash2 } from '../util/rng';
import type { Camera } from '../camera';

const TILE = 512;
const nebula = new Image();
nebula.src = new URL('../../public/assets/nebula-v2.png', import.meta.url).href;

interface Layer {
  density: number;
  maxSize: number;
  brightness: number;
}

const LAYERS: Layer[] = [
  { density: 14, maxSize: 1.2, brightness: 0.35 },
  { density: 9, maxSize: 1.7, brightness: 0.6 },
  { density: 5, maxSize: 2.4, brightness: 0.9 },
];

/**
 * Infinite starfield anchored to the same world coordinates as terrain. Star positions are derived from a hash of
 * the tile coordinates, so nothing is stored and the field repeats nowhere
 * visible.
 */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  time: number,
  mapW: number,
  mapH: number,
): void {
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, w, h);

  // Use the exact same transform as terrain, including camera shake.
  const offsetX = Math.round(w / 2 - cam.x + cam.shakeX);
  const offsetY = Math.round(h / 2 - cam.y + cam.shakeY);
  if (nebula.complete && nebula.naturalWidth) {
    const padding = Math.max(w, h, 1200);
    const scale = Math.max((mapW + padding * 2) / nebula.naturalWidth, (mapH + padding * 2) / nebula.naturalHeight);
    const nw = nebula.naturalWidth * scale, nh = nebula.naturalHeight * scale;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(nebula, (mapW - nw) / 2 + offsetX, (mapH - nh) / 2 + offsetY, nw, nh);
    ctx.globalAlpha = 1;
  }

  for (let li = 0; li < LAYERS.length; li++) {
    const layer = LAYERS[li];
    const ox = cam.x - cam.shakeX;
    const oy = cam.y - cam.shakeY;
    const x0 = Math.floor((ox - w / 2) / TILE);
    const x1 = Math.floor((ox + w / 2) / TILE);
    const y0 = Math.floor((oy - h / 2) / TILE);
    const y1 = Math.floor((oy + h / 2) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const rng = mulberry32(hash2(tx, ty, li + 7));
        for (let i = 0; i < layer.density; i++) {
          const sx = (tx + rng()) * TILE + offsetX;
          const sy = (ty + rng()) * TILE + offsetY;
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
