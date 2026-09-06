import { drawChart, drawSectorMap } from './chart';
import type { Game } from '../game';
import { HULL_MAX, BOOST_MAX } from '../constants';
import { DIFFICULTIES } from '../difficulty';

const FONT = 'monospace';

// Below this "design" resolution the whole HUD/overlay is scaled down so text
// keeps fitting the viewport instead of overflowing or overlapping — lets the
// game stay legible in an arbitrarily small window.
const REF_W = 900;
const REF_H = 620;

function uiScale(w: number, h: number): number {
  return Math.min(1, w / REF_W, h / REF_H);
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  game: Game,
  w: number,
  h: number,
): void {
  if (game.state === 'menu' || game.chartOpen) return;

  const scale = uiScale(w, h);
  const sw = w / scale;
  const sh = h / scale;

  ctx.save();
  ctx.scale(scale, scale);
  ctx.textBaseline = 'top';

  // Objective first; score is secondary to knowing how to escape.
  ctx.fillStyle = 'rgba(4,12,22,0.85)'; ctx.fillRect(10, 8, 240, 94);
  ctx.textAlign = 'left';
  ctx.fillStyle = game.gate.active ? '#76f0a6' : '#41ffe0';
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(game.gate.active ? 'REACH THE EXIT' : `GEMS ${game.gemsCollected} / ${game.gemCount}`, 20, 16);
  ctx.font = `12px ${FONT}`; ctx.fillStyle = '#a8bdc9';
  ctx.fillText(game.gate.active ? 'Follow the green exit arrow' : 'Scavenge asteroid clouds', 20, 44);
  if (!game.gate.active) ctx.fillText('and landmarks', 20, 60);
  ctx.font = `11px ${FONT}`; ctx.fillStyle = '#738e9e';
  ctx.fillText(`Score ${game.score}  ·  ×${game.player.mult}`, 20, 80, 220);

  if (game.discovery && game.playT - game.discoveredAt < 5) {
    const l = game.discovery, age = game.playT - game.discoveredAt;
    ctx.save();
    ctx.globalAlpha = Math.min(1, age * 3, 5 - age);
    ctx.fillStyle = 'rgba(4,14,24,0.9)';
    ctx.fillRect(sw / 2 - 225, sh - 135, 450, 70);
    ctx.fillStyle = l.color;
    ctx.fillRect(sw / 2 - 225, sh - 135, 2, 70);
    ctx.textAlign = 'center';
    ctx.font = `10px ${FONT}`;
    ctx.fillText(`REGION DISCOVERED  /  ${l.condition.toUpperCase()}`, sw / 2, sh - 123);
    ctx.font = `bold 21px ${FONT}`;
    ctx.fillText(l.name, sw / 2, sh - 101);
    ctx.restore();
  }

  // Hull / boost bars (bottom-left)
  drawBar(ctx, 16, sh - 52, 180, 10, game.player.hull / HULL_MAX, hullColor(game.player.hull / HULL_MAX), 'HULL');
  drawBar(ctx, 16, sh - 26, 180, 10, game.player.boostFuel / BOOST_MAX, '#3fd6ff', 'BOOST');

  // Cheat-mode badge: only shows while test mode is live, so it's obvious the
  // run is tainted (and that its score won't save).
  if (game.cheats) {
    ctx.textAlign = 'left';
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = `rgba(255,210,74,${0.65 + 0.35 * Math.sin(game.time * 6)})`;
    ctx.fillText('⚡ CHEATS — SCORE WON’T SAVE', 206, sh - 24);
  }

  drawMinimap(ctx, game, sw);
  drawHunterArrow(ctx, game, w, h, scale);
  if (game.gate.active) drawGateArrow(ctx, game, w, h, scale);

  // Status banners (top-center)
  ctx.textAlign = 'center';
  ctx.font = `bold 16px ${FONT}`;
  const banished = game.hunters.filter((hn) => game.respawning(hn));
  if (game.state === 'playing' && banished.length > 0) {
    const soonest = Math.min(...banished.map((hn) => hn.respawnAt));
    const left = Math.ceil(soonest - game.playT);
    const label =
      banished.length > 1 ? `${banished.length} HUNTERS LOST TO THE VOID` : 'HUNTER LOST TO THE VOID';
    ctx.fillStyle = `rgba(200,130,255,${0.7 + 0.3 * Math.sin(game.time * 5)})`;
    ctx.fillText(`${label} — NEXT RETURNS IN ${left}`, sw / 2, 16);
  } else if (
    game.state === 'playing' &&
    game.interceptAt >= 0 &&
    game.playT - game.interceptAt < 4
  ) {
    const age = game.playT - game.interceptAt;
    const a = age < 0.4 ? age / 0.4 : age > 3.2 ? (4 - age) / 0.8 : 1;
    ctx.fillStyle = `rgba(200,130,255,${0.85 * a})`;
    ctx.fillText('BHAS DISABLED — PILOT OVERRIDE', sw / 2, 16);
  } else if (
    game.state === 'playing' &&
    game.lungeUnlockedAt >= 0 &&
    game.playT - game.lungeUnlockedAt < 4
  ) {
    const age = game.playT - game.lungeUnlockedAt;
    const a = age < 0.4 ? age / 0.4 : age > 3.2 ? (4 - age) / 0.8 : 1;
    ctx.fillStyle = `rgba(255,140,0,${0.9 * a})`;
    ctx.fillText('WATCH OUT — HUNTER CAN NOW DASH', sw / 2, 16);
  } else if (game.state === 'playing' && game.playT < game.difficulty.hunterWarmup) {
    const left = Math.ceil(game.difficulty.hunterWarmup - game.playT);
    const noun = game.hunters.length > 1 ? 'HUNTERS' : 'HUNTER';
    ctx.fillStyle = `rgba(255,90,90,${0.6 + 0.4 * Math.sin(game.time * 6)})`;
    ctx.fillText(`${noun} ONLINE IN ${left}`, sw / 2, 16);
  } else if (game.gate.active && game.state === 'playing') {
    ctx.fillStyle = `rgba(93,255,138,${0.7 + 0.3 * Math.sin(game.time * 5)})`;
    ctx.fillText('EXIT GATE ONLINE — RUN!', sw / 2, 16);
  }

  // Close call flash — independent banner below the main status row
  if (game.state === 'playing' && game.lastCloseCallAt >= 0 && game.playT - game.lastCloseCallAt < 2) {
    const age = game.playT - game.lastCloseCallAt;
    const a = age < 0.15 ? age / 0.15 : age > 1.5 ? (2 - age) / 0.5 : 1;
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = `rgba(255,153,68,${0.9 * a})`;
    ctx.fillText(`CLOSE CALL  +${game.lastCloseCallBonus}`, sw / 2, 42);
  }

  ctx.restore();
}

