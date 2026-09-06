import type { PickupType } from '../entities/types';

export type SymbolKind = PickupType | 'hunter' | 'gate' | 'terrain' | 'blackhole' | 'whitehole';
export const OBJECT_INFO: Record<SymbolKind, { color: string; name: string; meaning: string }> = {
  gem: { color: '#41ffe0', name: 'GEM', meaning: 'Collect these to unlock the exit' },
  boost: { color: '#b67aff', name: 'BOOST FUEL', meaning: 'Refills your boost tank' },
  shield: { color: '#6699ff', name: 'SHIELD', meaning: 'Protects you from one hunter hit' },
  orb: { color: '#ffd24a', name: 'REPAIR + SCORE', meaning: 'Repairs hull and increases score multiplier' },
  hunter: { color: '#ff666b', name: 'HUNTER', meaning: 'Avoid it — contact can end the run' },
  gate: { color: '#76f0a6', name: 'EXIT', meaning: 'Fly here after collecting enough gems' },
  terrain: { color: '#9cabb8', name: 'SOLID TERRAIN', meaning: 'Walls and rocks — fly through the gaps' },
  blackhole: { color: '#ca94ff', name: 'BLACK HOLE', meaning: 'Pulls you in — the dark core kills' },
  whitehole: { color: '#d4f4ff', name: 'WHITE HOLE', meaning: 'Pushes you away — use its edge for speed' },
};

/** One visual vocabulary for in-flight pickups, map markers and the legend. */
export function drawSymbol(ctx: CanvasRenderingContext2D, kind: SymbolKind, x: number, y: number, radius: number): void {
  ctx.save();
  ctx.translate(x, y);
  const { color } = OBJECT_INFO[kind];
  ctx.strokeStyle = color;
  ctx.fillStyle = `${color}30`;
  ctx.lineWidth = radius < 6 ? 1.3 : 2;
  ctx.beginPath();
  if (kind === 'gem') {
    ctx.moveTo(0, -radius); ctx.lineTo(radius * 0.72, 0); ctx.lineTo(0, radius); ctx.lineTo(-radius * 0.72, 0); ctx.closePath();
  } else if (kind === 'boost') {
    ctx.moveTo(radius * 0.3, -radius); ctx.lineTo(-radius * 0.6, radius * 0.1); ctx.lineTo(0, radius * 0.1);
    ctx.lineTo(-radius * 0.3, radius); ctx.lineTo(radius * 0.6, -radius * 0.1); ctx.lineTo(0, -radius * 0.1); ctx.closePath();
  } else if (kind === 'gate') {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
      else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    ctx.closePath();
  } else if (kind === 'hunter') {
    ctx.moveTo(radius, 0); ctx.lineTo(-radius * 0.7, radius * 0.75); ctx.lineTo(-radius * 0.3, 0); ctx.lineTo(-radius * 0.7, -radius * 0.75); ctx.closePath();
  } else if (kind === 'terrain') {
    ctx.rect(-radius, -radius * 0.65, radius * 2, radius * 1.3);
    ctx.fillStyle = '#394550';
  } else {
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    if (kind === 'blackhole') ctx.fillStyle = '#080411';
    if (kind === 'whitehole') ctx.fillStyle = '#d4f4ff';
  }
  ctx.fill(); ctx.stroke();
  if (kind === 'shield') {
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'orb') {
    ctx.beginPath();
    ctx.moveTo(-radius * 0.35, -radius * 0.35); ctx.lineTo(radius * 0.35, radius * 0.35);
    ctx.moveTo(radius * 0.35, -radius * 0.35); ctx.lineTo(-radius * 0.35, radius * 0.35); ctx.stroke();
  }
  ctx.restore();
}
