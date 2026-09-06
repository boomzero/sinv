import { HUNTER_WARMUP, ASTEROID_COUNT, GEM_COUNT, MAP_W, MAP_H } from './constants';
import { readSaved, writeSaved } from './util/storage';

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
  /** How many hunters stalk the map. */
  hunterCount: number;
  mapW: number;
  mapH: number;
  blurb: string;
}

export const DIFFICULTIES: Difficulty[] = [
  {
    name: 'EASY',
    hunterSpeedMult: 0.8,
    hunterWarmup: 8,
    asteroidCount: 70,
    gemCount: 36,
    scoreMultiplier: 0.7,
    hunterCount: 1,
    mapW: MAP_W,
    mapH: MAP_H,
    blurb: 'slower hunter · long warm-up · fewer gems · sparse field · 0.7× score',
  },
  {
    name: 'NORMAL',
    hunterSpeedMult: 1,
    hunterWarmup: HUNTER_WARMUP,
    asteroidCount: ASTEROID_COUNT,
    gemCount: GEM_COUNT,
    scoreMultiplier: 1,
    hunterCount: 1,
    mapW: MAP_W,
    mapH: MAP_H,
    blurb: 'the standard hunt · 1× score',
  },
  {
    name: 'HARD',
    hunterSpeedMult: 1.28,
    hunterWarmup: 3,
    asteroidCount: 134,
    gemCount: GEM_COUNT,
    scoreMultiplier: 1.5,
    hunterCount: 1,
    mapW: MAP_W,
    mapH: MAP_H,
    blurb: 'fast hunter · short warm-up · dense field · 1.5× score',
  },
  {
    name: 'EXTREME',
    hunterSpeedMult: 1.3,
    hunterWarmup: 3,
    asteroidCount: 220,
    gemCount: GEM_COUNT,
    scoreMultiplier: 2.2,
    hunterCount: 2,
    mapW: 8840,
    mapH: 6630,
    blurb: 'TWO hunters · huge map · fast · short warm-up · dense field · 2.2× score',
  },
];

export const DEFAULT_DIFFICULTY = 1; // NORMAL

export function loadDifficultyIndex(): number {
  const raw = parseInt(readSaved('sinv-diff') ?? '', 10);
  return Number.isInteger(raw) && raw >= 0 && raw < DIFFICULTIES.length
    ? raw
    : DEFAULT_DIFFICULTY;
}

const HS_KEY = 'sinv-highscore';

export function loadHighScore(): number {
  return parseInt(readSaved(HS_KEY) ?? '0', 10) || 0;
}

export function saveHighScore(score: number): boolean {
  const prev = loadHighScore();
  if (score > prev) {
    writeSaved(HS_KEY, String(score));
    return true;
  }
  return false;
}
