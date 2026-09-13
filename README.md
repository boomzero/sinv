# SINV — Luminous Ruins

A physics-based space scavenger: upgrade your engine with gems, blast the exit barrier with antimatter, and push through two white holes before the accelerating hunter catches you.

## Run

```sh
npm install
npm run dev
```

Click Launch or press Enter. W/A/S/D fly, Space boosts, M toggles mouse steering, P or Escape pauses, and R starts a new sector. Near the exit barrier, press **E** or tap **Detonate** to spend one antimatter capsule. **Map & legend** is a visible button before launch and below the minimap during flight. It opens the chart and object guide and pauses flight; click Close map to return. Tab and Escape are optional shortcuts. The chart is also available before launch.

On a touch screen, choose a difficulty with the on-screen selector, then hold a finger anywhere on the playfield to steer toward it and fly. Hold a second finger to boost. The **Pause** button doubles as **Resume**, and a paused run also resumes with a single tap anywhere on the playfield, so a run paused by switching apps is never stuck. Enable **Fixed joystick** on the menu or pause screen to steer and fly by dragging the bottom-right stick instead; return it to the center or release it to stop thrusting. This preference is saved for future visits. Touch controls retain full-size tap targets even when the game HUD scales down for a phone-sized viewport.

Enable **FPS counter** on the launch or pause screen to show live frame rate and the longest frame interval over the last second. It is off by default and remembers your choice. The counter measures actual animation-frame intervals, including stutters, and resets after returning from a background tab.

## Scripts to try

Run terminal commands from the project folder.

| Command or page | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server with live updates. |
| `npm run build` | Check TypeScript and generate the production build. |
| `npm run preview` | Serve the production build after building. |
| `npm test` | Run world/physics/rendering checks and the flight benchmark. |
| `node scripts/test-world.mjs` | Run world, physics, navigation, controls and rendering checks alone. |
| `node scripts/flight-benchmark.mjs` | Scripted gem/capsule collection, detonation and physical escape with hunters removed and hull damage healed. |
| `node scripts/test-escape.mjs` | Check engine thresholds, narrow/wide breaches, capsule conservation, reset and bypass resistance using Rapier. |
| `/scripts/escape-preview.html` on the dev server | Compare 0/30/54/60/84-gem engines and one to five detonations in a controlled exit approach. |
| `node scripts/balance-survey.mjs` | Compare route distances on five seeds, ignoring pursuit and gravity. |
| `/scripts/art-preview.html` on the dev server | Inspect terrain and rotating rock/ice asteroids using the production renderers. |

`scripts/test-entry.ts` is an import helper for the checks, not a standalone command.

## Sectors

Each seeded map includes the Binary plus two of the other four handcrafted landmarks, each with two conditions, randomized positions, and orientations:

- **Broken Halo:** an open ring station or a shattered arc with a wider breach.
- **The Binary:** paired black and white holes with close or wide separation. Three collection arcs circle one side of the black hole, clear of the repulsor; only the inner arc pays the danger bonus.
- **Ship Graveyard:** a ruined convoy or a staggered flagship with different approaches to its passages.
- **The Needle:** a straight narrow seam or an offset crossing that rewards careful steering.
- **Smuggler’s Pocket:** a two-entrance supply cache or a breached vault with a third exit.

Normal provides 84 gems in a 6800×5100 sector, with about 54 gem power recommended for a boosted escape. Easy provides 51 and recommends about 36; Hard recommends 60 gem power with a faster hunter, and Extreme expands to 8840×6630 with two hunters. These are preparation estimates, not unlock quotas. Landmark terrain and route footprints retain their 1.7× scale.

## Physical escape

Small gems permanently add 1.2 percentage points to forward and reverse thrust; big gems add 3.6. At 60 gem power, the engine produces 172% of its initial thrust. There is no fixed speed cap; unchanged linear damping determines sustainable speed. Gems still award points, but now directly improve the ship's ability to escape. The hunter still accelerates with time and collected repair orbs. Normal retains its starting speed with 20% slower time-based acceleration; other difficulties retain their speed curves. Gem upgrades add no hunter-speed scaling.

