import { BARRIER_LABELS } from '../world/exit';
import { drawExitStructure } from './exit';
import type { Game } from '../game';
import { drawSymbol, OBJECT_INFO, type SymbolKind } from './symbols';
import { drawLandmark } from './landmarks';
import { materialVersion } from './materials';
import { hunterHeading } from '../entities/hunter';

// Keep chart artwork at its display resolution instead of downsampling multi-
// megapixel landmark textures every frame. Moving objects remain live below.
const mapArt = new WeakMap<Game['landmarks'][number], Map<number, { version: number; canvas: HTMLCanvasElement }>>();
function drawMapLandmark(ctx: CanvasRenderingContext2D, l: Game['landmarks'][number], zoom: number): void {
  let sizes = mapArt.get(l);
  if (!sizes) { sizes = new Map(); mapArt.set(l, sizes); }
  const scale = zoom * Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const extent = l.radius + 122;
  const size = Math.ceil(extent * 2 * scale);
  let art = sizes.get(size);
  if (!art || art.version !== materialVersion()) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const surface = canvas.getContext('2d')!;
    surface.scale(size / (extent * 2), size / (extent * 2));
    surface.translate(extent - l.x, extent - l.y);
    drawLandmark(surface, l, 0, false);
    art = { version: materialVersion(), canvas };
    // Bound memory across repeated window resizes.
    if (sizes.size >= 2) sizes.clear();
    sizes.set(size, art);
  }
  ctx.drawImage(art.canvas, l.x - extent, l.y - extent, extent * 2, extent * 2);
}

