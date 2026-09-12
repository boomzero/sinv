import type { PickupType } from '../entities/types';

export type SymbolKind = PickupType | 'hunter' | 'gate' | 'terrain' | 'blackhole' | 'whitehole';
export const OBJECT_INFO: Record<SymbolKind, { color: string; name: string; meaning: string }> = {
  gem: { color: '#41ffe0', name: 'GEM', meaning: 'Engine power: small +1, big +3' },
  magnet: { color: '#f48ed5', name: 'MAGNETISM', meaning: 'Attracts pickups for 12 seconds; big gems need a closer pass' },
  antimatter: { color: '#ffb875', name: 'ANTIMATTER', meaning: 'Blasts rock shards; 3 charges cut through' },
  boost: { color: '#b67aff', name: 'BOOST FUEL', meaning: 'Refills your boost tank' },
  shield: { color: '#6699ff', name: 'SHIELD', meaning: 'Hit triggers 1 second of invulnerability' },
  orb: { color: '#ffd24a', name: 'REPAIR + SCORE', meaning: 'Repairs hull; raises score multiplier' },
  hunter: { color: '#ff666b', name: 'HUNTER', meaning: 'Avoid it — contact can end the run' },
  gate: { color: '#76f0a6', name: 'EXIT', meaning: 'Breach the barrier; boost past repulsors' },
  terrain: { color: '#9cabb8', name: 'SOLID TERRAIN', meaning: 'Walls and rocks — fly through the gaps' },
  blackhole: { color: '#ca94ff', name: 'BLACK HOLE', meaning: 'Pulls you in — the dark core kills' },
  whitehole: { color: '#d4f4ff', name: 'WHITE HOLE', meaning: 'Repels ships; exit pair needs thrust' },
};

/**
 * One visual vocabulary for in-flight pickups, map markers and the legend.
 * `rotation` (radians) orients directional symbols such as the hunter dart,
 * whose nose points along +x when unrotated.
 */
export function drawSymbol(ctx: CanvasRenderingContext2D, kind: SymbolKind, x: number, y: number, radius: number, rotation = 0): void {
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  const { color } = OBJECT_INFO[kind];
  ctx.strokeStyle = color;
  ctx.fillStyle = `${color}30`;
  ctx.lineWidth = radius < 6 ? 1.3 : 2;
  ctx.beginPath();
  if (kind === 'gem') {
    ctx.moveTo(0, -radius); ctx.lineTo(radius * 0.72, 0); ctx.lineTo(0, radius); ctx.lineTo(-radius * 0.72, 0); ctx.closePath();
  } else if (kind === 'magnet') {
    ctx.moveTo(-radius, -radius); ctx.lineTo(-radius, radius * 0.2);
    ctx.arc(0, radius * 0.2, radius, Math.PI, 0, true);
    ctx.lineTo(radius, -radius); ctx.lineTo(radius * 0.4, -radius);
    ctx.lineTo(radius * 0.4, radius * 0.2); ctx.arc(0, radius * 0.2, radius * 0.4, 0, Math.PI);
    ctx.lineTo(-radius * 0.4, -radius); ctx.closePath();
  } else if (kind === 'antimatter') {
    // Long, capped cartridge: stays distinct from the round repair-orb cross
    // even at minimap scale. Use an opaque interior against bright terrain.
    ctx.fillStyle = '#352215';
    ctx.moveTo(-radius * 0.55, -radius * 0.72);
    ctx.lineTo(-radius * 0.3, -radius * 1.25); ctx.lineTo(radius * 0.3, -radius * 1.25);
    ctx.lineTo(radius * 0.55, -radius * 0.72); ctx.lineTo(radius * 0.55, radius * 0.72);
    ctx.lineTo(radius * 0.3, radius * 1.25); ctx.lineTo(-radius * 0.3, radius * 1.25);
    ctx.lineTo(-radius * 0.55, radius * 0.72); ctx.closePath();
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
  if (kind === 'antimatter') {
    ctx.fillStyle = '#ffd4a2';
    ctx.fillRect(-radius * 0.4, -radius * 0.88, radius * 0.8, radius * 0.3);
    ctx.fillRect(-radius * 0.4, radius * 0.58, radius * 0.8, radius * 0.3);
  } else if (kind === 'shield') {
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'orb') {
    ctx.beginPath();
    ctx.moveTo(-radius * 0.35, -radius * 0.35); ctx.lineTo(radius * 0.35, radius * 0.35);
    ctx.moveTo(radius * 0.35, -radius * 0.35); ctx.lineTo(-radius * 0.35, radius * 0.35); ctx.stroke();
  }
  ctx.restore();
}