Eight orange antimatter capsules are distributed across field locations and landmark caches. Collect gems and capsules in any order. At the west-facing exit approach, **E** or the visible **Detonate** button consumes one capsule and removes irregular, textured rock chunks whose fracture edges match their colliders. The barrier contains 60 irregular physical shards across three depths. The first two charges excavate a crater but leave rock blocking the passage. The third connects a narrow central tunnel; the fourth clears its shoulders, and the fifth clears the full corridor. Fast impacts with intact shards damage the hull using the asteroid impact threshold and cooldown; a shield absorbs the triggering hit and grants one second of invulnerability against hunters, rocks, shards and black-hole cores. Hunters touching that active shield are stunned and pushed away. A bright bubble and countdown show the protection window. Pausing freezes it; restarting clears it. A new shield picked up during the window stays armed for the next hit after it expires. Damage to the barrier persists if you retreat and return, and a cleared barrier cannot consume extra capsules. Bring at least three capsules to cut through, or up to five for more flying room.

Two white holes flank the corridor behind the barrier. Their radial repulsion and momentum-dissipating fields require sustained upgraded thrust and boost. They have expanding pressure rings instead of the Binary's tangential slingshot effect. The exit stays lit throughout; surrounding station walls prevent side/rear bypasses. There is no gem-count check at the exit. Insufficient preparation stalls and repels the ship, while surplus gems make the crossing faster and more forgiving. The hunter continues getting faster as you spend time preparing.

The hunter also gains pursuit speed as gems upgrade your engine, including the extra thrust from big gems. This upgrade pressure continues beyond its time/orb speed cap, so endgame cruising cannot leave it behind indefinitely on Normal and above. Boost still opens a gap; terrain and gravity maneuvers remain ways to break pursuit.

The HUD and chart show engine strength, estimated gem preparation, capsule inventory and breach condition. The approach is reserved during world generation so essential resources never spawn inside it. Restarting restores the barrier and resets thrust and capsules.

Five pink **magnetism capsules** grant 12 seconds of attraction within 720 world units. Big triple-value gems are attracted within 240 units, shown by the inner pink ring. Pickups start moving gently and build momentum under a pull that strengthens as they approach, curving toward you when you turn. Gentle momentum damping lets brief orbits settle inward when you stop. Ordinary gems, antimatter, repair orbs, shields, boost fuel and other magnets retain the full range; solid terrain blocks attraction. Leaving the field or letting it expire stops their motion. Another capsule refreshes the duration. The pink field and HUD countdown show when the skill is active, and pausing freezes its timer. The field rings disappear when you die.

## Resource placement

One third of the gems are outside landmarks: three opening gems along the starting heading, three in each of four asteroid clouds, and the remainder scattered across open space. Normal has 100 asteroids (Easy 70, Hard 134, Extreme 220), with 60% placed into clouds and the remainder scattered. Cloud rocks drift slowly so their weaving routes persist through the run, while loose rocks retain their faster motion; all respond to impacts. The map and minimap show the actual asteroids, capsules, repulsors and remaining barrier pieces.

Landmark rewards follow inner and outer ring routes, three gravity arcs, four wreck lanes, and the Needle's seam and flanks. The surplus gems lets cloud scavenging substitute for any one landmark; open-space gems plus a single landmark fall short of the recommended preparation. Supplies have a fixed budget, with some deliberately placed inside landmarks and an extra early refuel near the starting corner. The Binary contributes its own gravity wells; every sector also has the two exit repulsors.

Whole landmark footprints are reserved with gaps between them and clearance from ship spawns and the full exit approach. Pickup and asteroid placement checks terrain and gravity clearance, with a checked deterministic fallback. The menu freezes the initial physics state until launch.

For a reproducible starting layout, open `http://localhost:5173/?seed=42` and choose the same difficulty. The chart shows the current seed in hexadecimal; the URL accepts its decimal form. R always generates a new seed. Seeds reproduce the initial layout, not subsequent player input or particle effects.

## Art

The custom [station hull](public/assets/station-hull-v2.png), [asteroid rock](public/assets/asteroid-rock.png), [icy asteroid](public/assets/asteroid-ice-v2.png), and [nebula](public/assets/nebula-v2.png) were generated using the built-in image generation tool. Their exact prompts and usage notes are in [ART.md](public/assets/ART.md).

With the dev server running, open `/scripts/art-preview.html` to inspect landmark overviews, flight-scale crops, and rotating asteroids. Roughly 38% of asteroids use the ice-rich material, selected deterministically from their existing shapes without changing gameplay randomness. The minimap uses the same terrain and symbols as the full chart.

Rocky asteroids have density 1.35, restitution 0.55 and friction 0.7. Icy asteroids have density 0.55, restitution 0.95 and friction 0.08: at equal size they have about 41% of rock's mass, so they are easier to push, slide more and rebound harder. The hunter pushes both according to those masses. Fixed landmarks stay immovable. The existing impact-damage formula applies to both types; ice still hurts at high relative speed.