function hullColor(t: number): string {
  if (t > 0.6) return '#5dff8a';
  if (t > 0.3) return '#ffd24a';
  return '#ff5050';
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  color: string,
  label: string,
): void {
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillStyle = 'rgba(232,244,255,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 12);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, t)), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawMinimap(ctx: CanvasRenderingContext2D, game: Game, w: number): void {
  const mw = 170;
  ctx.save();
  ctx.translate(w - mw - 16, 16);
  drawSectorMap(ctx, game, mw / game.mapW, true);
  ctx.restore();
}

function drawEdgeArrow(
  ctx: CanvasRenderingContext2D,
  game: Game,
  w: number,
  h: number,
  scale: number,
  tx: number,
  ty: number,
  color: string,
  pulseRate: number,
): void {
  // toScreen works in real (unscaled) canvas pixels, so convert its result
  // into the logical space the caller's ctx.scale(scale, scale) expects.
  const real = game.camera.toScreen(tx, ty, w, h);
  const x = real.x / scale;
  const y = real.y / scale;
  const sw = w / scale;
  const sh = h / scale;
  const margin = 36;
  if (x > margin && x < sw - margin && y > margin && y < sh - margin) return;

  const cx = Math.max(margin, Math.min(sw - margin, x));
  const cy = Math.max(margin, Math.min(sh - margin, y));
  const angle = Math.atan2(y - sh / 2, x - sw / 2);
  const alpha = 0.55 + 0.45 * Math.sin(game.time * pulseRate);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, 9);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, -9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHunterArrow(
  ctx: CanvasRenderingContext2D,
  game: Game,
  w: number,
  h: number,
  scale: number,
): void {
  if (game.state !== 'playing') return;
  const pp = game.player.body.translation();
  for (const hunter of game.hunters) {
    if (game.respawning(hunter)) continue;
    const hp = hunter.body.translation();
    const dist = Math.hypot(hp.x - pp.x, hp.y - pp.y);
    // Pulse faster as the hunter closes in
    const rate = 2 + 2500 / Math.max(dist, 120);
    drawEdgeArrow(ctx, game, w, h, scale, hp.x, hp.y, '#ff5050', rate);
  }
}

