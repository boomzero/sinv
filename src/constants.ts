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
export const HUNTER_BLACKHOLE_RESPAWN = 10; // seconds gone after a core swallows it
// Once baited into a core's inner band, the hunter stays committed this long
// even after the prey rockets clear — so a fast slingshot lure still lands.
export const HUNTER_LURE_COMMIT = 1.1;
export const HUNTER_LUNGE_PERIOD = 6;
export const HUNTER_LUNGE_TELEGRAPH = 0.8;
export const HUNTER_LUNGE_IMPULSE = 620; // delta-v of a lunge burst
export const HUNTER_LUNGE_GEM_FRACTION = 0.75; // lunges unlock past this collection ratio
export const HUNTER_AVOID_DIST = 190;
// Rocks smaller than this the hunter rams straight through instead of dodging
export const HUNTER_AVOID_MIN_RADIUS = 45;
// Delta-v shoved into any rock the hunter hits, along its direction of travel
export const HUNTER_SHOVE_DV = 320;

// Pickups & map population
export const GEM_COUNT = 25;
export const GEM_SCORE = 100;
export const GEM_BONUS_MULT = 3; // well-ring gems pay for the risk
export const ORB_COUNT = 8;
export const ORB_HEAL = 25; // multiplier orbs also patch the hull
export const MULT_MAX = 5;
export const SHIELD_COUNT = 5;
export const BOOSTCELL_COUNT = 12;
export const ASTEROID_COUNT = 35;

// Win-screen scoring
export const HULL_BONUS_PER = 10; // points per surviving hull point
export const BOOST_BONUS_PER = 5; // points per leftover boost unit
export const WIN_BASE_BONUS = 1500; // flat reward for reaching the gate
export const WIN_TIME_PAR = 180; // escapes under this many seconds earn a speed bonus
export const WIN_TIME_BONUS_PER = 15; // points per second saved under par

// Gravity wells: acceleration = WELL_PULL / max(dist, WELL_MIN_DIST)^WELL_FALLOFF,
// inside WELL_RADIUS. Gentle at the rim (~130) but past ~100 units the pull
// exceeds even boosted thrust — dive too deep and the core takes you.
export const WELL_COUNT = 3;
export const WHITE_HOLE_COUNT = 2; // repulsors: same falloff, opposite sign
export const WELL_RADIUS = 460;
// Smaller but pushier than black wells: a tight, near-impenetrable bumper
export const WHITE_HOLE_RADIUS = 280;
export const WHITE_HOLE_PUSH_FACTOR = 1.5;
export const WELL_PULL = 700000;
export const WELL_FALLOFF = 1.4;
export const WELL_MIN_DIST = 45;
// The hunter fights the pull far better than loose rocks — it can't be trapped
export const WELL_HUNTER_FACTOR = 0.35;
// Anything drifting into the core gets consumed; asteroids respawn elsewhere
export const WELL_CORE_RADIUS = 70;
// Ring around the core where the prey can bait the hunter into following it in.
// Drawn on-screen so the player has a clear target to thread.
export const WELL_BAIT_RADIUS = 240;
