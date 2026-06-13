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
  /** Multiplier applied to all score gains. */
  scoreMultiplier: number;
  blurb: string;
}

export const DIFFICULTIES: Difficulty[] = [
  {
    name: 'EASY',
    hunterSpeedMult: 0.8,
    hunterWarmup: 8,
    asteroidCount: 24,
    gemCount: 16,
    scoreMultiplier: 0.7,
    blurb: 'slower hunter · long warm-up · fewer gems · sparse field · 0.7× score',
  },
  {
    name: 'NORMAL',
    hunterSpeedMult: 1,
    hunterWarmup: HUNTER_WARMUP,
    asteroidCount: ASTEROID_COUNT,
    gemCount: GEM_COUNT,
    scoreMultiplier: 1,
    blurb: 'the standard hunt · 1× score',
  },
  {
    name: 'HARD',
    hunterSpeedMult: 1.28,
    hunterWarmup: 3,
    asteroidCount: 46,
    gemCount: GEM_COUNT,
    scoreMultiplier: 1.5,
    blurb: 'fast hunter · short warm-up · dense field · 1.5× score',
  },
];

export const DEFAULT_DIFFICULTY = 1; // NORMAL

export function loadDifficultyIndex(): number {
  const raw = parseInt(localStorage.getItem('sinv-diff') ?? '', 10);
  return Number.isInteger(raw) && raw >= 0 && raw < DIFFICULTIES.length
    ? raw
    : DEFAULT_DIFFICULTY;
}

const HS_KEY = 'sinv-highscore';

export function loadHighScore(): number {
  return parseInt(localStorage.getItem(HS_KEY) ?? '0', 10) || 0;
}

export function saveHighScore(score: number): boolean {
  const prev = loadHighScore();
  if (score > prev) {
    localStorage.setItem(HS_KEY, String(score));
    return true;
  }
  return false;
}