/** The chart and minimap share geometry, colors and object symbols. */
export function drawSectorMap(ctx: CanvasRenderingContext2D, game: Game, zoom: number, compact = false): void {
  const mw = game.mapW * zoom, mh = game.mapH * zoom;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.beginPath(); ctx.rect(0, 0, mw, mh); ctx.clip();
  ctx.fillStyle = '#071522';
  ctx.fillRect(0, 0, mw, mh);
  ctx.strokeStyle = '#19303e';
  ctx.lineWidth = 1;
  for (let x = 0; x <= game.mapW; x += (compact ? 1000 : 500)) { ctx.beginPath(); ctx.moveTo(x * zoom, 0); ctx.lineTo(x * zoom, mh); ctx.stroke(); }
  for (let y = 0; y <= game.mapH; y += (compact ? 1000 : 500)) { ctx.beginPath(); ctx.moveTo(0, y * zoom); ctx.lineTo(mw, y * zoom); ctx.stroke(); }
  ctx.strokeStyle = '#4d798c'; ctx.strokeRect(0, 0, mw, mh);
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.fillStyle = '#84909b88';
  for (const asteroid of game.asteroids) {
    ctx.fillStyle = asteroid.composition === 'ice' ? '#a1cee5aa' : '#84909b88';
    const p = asteroid.body.translation();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(asteroid.body.rotation());
    ctx.beginPath();
    for (let i = 0; i < asteroid.verts.length; i += 2) {
      if (i === 0) ctx.moveTo(asteroid.verts[i], asteroid.verts[i + 1]);
      else ctx.lineTo(asteroid.verts[i], asteroid.verts[i + 1]);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  for (const l of game.landmarks) drawMapLandmark(ctx, l, zoom);
  drawExitStructure(ctx, game, true);
  for (const well of game.wells) {
    ctx.fillStyle = well.polarity === 1 ? '#a866e733' : '#bef7ff33';
    ctx.strokeStyle = well.polarity === 1 ? '#ac76e5' : '#b6e6ef';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath(); ctx.arc(well.x, well.y, well.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawSymbol(ctx, well.polarity === 1 ? 'blackhole' : 'whitehole', well.x, well.y, well.polarity === 1 ? 70 : 25);
  }
  ctx.restore();
  for (const p of game.pickups) {
    if (p.taken) continue;
    const capsule = p.type === 'antimatter' || p.type === 'magnet';
    const radius = compact ? (capsule ? 3.5 : p.bonus ? 2.5 : 1.8) : (capsule ? 6 : p.bonus ? 5.5 : 4.5);
    drawSymbol(ctx, p.type, p.x * zoom, p.y * zoom, radius);
  }
  game.landmarks.forEach((l, i) => {
    const x = l.x * zoom, y = (l.y - l.radius) * zoom;
    const badge = compact ? 5 : 11;
    ctx.fillStyle = '#09131d'; ctx.fillRect(x - badge, y - badge, badge * 2, badge * 2);
    ctx.strokeStyle = l.color; ctx.strokeRect(x - badge, y - badge, badge * 2, badge * 2);
    ctx.fillStyle = l.color; ctx.font = compact ? 'bold 8px monospace' : 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x, y + (compact ? 3 : 4));
  });
  const pp = game.player.body.translation();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(pp.x * zoom, pp.y * zoom, compact ? 2.5 : 4, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left'; ctx.font = '10px monospace'; if (!compact) ctx.fillText('YOU', pp.x * zoom + 9, pp.y * zoom + 4);
  ctx.fillStyle = '#76f0a6';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.save(); ctx.globalAlpha = 1;
  drawSymbol(ctx, 'gate', game.gate.x * zoom, game.gate.y * zoom, compact ? 4 : 7); ctx.restore();
  ctx.textAlign = 'right'; if (!compact) ctx.fillText(`EXIT · ${BARRIER_LABELS[game.gate.blasts]}`, game.gate.x * zoom - 10, game.gate.y * zoom + 4);
  for (const hunter of game.hunters) {
    if (!hunter.body.isEnabled() || game.respawning(hunter)) continue;
    const p = hunter.body.translation();
    drawSymbol(ctx, 'hunter', p.x * zoom, p.y * zoom, compact ? 4 : 7, hunterHeading(hunter, game.time));
  }
  ctx.restore();
}

export function drawChart(ctx: CanvasRenderingContext2D, game: Game, w: number, h: number): void {
  const ui = Math.min(1, w / 960, h / 660);
  const sw = w / ui, sh = h / ui;
  ctx.save();
  ctx.scale(ui, ui);
  ctx.fillStyle = 'rgba(3,10,19,0.97)';
  ctx.fillRect(0, 0, sw, sh);
  const left = 38, top = 126, availableW = sw - 360, availableH = sh - (game.wells.length ? 340 : 300);
  const zoom = Math.min(availableW / game.mapW, availableH / game.mapH);
  const mh = game.mapH * zoom;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#75c9d6';
  ctx.font = '11px monospace';
  ctx.fillText(`NAVIGATION  /  SECTOR ${game.seed.toString(16).toUpperCase().padStart(8, '0')}`, left, 38);
  ctx.fillStyle = '#e5f0f3';
  ctx.font = 'bold 32px monospace';
  ctx.fillText('MAP & OBJECT GUIDE', left, 79);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#95aebc';
  ctx.fillText(`Gem power ${game.thrustGems}/${game.escapeGemTarget} · small +1 / big +3 · hold boost · antimatter ${game.antimatter} · charges ${game.gate.blasts}/5`, left, 105);

  ctx.save();
  ctx.translate(left, top);
  drawSectorMap(ctx, game, zoom);
  ctx.restore();

  const rx = sw - 284;
  game.landmarks.forEach((l, i) => {
    const y = top + i * 105;
    ctx.textAlign = 'left';
    ctx.fillStyle = l.color; ctx.font = 'bold 13px monospace'; ctx.fillText(`0${i + 1}  ${l.name}`, rx, y + 8);
    ctx.fillStyle = '#a7bac5'; ctx.font = '12px monospace'; ctx.fillText(l.condition, rx, y + 32);
    ctx.fillStyle = '#6f8d9e'; ctx.font = '11px monospace';
    // Wrap the tactical hint within its legend column.
    let line = '', row = 0;
    for (const word of l.hint.split(' ')) {
      if (ctx.measureText(`${line} ${word}`).width > 240) { ctx.fillText(line, rx, y + 56 + row++ * 17); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    ctx.fillText(line, rx, y + 56 + row * 17);

  });
  ctx.textAlign = 'left';
  ctx.fillStyle = '#95aebc'; ctx.font = '11px monospace';
  ctx.fillText('Gray pieces are solid. Gaps are open.', rx, top + 325);
  ctx.fillText('Rock resists. Ice slides and rebounds.', rx, top + 345);

  const kinds: SymbolKind[] = ['gem', 'antimatter', 'gate', 'boost', 'shield', 'orb', 'terrain', 'hunter', 'whitehole', 'magnet'];
  if (game.wells.some(w => w.polarity === 1)) kinds.push('blackhole');
  const legendTop = Math.max(top + mh + 33, top + 360);
  const column = (sw - 76) / 3;
  let legendY = legendTop;
  let rowHeight = 34;
  kinds.forEach((kind, i) => {
    if (i > 0 && i % 3 === 0) { legendY += rowHeight; rowHeight = 34; }
    const x = left + i % 3 * column, y = legendY;
    const info = OBJECT_INFO[kind];
    drawSymbol(ctx, kind, x + 10, y + 3, 9);
    ctx.textAlign = 'left'; ctx.fillStyle = info.color; ctx.font = 'bold 11px monospace';
    ctx.fillText(info.name, x + 28, y);
    ctx.fillStyle = '#a3b5bf'; ctx.font = '10px monospace';
    let line = '', row = 1;
    for (const word of info.meaning.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > column - 44) {
        ctx.fillText(line, x + 28, y + row++ * 14);
        line = word;
      } else line = next;
    }
    ctx.fillText(line, x + 28, y + row * 14);
    rowHeight = Math.max(rowHeight, row * 14 + 20);
  });
  ctx.fillStyle = '#9dd9df'; ctx.font = '12px monospace';
  ctx.fillText(game.state === 'menu' ? 'Close map to return to launch.  Enter also launches.' : 'FLIGHT PAUSED — close this map to resume.', left, sh - 20);
  ctx.restore();
}
