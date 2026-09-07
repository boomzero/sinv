# SINV — Luminous Ruins

A physics-based space scavenger: collect your gem quota, outmaneuver the hunter, and reach the exit.

## Run

```sh
npm install
npm run dev
```

Click Launch or press Enter. W/A/S/D fly, Space boosts, M toggles mouse steering, P or Escape pauses, and R starts a new sector. **Map & legend** is a visible button before launch and below the minimap during flight. It opens the chart and object guide and pauses flight; click Close map to return. Tab and Escape are optional shortcuts. The chart is also available before launch.

On a touch screen, choose a difficulty with the on-screen selector, then hold a finger anywhere on the playfield to steer toward it and fly. Hold a second finger to boost. The **Pause** button doubles as **Resume**, and a paused run also resumes with a single tap anywhere on the playfield, so a run paused by switching apps is never stuck. Touch controls retain full-size tap targets even when the game HUD scales down for a phone-sized viewport.

## Scripts to try

Run terminal commands from the project folder.

| Command or page | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server with live updates. |
| `npm run build` | Check TypeScript and generate the production build. |
| `npm run preview` | Serve the production build after building. |
| `npm test` | Run world/physics/rendering checks and the flight benchmark. |
| `node scripts/test-world.mjs` | Run world, physics, navigation, controls and rendering checks alone. |
| `SINV_TEST_SEEDS=10 node scripts/test-world.mjs` | Shorter 40-map check instead of the default 400. |
| `node scripts/flight-benchmark.mjs` | Scripted collection timing with hunters removed and hull damage healed; outputs simulated seconds. |
| `node scripts/balance-survey.mjs` | Compare route distances on five seeds, ignoring pursuit and gravity. |
| `/scripts/art-preview.html` on the dev server | Inspect terrain and rotating rock/ice asteroids using the production renderers. |

`scripts/test-entry.ts` is an import helper for the checks, not a standalone command.

## Sectors

Each seeded map selects three of five handcrafted landmarks, each with two conditions, randomized positions, and orientations:

- **Broken Halo:** an open ring station or a shattered arc with a wider breach.
- **The Binary:** paired black and white holes with close or wide separation. Three collection arcs circle one side of the black hole, clear of the repulsor; only the inner arc pays the danger bonus.
- **Ship Graveyard:** a ruined convoy or a staggered flagship with different approaches to its passages.
- **The Needle:** a straight narrow seam or an offset crossing that rewards careful steering.
- **Smuggler’s Pocket:** a two-entrance supply cache or a breached vault with a third exit.

Normal targets a 2–3 minute successful run: collect 60 of 84 gems in a 6800×5100 sector. Easy asks for 36 of 51; Hard keeps the Normal quota with a faster hunter, and Extreme expands to 8840×6630 with two hunters. Landmark terrain and route footprints are 1.7× their initial size so the higher quota does not recreate dense pickup chains. Ship handling and gravity forces, core distances, and BHAS behavior retain their existing values.

One third of the gems are outside landmarks: three opening gems along the starting heading, three in each of four asteroid clouds, and the remainder scattered across open space. Normal has 100 asteroids (Easy 70, Hard 134, Extreme 220), with 60% placed into clouds and the remainder scattered. Cloud rocks drift slowly so their weaving routes persist through the run, while loose rocks retain their faster motion; all respond to impacts. The map and minimap show the actual asteroids.

Landmark rewards follow inner and outer ring routes, three gravity arcs, four wreck lanes, and the Needle's seam and flanks. The 40% gem surplus lets cloud scavenging substitute for any one landmark; open-space gems plus a single landmark cannot satisfy the quota. Supplies have a fixed budget, with some deliberately placed inside landmarks and an extra early refuel near the starting corner. Gravity wells belong to the Binary; sectors without it emphasize terrain-based escapes.

Whole landmark footprints are reserved with gaps between them and clearance from ship spawns and the exit. Pickup and asteroid placement checks terrain and gravity clearance, with a checked deterministic fallback. The menu freezes the initial physics state until launch.

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

Tests cover 400 maps across four difficulties: deterministic generation, all landmark combinations and conditions, footprint spacing, pickup and rock clearance, and flood-fill access to gems, supplies, and the exit. Rapier integration checks fixed terrain, actual pickup contacts, quota unlock, escape, reset, chart controls, pause, and simulation stability. Hunter tests use real physics across all eight solid-landmark variants, with target changes and dashes enabled. Background tests confirm all layers use the same motion as terrain.

Balance regressions check cloud density and rewards, the outdoor gem budget, optional landmark routes, and at least 125 units of separation between landmark gems. Lines through landmark gem pairs cannot collect more than one fifth of the quota in a single pass. Rendering checks verify that textures and shading cover every rotated physical vertex in all eight solid-landmark variants. The route survey compares a greedy collection route plus the exit on five fixed Normal seeds, with terrain detours. It reports distance, not clear time: steering, fuel, gravity and pursuit still require playtesting.

`npm test` also runs a collection autopilot on terrain seeds 0, 19 and 42 using real ship steering, fuel, collisions and gem sensors. Hunters are removed and hull is restored each frame to isolate collection time; this is not a human playthrough. A broad 100–180 second regression window catches collapsed or excessively stretched routes. The pilot does not validate gravity-sector timing or evasive play under pursuit; exploratory gravity runs crashed and are not treated as timing results.

GitHub Actions runs `npm run build` and `npm test` on Node 22 for every push and for pull requests from forks; the workflow lives in `.github/workflows/ci.yml`. The balance survey stays a manual command.

The route check verifies geometric access, not whether every route is survivable during a chase. Hunter balance, fuel pressure, and the feel of each shortcut still benefit from human playtesting. Mid-run events and additional artwork for individual wrecks are future extensions.
