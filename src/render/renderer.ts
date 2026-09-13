import { BARRIER_LABELS, MAX_BLASTS } from '../world/exit';
import type { Game } from '../game';
import type { Pickup, GravityWell, PickupType, Hunter } from '../entities/types';
import { drawAsteroid } from './asteroids';
import { drawSymbol, OBJECT_INFO } from './symbols';
import { drawLandmark } from './landmarks';
import { drawStarfield } from './starfield';
import { drawBounds } from './bounds';
import {
  MAGNET_RADIUS,
  MAGNET_BONUS_RADIUS,
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
import { drawExitStructure } from './exit';
import { GATE_RADIUS } from '../entities/pickup';
import { hunterHeading } from '../entities/hunter';
import { blackHoleTurbulence } from '../world/turbulence';
import { hash2 } from '../util/rng';

// --- Pre-rendered glow sprites for pickups (shadowBlur is expensive live) ---

const SPRITE_SIZE = 64;
// Bonus gems get scaled up to ~1.7x at draw time; rasterize at a higher
// internal resolution so that upscaling doesn't look chunky/aliased.
const SPRITE_SCALE = Math.min(4, Math.max(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) * 2));

function makeSprite(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPRITE_SIZE * SPRITE_SCALE;
  c.height = SPRITE_SIZE * SPRITE_SCALE;
  const ctx = c.getContext('2d')!;
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(SPRITE_SIZE / 2, SPRITE_SIZE / 2);
  draw(ctx);
  return c;
}

let sprites: Record<PickupType, HTMLCanvasElement> | null = null;

function getSprites(): Record<PickupType, HTMLCanvasElement> {
  if (sprites) return sprites;
  const make = (type: PickupType) => makeSprite(ctx => {
    ctx.shadowColor = OBJECT_INFO[type].color;
    ctx.shadowBlur = 14;
    drawSymbol(ctx, type, 0, 0, 11);
  });
  sprites = { magnet: make('magnet'), antimatter: make('antimatter'), gem: make('gem'), orb: make('orb'), shield: make('shield'), boost: make('boost') };
  return sprites;
}

// --- Scene ---

