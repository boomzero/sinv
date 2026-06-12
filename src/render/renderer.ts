import type { Game } from '../game';
import type { Asteroid, Pickup, Gate, GravityWell, PickupType } from '../entities/types';
import { drawStarfield } from './starfield';
import { MAP_W, MAP_H, HUNTER_WARMUP, PLAYER_RADIUS, HUNTER_RADIUS } from '../constants';
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

  drawBounds(ctx, game.time);
  for (const well of game.wells) drawWell(ctx, well, game.time);
  drawGate(ctx, game.gate, game.time);
  for (const p of game.pickups) {
    if (!p.taken) drawPickup(ctx, p, game.time);
  }
  for (const a of game.asteroids) drawAsteroid(ctx, a);
  game.particles.draw(ctx);
  drawHunter(ctx, game);
  drawPlayer(ctx, game);

  ctx.restore();
}

function drawBounds(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.strokeStyle = `rgba(120,80,255,${0.5 + 0.15 * Math.sin(time * 2)})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#7850ff';
  ctx.shadowBlur = 18;
  ctx.strokeRect(0, 0, MAP_W, MAP_H);
  ctx.restore();
}

function drawWell(ctx: CanvasRenderingContext2D, well: GravityWell, time: number): void {
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

  // Swirl arcs: black holes spiral inward, white holes spin the other way out
  ctx.strokeStyle = black ? 'rgba(200,130,255,0.5)' : 'rgba(210,240,255,0.55)';
  ctx.lineWidth = 2;
  const spin = black ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    const a0 = spin * time * (0.6 + i * 0.25) + (i * Math.PI * 2) / 3;
    const r = 40 + i * 45;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a0 + Math.PI * 1.2);
    ctx.stroke();
  }
  if (!black) {
    // Expanding shockwave rings sell the outward push
    const t = (time * 0.7) % 1;
    ctx.strokeStyle = `rgba(220,245,255,${0.4 * (1 - t)})`;
    ctx.beginPath();
    ctx.arc(0, 0, 30 + t * 150, 0, Math.PI * 2);
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

function drawGate(ctx: CanvasRenderingContext2D, gate: Gate, time: number): void {
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

function drawHunter(ctx: CanvasRenderingContext2D, game: Game): void {
  const hunter = game.hunter;
  const pos = hunter.body.translation();
  const vel = hunter.body.linvel();
  const speed = Math.hypot(vel.x, vel.y);
  const angle = speed > 5 ? Math.atan2(vel.y, vel.x) : game.time * 0.3;
  const warming = game.state === 'playing' && game.playT < HUNTER_WARMUP;
  const stunned = game.playT < hunter.stunnedUntil;

  ctx.save();
  ctx.translate(pos.x, pos.y);

  if (hunter.telegraph > 0) {
    // Lunge incoming: expanding red flash ring
    const t = 1 - hunter.telegraph / 0.8;
    ctx.strokeStyle = `rgba(255,60,60,${0.8 * (1 - t)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, HUNTER_RADIUS + 6 + t * 26, 0, Math.PI * 2);
    ctx.stroke();
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
