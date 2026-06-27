import type { Game } from '../game';
import type { Asteroid, Pickup, GravityWell, PickupType, Hunter } from '../entities/types';
import { drawStarfield } from './starfield';
import {
  PLAYER_RADIUS,
  HUNTER_RADIUS,
  WELL_CORE_RADIUS,
  WELL_BAIT_RADIUS,
  WELL_RADIUS,
  WHITE_HOLE_RADIUS,
  WHITE_HOLE_SWIRL_DIR,
  HUNTER_AVOID_DIST,
  HUNTER_LUNGE_PERIOD,
} from '../constants';
import { GATE_RADIUS } from '../entities/pickup';

// --- Pre-rendered glow sprites for pickups (shadowBlur is expensive live) ---

const SPRITE_SIZE = 64;

function makeSprite(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.translate(SPRITE_SIZE / 2, SPRITE_SIZE / 2);
  draw(ctx);
  return c;
}

let sprites: Record<PickupType, HTMLCanvasElement> | null = null;

function getSprites(): Record<PickupType, HTMLCanvasElement> {
  if (sprites) return sprites;
  sprites = {
    gem: makeSprite((ctx) => {
      ctx.shadowColor = '#41ffe0';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#41ffe0';
      ctx.fillStyle = 'rgba(65,255,224,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 11);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }),
    orb: makeSprite((ctx) => {
      ctx.shadowColor = '#ffd24a';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = '#ffd24a';
      ctx.fillStyle = 'rgba(255,210,74,0.3)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', 0, 1);
    }),
    shield: makeSprite((ctx) => {
      ctx.shadowColor = '#6699ff';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#6699ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.stroke();
    }),
    boost: makeSprite((ctx) => {
      ctx.shadowColor = '#b67aff';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#b67aff';
      ctx.fillStyle = 'rgba(182,122,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(3, -11);
      ctx.lineTo(-5, 1);
      ctx.lineTo(0, 1);
      ctx.lineTo(-3, 11);
      ctx.lineTo(5, -1);
      ctx.lineTo(0, -1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }),
  };
  return sprites;
}

// --- Scene ---

export function drawScene(
  ctx: CanvasRenderingContext2D,
  game: Game,
  w: number,
  h: number,
): void {
  drawStarfield(ctx, game.camera, w, h, game.time);

  ctx.save();
  game.camera.apply(ctx, w, h);

  drawBounds(ctx, game.time, game.mapW, game.mapH);
  for (const well of game.wells) drawWell(ctx, well, game.time, game.debugDraw);
  drawGate(ctx, game);
  for (const p of game.pickups) {
    if (!p.taken) drawPickup(ctx, p, game.time);
  }
  for (const a of game.asteroids) drawAsteroid(ctx, a);
  game.particles.draw(ctx);
  for (const hunter of game.hunters) drawHunter(ctx, game, hunter);
  drawPlayer(ctx, game);

  if (game.debugDraw) drawDebugWorld(ctx, game);

  ctx.restore();
}

function drawBounds(ctx: CanvasRenderingContext2D, time: number, mapW: number, mapH: number): void {
  ctx.save();
  ctx.strokeStyle = `rgba(120,80,255,${0.5 + 0.15 * Math.sin(time * 2)})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#7850ff';
  ctx.shadowBlur = 18;
  ctx.strokeRect(0, 0, mapW, mapH);
  ctx.restore();
}

function drawWell(ctx: CanvasRenderingContext2D, well: GravityWell, time: number, debug = false): void {
  const black = well.polarity === 1;
  ctx.save();
  ctx.translate(well.x, well.y);

  const grad = ctx.createRadialGradient(0, 0, 20, 0, 0, well.radius);
  if (black) {
    grad.addColorStop(0, 'rgba(150,60,255,0.22)');
    grad.addColorStop(1, 'rgba(150,60,255,0)');
  } else {
    grad.addColorStop(0, 'rgba(180,225,255,0.2)');
    grad.addColorStop(1, 'rgba(180,225,255,0)');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, well.radius, 0, Math.PI * 2);
  ctx.fill();

  // Swirl. Black holes get plain spiraling arcs; white holes are drawn as a
  // proper whirlpool — spiral arms coiling into the drain, rotating in the same
  // sense as the tangential vortex force so the spin (and thus the slingshot
  // throw direction) reads straight off the visual.
  if (black) {
    ctx.strokeStyle = 'rgba(200,130,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a0 = time * (0.6 + i * 0.25) + (i * Math.PI * 2) / 3;
      const r = 40 + i * 45;
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a0 + Math.PI * 1.2);
      ctx.stroke();
    }
  } else {
    const dir = WHITE_HOLE_SWIRL_DIR;
    const arms = 3;
    const winds = 1.3; // turns each arm makes from rim to center
    const rMax = well.radius * 0.62;
    const segs = 40;
    const rot = dir * time * 0.9; // overall spin
    for (let a = 0; a < arms; a++) {
      const base = (a / arms) * Math.PI * 2 + rot;
      let px = Math.cos(base) * rMax;
      let py = Math.sin(base) * rMax;
      for (let j = 1; j <= segs; j++) {
        const t = j / segs; // 0 at rim, 1 at the drain
        const r = rMax * (1 - t);
        const ang = base + dir * t * winds * Math.PI * 2;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        const fade = Math.sin(t * Math.PI); // dim at rim and center, bright mid
        ctx.strokeStyle = `rgba(205,238,255,${0.55 * fade})`;
        ctx.lineWidth = 0.8 + 2.4 * (1 - t); // tapers thin toward the drain
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
        px = x;
        py = y;
      }
    }
  }

  if (black && debug) {
    ctx.strokeStyle = 'rgba(200,130,255,0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, WELL_BAIT_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = `rgba(255,70,70,${0.55 + 0.2 * Math.sin(time * 4)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, WELL_CORE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = black ? 'rgba(230,180,255,0.9)' : 'rgba(255,255,255,0.95)';
  ctx.shadowColor = black ? '#c873ff' : '#bfe6ff';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(0, 0, 9 + 2 * Math.sin(time * 4), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, game: Game): void {
  const gate = game.gate;
  const time = game.time;
  ctx.save();
  ctx.translate(gate.x, gate.y);
  const pulse = gate.active ? 1 + 0.08 * Math.sin(time * 5) : 1;
  ctx.scale(pulse, pulse);

  if (gate.active) {
    ctx.strokeStyle = '#5dff8a';
    ctx.fillStyle = 'rgba(93,255,138,0.12)';
    ctx.shadowColor = '#5dff8a';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 3.5;
  } else {
    ctx.strokeStyle = 'rgba(140,150,160,0.45)';
    ctx.fillStyle = 'rgba(140,150,160,0.05)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
  }
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + time * (gate.active ? 0.5 : 0.1);
    const x = Math.cos(a) * GATE_RADIUS;
    const y = Math.sin(a) * GATE_RADIUS;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 0;
  ctx.fillStyle = gate.active ? '#5dff8a' : 'rgba(140,150,160,0.6)';
  ctx.fillText(gate.active ? 'EXIT' : 'LOCKED', 0, 0);
  ctx.restore();

  // Hint when flying near the locked gate: explain what unlocks it
  if (!gate.active && game.player.alive) {
    const pp = game.player.body.translation();
    const dist = Math.hypot(pp.x - gate.x, pp.y - gate.y);
    if (dist < 420) {
      const fade = Math.min(1, (420 - dist) / 120);
      const left = game.gemCount - game.gemsCollected;
      ctx.save();
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(140,220,170,${0.85 * fade})`;
      ctx.fillText(
        left === game.gemCount
          ? `EXIT GATE — COLLECT ALL ${game.gemCount} GEMS TO UNLOCK`
          : `EXIT GATE — ${left} GEM${left === 1 ? '' : 'S'} REMAINING`,
        gate.x,
        gate.y - GATE_RADIUS - 28,
      );
      ctx.restore();
    }
  }
}

function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, time: number): void {
  const bob = Math.sin(time * 2.2 + p.phase) * 3;
  // Bonus gems are bigger and pulse harder so the extra value reads at a glance
  const base = p.bonus ? 1.5 : 1;
  const s = base * (1 + (p.bonus ? 0.12 : 0.07) * Math.sin(time * 3 + p.phase));
  const sprite = getSprites()[p.type];
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  if (p.bonus) {
    ctx.strokeStyle = `rgba(65,255,224,${0.35 + 0.25 * Math.sin(time * 3 + p.phase)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 19 * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.scale(s, s);
  ctx.drawImage(sprite, -SPRITE_SIZE / 2, -SPRITE_SIZE / 2);
  ctx.restore();
}

function drawAsteroid(ctx: CanvasRenderingContext2D, a: Asteroid): void {
  const pos = a.body.translation();
  const rot = a.body.rotation();
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(rot);
  ctx.beginPath();
  const v = a.verts;
  ctx.moveTo(v[0], v[1]);
  for (let i = 1; i < v.length / 2; i++) ctx.lineTo(v[i * 2], v[i * 2 + 1]);
  ctx.closePath();
  ctx.fillStyle = '#1d222b';
  ctx.strokeStyle = '#5a6472';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: Game): void {
  const player = game.player;
  if (!player.alive) return;
  const pos = player.body.translation();
  const rot = player.body.rotation();
  ctx.save();
  ctx.translate(pos.x, pos.y);

  if (player.shield) {
    ctx.strokeStyle = `rgba(102,153,255,${0.55 + 0.25 * Math.sin(game.time * 6)})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#6699ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.rotate(rot);
  ctx.strokeStyle = '#9beaff';
  ctx.fillStyle = 'rgba(63,214,255,0.2)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#3fd6ff';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-12, 10);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-12, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHunter(ctx: CanvasRenderingContext2D, game: Game, hunter: Hunter): void {
  const pos = hunter.body.translation();
  // Swallowed by a black hole: the ship is gone. In the last second before it
  // returns, a faint portal forms at the spawn corner where it'll re-emerge.
  if (game.respawning(hunter)) {
    const left = hunter.respawnAt - game.playT;
    if (left < 1.2) {
      const t = 1 - left / 1.2;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.strokeStyle = `rgba(255,80,80,${0.6 * t})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, (1 - t) * 60 + HUNTER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }
  const vel = hunter.body.linvel();
  const speed = Math.hypot(vel.x, vel.y);
  const angle = speed > 5 ? Math.atan2(vel.y, vel.x) : game.time * 0.3;
  const warming =
    game.state === 'playing' && game.playT < game.difficulty.hunterWarmup;
  const stunned = game.playT < hunter.stunnedUntil;

  ctx.save();
  ctx.translate(pos.x, pos.y);

  // Lured: BHAS disabled — hunter is committed to the core.
  if (game.playT < hunter.lureCommitUntil) {
    const a = 0.5 + 0.4 * Math.sin(game.time * 10);
    ctx.strokeStyle = `rgba(200,130,255,${a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, HUNTER_RADIUS + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = `rgba(200,130,255,${a})`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('BHAS OFF', HUNTER_RADIUS + 12, 0);
  }

  if (hunter.telegraph > 0) {
    // Lunge telegraphed: orange expanding ring + label, distinct from the red stun ring
    const t = 1 - hunter.telegraph / 0.8;
    const a = 0.9 * (1 - t);
    ctx.strokeStyle = `rgba(255,140,0,${a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, HUNTER_RADIUS + 6 + t * 26, 0, Math.PI * 2);
    ctx.stroke();
    if (t < 0.6) {
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = `rgba(255,140,0,${a * 1.4})`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('CHARGING LUNGE', HUNTER_RADIUS + 12, 0);
    }
  }
  if (stunned) {
    const a = 0.5 + 0.35 * Math.sin(game.time * 12);
    ctx.strokeStyle = `rgba(255,60,180,${a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, HUNTER_RADIUS + 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = `rgba(255,60,180,${a})`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('HULL BREACH', HUNTER_RADIUS + 16, 0);
  }
  if (warming) {
    const a = 0.4 + 0.35 * Math.sin(game.time * 8);
    ctx.strokeStyle = `rgba(255,80,80,${a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, HUNTER_RADIUS + 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.rotate(angle);
  const dim = stunned || warming ? 0.45 : 1;
  ctx.globalAlpha = dim;
  ctx.strokeStyle = '#ff5050';
  ctx.fillStyle = 'rgba(255,40,40,0.25)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#ff3030';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(2, 10);
  ctx.lineTo(-14, 16);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-14, -16);
  ctx.lineTo(2, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pulsing core
  ctx.fillStyle = `rgba(255,120,120,${0.6 + 0.4 * Math.sin(game.time * 7)})`;
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Debug overlay (toggled with ` key) ---

function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  dash: number[] = [],
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: string,
): void {
  const ex = x + vx;
  const ey = y + vy;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  const a = Math.atan2(vy, vx);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - 8 * Math.cos(a - 0.4), ey - 8 * Math.sin(a - 0.4));
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - 8 * Math.cos(a + 0.4), ey - 8 * Math.sin(a + 0.4));
  ctx.stroke();
  ctx.restore();
}

function label(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color = 'rgba(255,255,255,0.8)',
): void {
  ctx.save();
  ctx.font = '11px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawDebugWorld(ctx: CanvasRenderingContext2D, game: Game): void {
  // Native Rapier collider shapes — the ground truth for every physics body
  const { vertices, colors } = game.physics.world.debugRender();
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i < vertices.length; i += 4) {
    const r = (colors[i * 2]     * 255) | 0;
    const g = (colors[i * 2 + 1] * 255) | 0;
    const b = (colors[i * 2 + 2] * 255) | 0;
    const a =  colors[i * 2 + 3];
    ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
    ctx.beginPath();
    ctx.moveTo(vertices[i],     vertices[i + 1]);
    ctx.lineTo(vertices[i + 2], vertices[i + 3]);
    ctx.stroke();
  }
  ctx.restore();

  // Velocity arrows
  for (const a of game.asteroids) {
    const pos = a.body.translation();
    const vel = a.body.linvel();
    const spd = Math.hypot(vel.x, vel.y);
    if (spd > 5) arrow(ctx, pos.x, pos.y, vel.x * 0.15, vel.y * 0.15, 'rgba(255,200,0,0.5)');
    label(ctx, pos.x, pos.y - a.radius - 8, `r=${a.radius | 0}`, 'rgba(255,200,0,0.6)');
  }

  if (game.player.alive) {
    const pp = game.player.body.translation();
    const pv = game.player.body.linvel();
    arrow(ctx, pp.x, pp.y, pv.x * 0.2, pv.y * 0.2, 'rgba(0,255,200,0.7)');
    label(ctx, pp.x, pp.y + PLAYER_RADIUS + 12, `v=${Math.hypot(pv.x, pv.y) | 0}`, 'rgba(0,255,200,0.8)');
  }

  for (const hunter of game.hunters) {
    if (game.respawning(hunter)) continue;
    const hp = hunter.body.translation();
    const hv = hunter.body.linvel();
    const spd = Math.hypot(hv.x, hv.y);
    if (spd > 5) {
      arrow(ctx, hp.x, hp.y, hv.x * 0.2, hv.y * 0.2, 'rgba(255,80,80,0.7)');
      const nx = hv.x / spd;
      const ny = hv.y / spd;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,80,80,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(hp.x, hp.y);
      ctx.lineTo(hp.x + nx * HUNTER_AVOID_DIST, hp.y + ny * HUNTER_AVOID_DIST);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    label(ctx, hp.x, hp.y + HUNTER_RADIUS + 12, `v=${spd | 0}`, 'rgba(255,80,80,0.8)');
    const lt = hunter.lungeTimer;
    label(ctx, hp.x, hp.y + HUNTER_RADIUS + 24, `lunge=${lt.toFixed(1)}/${HUNTER_LUNGE_PERIOD}`, 'rgba(255,80,80,0.6)');
  }

  // Gravity well gameplay rings (not physics bodies — no Rapier shape for these)
  for (const well of game.wells) {
    const black = well.polarity === 1;
    if (black) {
      ring(ctx, well.x, well.y, WELL_RADIUS, 'rgba(180,80,255,0.4)', [6, 6]);
      ring(ctx, well.x, well.y, WELL_BAIT_RADIUS, 'rgba(200,130,255,0.8)', [4, 4]);
      ring(ctx, well.x, well.y, WELL_CORE_RADIUS, 'rgba(255,40,40,0.9)');
      label(ctx, well.x, well.y - WELL_RADIUS - 10, 'BLACK HOLE', 'rgba(180,80,255,0.8)');
      label(ctx, well.x, well.y - WELL_BAIT_RADIUS - 10, `bait r=${WELL_BAIT_RADIUS}`, 'rgba(200,130,255,0.8)');
      label(ctx, well.x, well.y - WELL_CORE_RADIUS - 10, `core r=${WELL_CORE_RADIUS}`, 'rgba(255,40,40,0.8)');
    } else {
      ring(ctx, well.x, well.y, WHITE_HOLE_RADIUS, 'rgba(150,220,255,0.5)', [6, 6]);
      label(ctx, well.x, well.y - WHITE_HOLE_RADIUS - 10, 'WHITE HOLE', 'rgba(150,220,255,0.8)');
    }
  }

  // Screen-space HUD box (reset transform to draw in CSS pixels). Anchored to
  // the left edge, vertically centered — clear of the score (top-left) and the
  // hull/boost bars (bottom-left).
  ctx.save();
  const cam = game.camera;
  const boxH = 88;
  const x0 = 8;
  const y0 = Math.round(game.viewH / 2 - boxH / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x0, y0, 210, boxH);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#0ff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const pp2 = game.player.body.translation();
  const pv2 = game.player.body.linvel();
  ctx.fillText('DEBUG  (` to toggle)', x0 + 8, y0 + 6);
  ctx.fillStyle = 'rgba(200,200,200,0.9)';
  ctx.fillText(`pos  ${pp2.x | 0}, ${pp2.y | 0}`, x0 + 8, y0 + 22);
  ctx.fillText(`vel  ${Math.hypot(pv2.x, pv2.y) | 0} u/s`, x0 + 8, y0 + 38);
  ctx.fillText(`hull ${game.player.hull | 0}  boost ${game.player.boostFuel | 0}`, x0 + 8, y0 + 54);
  ctx.fillText(`cam  ${cam.x | 0}, ${cam.y | 0}`, x0 + 8, y0 + 70);
  ctx.restore();
}
