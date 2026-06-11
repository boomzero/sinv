// World
export const MAP_W = 4000;
export const MAP_H = 3000;
export const WALL_T = 80;

// Player ship
export const PLAYER_RADIUS = 14;
export const PLAYER_ACCEL = 430;
export const PLAYER_REVERSE_ACCEL = 190;
export const PLAYER_TURN_SPEED = 3.8;
export const PLAYER_DAMPING = 1.1;
export const BOOST_MULT = 2.4;
export const BOOST_MAX = 100;
export const BOOST_DRAIN = 36; // per second while boosting
export const BOOST_REGEN = 4; // per second passive
export const BOOST_PICKUP_REFILL = 55;
export const HULL_MAX = 100;

// Asteroid impact damage: (relative speed - threshold) * scale, clamped
export const DAMAGE_SPEED_THRESHOLD = 140;
export const DAMAGE_SCALE = 0.16;
export const DAMAGE_MAX = 40;
export const DAMAGE_COOLDOWN = 0.4;

// Hunter
export const HUNTER_RADIUS = 16;
export const HUNTER_BASE_SPEED = 350;
export const HUNTER_SPEED_PER_15S = 9;
export const HUNTER_SPEED_PER_ORB = 14;
export const HUNTER_SPEED_CAP = 720;
export const HUNTER_GAIN = 2.6; // steering responsiveness
export const HUNTER_WARMUP = 5; // seconds before pursuit begins
export const HUNTER_STUN = 3; // seconds stunned after shield break
export const HUNTER_LUNGE_PERIOD = 6;
export const HUNTER_LUNGE_TELEGRAPH = 0.8;
export const HUNTER_LUNGE_IMPULSE = 620; // delta-v of a lunge burst
export const HUNTER_LUNGE_GEM_FRACTION = 0.75; // lunges unlock past this collection ratio
export const HUNTER_AVOID_DIST = 190;

// Pickups & map population
export const GEM_COUNT = 40;
export const GEM_SCORE = 100;
export const ORB_COUNT = 8;
export const MULT_MAX = 5;
export const SHIELD_COUNT = 5;
export const BOOSTCELL_COUNT = 12;
export const ASTEROID_COUNT = 35;

// Gravity wells: acceleration = WELL_PULL / max(dist, 60), inside WELL_RADIUS
export const WELL_COUNT = 3;
export const WELL_RADIUS = 460;
export const WELL_PULL = 60000;