function drawGateArrow(
  ctx: CanvasRenderingContext2D,
  game: Game,
  w: number,
  h: number,
  scale: number,
): void {
  if (game.state !== 'playing') return;
  drawEdgeArrow(ctx, game, w, h, scale, game.gate.x, game.gate.y, '#5dff8a', 4);
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  game: Game,
  w: number,
  h: number,
): void {
  if (game.chartOpen) { drawChart(ctx, game, w, h); return; }
  if (game.state === 'playing') return;

  const scale = uiScale(w, h);
  const sw = w / scale;
  const sh = h / scale;

  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(3,3,12,0.62)';
  ctx.fillRect(0, 0, sw, sh);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (game.state === 'menu') {
    const cy = sh / 2;
    ctx.fillStyle = '#9beaff';
    ctx.font = `bold 64px ${FONT}`;
    ctx.shadowColor = '#3fd6ff';
    ctx.shadowBlur = 24;
    ctx.fillText('S I N V', sw / 2, cy - 168);
    ctx.shadowBlur = 0;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = 'rgba(232,244,255,0.8)';
    ctx.fillText('SPACE SCAVENGER / LUMINOUS RUINS', sw / 2, cy - 124);
    if (game.highScore > 0) {
      ctx.font = `14px ${FONT}`;
      ctx.fillStyle = 'rgba(255,210,74,0.7)';
      ctx.fillText(`BEST  ${game.highScore}`, sw / 2, cy - 100);
    }

    ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = '#e8f4ff';
    ctx.fillText(`Collect ${game.gemCount} gems. Then escape.`, sw / 2, cy - 65);
    ctx.font = `14px ${FONT}`; ctx.fillStyle = '#acbfcb';
    ctx.fillText('Fly into cyan diamonds to collect them. Avoid the red hunter.', sw / 2, cy - 34);
    ctx.fillText('Station walls and rocks are solid. Fly through their gaps.', sw / 2, cy - 9);
    ctx.fillStyle = '#d8e8f0'; ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(game.input.touchCapable ? 'Touch and hold to steer + fly     Second finger boosts' : game.mouseSteer ? 'Aim with mouse     Hold click to fly     SPACE  boost' : 'W  fly forward     A / D  turn     SPACE  boost', sw / 2, cy + 43);
    ctx.fillStyle = '#96acb9'; ctx.font = `13px ${FONT}`;
    ctx.fillText(game.input.touchCapable ? 'Use the Pause and Map buttons during flight' : `S  reverse   ·   P  pause   ·   M  mouse steering (${game.mouseSteer ? 'ON' : 'OFF'})`, sw / 2, cy + 73);
    ctx.fillStyle = '#8ed2df';
    ctx.fillText('Use “Map & legend” for the map and object meanings.', sw / 2, cy + 117);

    if (!game.input.touchCapable) {
      // Difficulty selector: [1] EASY  [2] NORMAL  [3] HARD  [4] EXTREME
      ctx.font = `bold 16px ${FONT}`;
      const labels = DIFFICULTIES.map((d, i) => `[${i + 1}] ${d.name}`);
      const gap = 44;
      const widths = labels.map((s) => ctx.measureText(s).width);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (labels.length - 1);
      let x = sw / 2 - total / 2;
      labels.forEach((label, i) => {
        const selected = i === game.difficultyIndex;
        ctx.textAlign = 'left';
        ctx.fillStyle = selected ? '#ffd24a' : 'rgba(232,244,255,0.4)';
        ctx.fillText(label, x, cy + 166);
        if (selected) {
          ctx.fillRect(x, cy + 178, widths[i], 2);
        }
        x += widths[i] + gap;
      });
      ctx.textAlign = 'center';
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = 'rgba(232,244,255,0.45)';
      ctx.fillText(game.difficulty.blurb, sw / 2, cy + 200);
    }

    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = `rgba(93,255,138,${0.6 + 0.4 * Math.sin(game.time * 4)})`;
  } else if (game.state === 'paused') {
    ctx.fillStyle = '#e8f4ff';
    ctx.font = `bold 44px ${FONT}`;
    ctx.shadowColor = '#3fd6ff';
    ctx.shadowBlur = 18;
    ctx.fillText('PAUSED', sw / 2, sh / 2 - 24);
    ctx.shadowBlur = 0;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = `rgba(232,244,255,${0.5 + 0.3 * Math.sin(game.time * 4)})`;
    ctx.fillText('P / ESC  resume', sw / 2, sh / 2 + 28);
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(232,244,255,0.55)';
    ctx.fillText('R  restart with a new map', sw / 2, sh / 2 + 56);
  } else if (game.state === 'gameover') {
    ctx.fillStyle = '#ff5050';
    ctx.font = `bold 44px ${FONT}`;
    ctx.shadowColor = '#ff3030';
    ctx.shadowBlur = 20;
    ctx.fillText(
      game.lossReason === 'caught' ? 'CAUGHT BY THE HUNTER' : 'SHIP DESTROYED',
      sw / 2,
      sh / 2 - 60,
    );
    ctx.shadowBlur = 0;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText(`FINAL SCORE  ${game.score}`, sw / 2, sh / 2);
    if (game.isNewHighScore) {
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillStyle = `rgba(255,210,74,${0.7 + 0.3 * Math.sin(game.time * 6)})`;
      ctx.fillText('NEW BEST!', sw / 2, sh / 2 + 22);
    } else {
      ctx.font = `14px ${FONT}`;
      ctx.fillStyle = 'rgba(255,210,74,0.5)';
      ctx.fillText(`best  ${game.highScore}`, sw / 2, sh / 2 + 22);
    }
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = 'rgba(232,244,255,0.7)';
    ctx.fillText(
      `gems ${game.gemsCollected}/${game.gemCount}   ·   survived ${Math.floor(game.playT)}s   ·   hull healed ${Math.round(game.player.healedTotal)}`,
      sw / 2,
      sh / 2 + 46,
    );
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(232,244,255,0.45)';
    ctx.fillText(`difficulty: ${game.difficulty.name}  (${game.difficulty.scoreMultiplier}× score)`, sw / 2, sh / 2 + 70);
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = `rgba(93,255,138,${0.6 + 0.4 * Math.sin(game.time * 4)})`;
    ctx.fillText('PRESS R TO RETRY', sw / 2, sh / 2 + 106);
  } else if (game.state === 'win') {
    const cy = sh / 2;
    ctx.fillStyle = '#5dff8a';
    ctx.font = `bold 48px ${FONT}`;
    ctx.shadowColor = '#5dff8a';
    ctx.shadowBlur = 24;
    ctx.fillText('ESCAPED!', sw / 2, cy - 168);
    ctx.shadowBlur = 0;

    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(232,244,255,0.6)';
    ctx.fillText(
      `escaped in ${Math.floor(game.playT)}s · ${Math.round(game.player.hull)}% hull · ${game.difficulty.name} ${game.difficulty.scoreMultiplier}× · healed ${Math.round(game.player.healedTotal)}`,
      sw / 2,
      cy - 128,
    );

    // Score breakdown — label left, value right inside a centered column
    const b = game.winBreakdown;
    if (b) {
      const colW = 300;
      const lx = sw / 2 - colW / 2;
      const rx = sw / 2 + colW / 2;
      let ry = cy - 96;
      const row = (label: string, value: number, dim = false) => {
        ctx.font = `15px ${FONT}`;
        ctx.fillStyle = dim ? 'rgba(232,244,255,0.55)' : 'rgba(232,244,255,0.85)';
        ctx.textAlign = 'left';
        ctx.fillText(label, lx, ry);
        ctx.textAlign = 'right';
        ctx.fillText(`+${value}`, rx, ry);
        ry += 26;
      };
      row('gems collected', b.gems);
      if (b.closeCalls > 0) row('close calls', b.closeCalls);
      row('escape bonus', b.escapeBonus);
      row('hull remaining', b.hullBonus);
      row('boost remaining', b.boostBonus);

      // Divider
      ctx.strokeStyle = 'rgba(232,244,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ry - 8);
      ctx.lineTo(rx, ry - 8);
      ctx.stroke();
      ry += 8;

      ctx.font = `bold 20px ${FONT}`;
      ctx.fillStyle = '#e8f4ff';
      ctx.textAlign = 'left';
      ctx.fillText('TOTAL', lx, ry);
      ctx.textAlign = 'right';
      ctx.fillText(`${b.total}`, rx, ry);
      ctx.textAlign = 'center';
      ry += 30;

      if (game.isNewHighScore) {
        ctx.font = `bold 15px ${FONT}`;
        ctx.fillStyle = `rgba(255,210,74,${0.7 + 0.3 * Math.sin(game.time * 6)})`;
        ctx.fillText('★ NEW BEST! ★', sw / 2, ry);
      } else {
        ctx.font = `14px ${FONT}`;
        ctx.fillStyle = 'rgba(255,210,74,0.5)';
        ctx.fillText(`best  ${game.highScore}`, sw / 2, ry);
      }
    }

    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = `rgba(93,255,138,${0.6 + 0.4 * Math.sin(game.time * 4)})`;
    ctx.fillText('PRESS R TO FLY AGAIN', sw / 2, cy + 130);
  }
  ctx.restore();
}