Station art is clipped to the same convex polygons used by Rapier: an opening in the art is an opening in the collider. Metal panels repeat every 512 world units; rock textures repeat every 320, with aspect ratio preserved. Both materials rotate with their objects. Asteroids use varied crops of the same rock material as rocky landmarks, with shaded edges inside their collision outlines. Detailed surfaces are cached and rebuilt when textures load. The nebula and all stars move with the same world transform as the terrain; there is no layered parallax. Bright ship and pickup silhouettes remain above the environment. Solid fallback colors remain available if an image fails to load.

The hunter plans paths around fixed terrain using a clearance-aware grid, follows waypoints through gaps, replans as the target moves, and slows for corners. Moving asteroids still use local avoidance. Dashes require a clear line to the predicted target. BHAS remains separate: its override permits a lure attempt; it does not guarantee capture.

## Validation

```sh
npm test
npm run build
node scripts/balance-survey.mjs
```

Tests cover 400 maps across four difficulties: deterministic generation, all landmark combinations and conditions, footprint spacing, pickup and rock clearance, and flood-fill access to gems, supplies, capsules, and the exit approach. Separate physical escape tests cover all four difficulties, normal boost consumption, narrow and wide breaches, persistent damage, reset, high-speed/coasting rejection, and solid side/rear walls. Rapier integration checks fixed terrain, actual gem and capsule contacts, permanent engine upgrades, barrier detonation, escape, reset, chart controls, pause, and simulation stability. Hunter tests use real physics across all eight solid-landmark variants, with target changes and dashes enabled. Background tests confirm all layers use the same motion as terrain.

Balance regressions check cloud density and rewards, the outdoor gem budget, optional landmark routes, and at least 125 units of separation between landmark gems. Lines through landmark gem pairs cannot collect more than one fifth of the recommended gem load in a single pass. Rendering checks verify that textures and shading cover every rotated physical vertex in all eight solid-landmark variants. The route survey compares a greedy collection route plus three capsules and the exit approach on five fixed Normal seeds, with terrain detours. It reports distance, not clear time: steering, fuel, gravity and pursuit still require playtesting.

`npm test` also runs a resource-collection and escape autopilot on seeds 0, 19 and 42 using real ship steering, engine upgrades, fuel, collisions, pickup sensors, detonation and exit repulsion. Hunters are removed and hull is restored each frame to isolate collection and escape time; this is not a human playthrough. A broad 100–180 second regression window catches collapsed or excessively stretched routes. The updated pilot completed seeds 0, 19 and 42 in approximately 121, 127 and 129 simulated seconds. The pilot navigates around the Binary’s active fields and validates the exit repulsors. It does not validate collection inside the Binary or evasive play under pursuit. Human playtesting is still needed for difficulty and feel.

GitHub Actions runs `npm run build` and `npm test` on Node 22 for every push and for pull requests from forks; the workflow lives in `.github/workflows/ci.yml`. The balance survey stays a manual command.

The route check verifies geometric access, not whether every route is survivable during a chase. Hunter balance, fuel pressure, and the feel of each shortcut still benefit from human playtesting. Mid-run events and additional artwork for individual wrecks are future extensions.

### Playtest commands

Type **kelly** during a run to enable the command console, then press **/** or click **Commands**. Console access alone does not grant infinite boost or impact immunity. The console pauses simulation while open; Escape closes it. Up/down recalls commands. Cheat runs never save high scores.

- `gems 54` sets engine power to 54 small-gem equivalents (not collected score).
- `antimatter 5`, `shield`, `heal`, `fuel`, `magnet 12` set up resources.
- `tp exit` moves to the exit approach; `tp 1000 1000` moves to coordinates and stops the ship.
- `hunters off` / `hunters on` disable or restore hunters.
- `time 120` sets elapsed simulation time, including hunter escalation.
- `status` shows seed, difficulty and resources; `help` lists commands.

Big gems grant three times the engine thrust of small gems: +3 gem power instead of +1. The HUD escape target uses gem power; collection statistics still count physical gems.

Use `infinite-boost on` / `infinite-boost off` and `impact-immunity on` / `impact-immunity off` independently. Both default to off and reset on a new run. Impact immunity blocks asteroid and barrier damage; hunters and black-hole cores remain dangerous. `status` reports both settings.

Use `gravity off` to disable gravity-well attraction, repulsion, swirl and field drag for the player, and `gravity on` to restore them. Hunters and asteroids retain normal gravity, and black-hole cores remain dangerous. Player gravity defaults to on, resets on a new run, and is shown in the console and `status`.