export function drawScene(
  ctx: CanvasRenderingContext2D,
  game: Game,
  w: number,
  h: number,
): void {
  drawStarfield(ctx, game.camera, w, h, game.time, game.mapW, game.mapH);

  ctx.save();
  game.camera.apply(ctx, w, h);

  const cx = game.camera.x - game.camera.shakeX, cy = game.camera.y - game.camera.shakeY;
  const visible = (x: number, y: number, radius: number): boolean =>
    Math.abs(x - cx) <= w / 2 + radius + 2 && Math.abs(y - cy) <= h / 2 + radius + 2;

  drawBounds(ctx, game.time, game.mapW, game.mapH, cx, cy, w, h);
  if (visible(game.gate.x - 460, game.gate.y, 850)) drawExitStructure(ctx, game);
  for (const well of game.wells) if (visible(well.x, well.y, well.radius + 30)) drawWell(ctx, well, game.time, game.debugDraw, game.seed, game.playT);
  for (const landmark of game.landmarks) {
    if (visible(landmark.x, landmark.y, landmark.radius + 150)) drawLandmark(ctx, landmark, game.time);
  }
  drawGate(ctx, game);
  for (const p of game.pickups) {
    if (!p.taken && visible(p.x, p.y, 64)) drawPickup(ctx, p, game.time);
  }
  for (const a of game.asteroids) {
    const pos = a.body.translation();
    if (visible(pos.x, pos.y, a.radius + 4)) drawAsteroid(ctx, a);
  }
  game.particles.draw(ctx);
  for (const hunter of game.hunters) if (hunter.body.isEnabled()) drawHunter(ctx, game, hunter);
  if (game.player.alive && game.magnetRemaining > 0) {
    const pos = game.player.body.translation();
    ctx.save(); ctx.translate(pos.x, pos.y);
    ctx.strokeStyle = '#f48ed544'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 12]);
    ctx.beginPath(); ctx.arc(0, 0, MAGNET_RADIUS, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#f48ed577';
    ctx.beginPath(); ctx.arc(0, 0, MAGNET_BONUS_RADIUS, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const t = (game.playT * 0.6 + i / 3) % 1;
      ctx.strokeStyle = `rgba(244,142,213,${0.2 * Math.sin(t * Math.PI)})`;
      ctx.beginPath(); ctx.arc(0, 0, MAGNET_RADIUS * (1 - t), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  drawPlayer(ctx, game);

  if (game.debugDraw) drawDebugWorld(ctx, game);

  ctx.restore();
}

function drawWell(ctx: CanvasRenderingContext2D, well: GravityWell, time: number, debug = false, seed = 0, fieldTime = time): void {
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

  // Black holes show inward flow across the entire field; white holes remain a
  // proper whirlpool — spiral arms coiling into the drain, rotating in the same
  // sense as the tangential vortex force so the spin (and thus the slingshot
  // throw direction) reads straight off the visual.
  if (well.exit) {
    // Expanding rings indicate outward pressure; these fields do not slingshot.
    for (let i = 0; i < 5; i++) {
      const phase = (time * 0.22 + i / 5) % 1;
      ctx.strokeStyle = `rgba(205,238,255,${0.45 * (1 - phase)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 20 + phase * (well.radius - 20), 0, Math.PI * 2); ctx.stroke();
    }
  } else if (black) {
    // Independent hashed channels avoid correlated angles collapsing into one
    // ribbon. Tiny dust grains drift inward; only short local trails are drawn.
    ctx.lineCap = 'round';
    const salt = hash2(Math.round(well.x), Math.round(well.y), seed);
    for (let i = 0; i < 120; i++) {
      const offset = hash2(i, 1, salt) / 0xffffffff;
      const speed = 0.10 + hash2(i, 2, salt) / 0xffffffff * 0.09;
      const phase = (time * speed + offset) % 1;
      const base = hash2(i, 3, salt) / 0xffffffff * Math.PI * 2;
      const r = WELL_CORE_RADIUS + (well.radius - WELL_CORE_RADIUS) * Math.pow(1 - phase, 1.5);
      const angle = base + 2.2 * phase * phase + time * 0.1;
      const force = blackHoleTurbulence(seed, well.x, well.y, fieldTime, r, well.radius, angle + Math.PI);
      const fade = Math.sin(phase * Math.PI);
      const alpha = fade * (0.22 + 0.38 * (force.radial - 1));
      const size = 0.5 + hash2(i, 4, salt) / 0xffffffff * 0.9;
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      const previous = Math.max(0, phase - speed * 0.045);
      const oldRadius = WELL_CORE_RADIUS + (well.radius - WELL_CORE_RADIUS) * Math.pow(1 - previous, 1.5);
      const oldAngle = base + 2.2 * previous * previous + (time - 0.045) * 0.1;
      ctx.strokeStyle = `rgba(198,149,230,${alpha * 0.5})`;
      ctx.lineWidth = size;
      ctx.beginPath(); ctx.moveTo(Math.cos(oldAngle) * oldRadius, Math.sin(oldAngle) * oldRadius);
      ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = `rgba(225,194,244,${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }
    // A diffuse inner glow, not a stack of concentric line segments.
    const heat = blackHoleTurbulence(seed, well.x, well.y, fieldTime, WELL_CORE_RADIUS + 20, well.radius, 0);
    const corona = ctx.createRadialGradient(0, 0, WELL_CORE_RADIUS, 0, 0, WELL_CORE_RADIUS + 65);
    corona.addColorStop(0, `rgba(224,163,255,${0.3 * heat.radial})`);
    corona.addColorStop(0.2, 'rgba(172,98,214,0.15)');
    corona.addColorStop(1, 'rgba(137,70,190,0)');
    ctx.fillStyle = corona;
    ctx.beginPath(); ctx.arc(0, 0, WELL_CORE_RADIUS + 65, 0, Math.PI * 2); ctx.fill();

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

  // The lethal area must be visible during normal play, not just debugging.
  if (black) {
    ctx.fillStyle = '#080510';
    ctx.strokeStyle = '#e685ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, WELL_CORE_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = black ? '#c873ff' : '#bfe6ff';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(0, 0, (well.exit ? 17 : 9) + 2 * Math.sin(time * 4), 0, Math.PI * 2);
  ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, game: Game): void {
  const gate = game.gate;
  ctx.save();
  ctx.translate(gate.x, gate.y);
  // The destination is always lit. The actual barrier, not color, blocks it.
  ctx.strokeStyle = '#76f0a6'; ctx.fillStyle = '#76f0a620';
  ctx.shadowColor = '#76f0a6'; ctx.shadowBlur = 18; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + game.time * 0.2;
    if (i === 0) ctx.moveTo(Math.cos(a) * GATE_RADIUS, Math.sin(a) * GATE_RADIUS);
    else ctx.lineTo(Math.cos(a) * GATE_RADIUS, Math.sin(a) * GATE_RADIUS);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#a8ffc3';
  ctx.fillText('EXIT', 0, 4); ctx.restore();

  const b = gate.layout.barrier, p = game.player.body.translation();
  if (Math.hypot(p.x - b.x, p.y - b.y) < 650) {
    ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffce99';
    ctx.fillText(BARRIER_LABELS[gate.blasts], b.x - 90, b.y - 240);
    ctx.font = '12px monospace'; ctx.fillStyle = '#c0d9e1';
    ctx.fillText(!gate.active ? `${3 - gate.blasts} more charge${gate.blasts === 2 ? '' : 's'} to cut through` : gate.blasts < MAX_BLASTS ? 'More charges clear the shoulders' : 'Hold boost against the white holes', b.x - 90, b.y - 219);
    const gemsLeft = Math.max(0, game.escapeGemTarget - game.thrustGems);
    ctx.fillStyle = gemsLeft > 0 ? '#ffd078' : '#5dff8a';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(gemsLeft > 0 ? `LOW THRUST · ${gemsLeft} MORE GEMS RECOMMENDED` : 'ENGINE READY · HOLD BOOST', b.x + 380, b.y - 240);
    ctx.font = '12px monospace'; ctx.fillStyle = '#c0d9e1';
    ctx.fillText(`White holes repel you · target ${game.escapeGemTarget} gem power + boost`, b.x + 380, b.y - 219);
    ctx.restore();
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
  ctx.drawImage(sprite, -SPRITE_SIZE / 2, -SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: Game): void {
  const player = game.player;
  if (!player.alive) return;
  const pos = player.body.translation();
  const rot = player.body.rotation();
  ctx.save();
  ctx.translate(pos.x, pos.y);

  if (player.shield || game.shieldRemaining > 0) {
    ctx.strokeStyle = `rgba(102,153,255,${0.55 + 0.25 * Math.sin(game.time * 6)})`;
    ctx.lineWidth = game.shieldRemaining > 0 ? 5 : 2.5;
    ctx.shadowColor = '#6699ff';
    if (game.shieldRemaining > 0) {
      ctx.fillStyle = `rgba(140,190,255,${0.12 + 0.08 * Math.sin(game.playT * 18)})`;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS + 12, 0, Math.PI * 2); ctx.fill();
    }
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
  const angle = hunterHeading(hunter, game.time);
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
    if (!hunter.body.isEnabled() || game.respawning(hunter)) continue;
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
