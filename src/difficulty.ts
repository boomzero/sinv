import { HUNTER_WARMUP, ASTEROID_COUNT, GEM_COUNT } from './constants';

export interface Difficulty {
  name: string;
  /** Scales the hunter's whole speed curve (base + escalation + cap). */
  hunterSpeedMult: number;
  /** Seconds of grace before the hunter begins the chase. */
  hunterWarmup: number;
  /** Number of asteroids littering the map. */
  asteroidCount: number;
  /** Gems needed to unlock the exit gate. */
  gemCount: number;
  blurb: string;
}

export const DIFFICULTIES: Difficulty[] = [
  {
    name: 'EASY',
    hunterSpeedMult: 0.8,
    hunterWarmup: 8,
    asteroidCount: 24,
    gemCount: 16,
    blurb: 'slower hunter · long warm-up · fewer gems · sparse field',
  },
  {
    name: 'NORMAL',
    hunterSpeedMult: 1,
    hunterWarmup: HUNTER_WARMUP,
    asteroidCount: ASTEROID_COUNT,
    gemCount: GEM_COUNT,
    blurb: 'the standard hunt',
  },
  {
    name: 'HARD',
    hunterSpeedMult: 1.28,
    hunterWarmup: 3,
    asteroidCount: 46,
    gemCount: GEM_COUNT,
    blurb: 'fast hunter · short warm-up · dense field',
  },
];

export const DEFAULT_DIFFICULTY = 1; // NORMAL

export function loadDifficultyIndex(): number {
  const raw = parseInt(localStorage.getItem('sinv-diff') ?? '', 10);
  return Number.isInteger(raw) && raw >= 0 && raw < DIFFICULTIES.length
    ? raw
    : DEFAULT_DIFFICULTY;
}
