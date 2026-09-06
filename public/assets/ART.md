# Luminous Ruins art

Generated with the built-in image_gen tool for SINV. Original PNGs are kept in this directory; no external asset service is needed at runtime.

## station-hull.png (original, retained for reference)

Use case: stylized-concept. Asset type: production 2D top-down space game environment texture, square image. Primary request: an exquisitely detailed orthographic spacecraft hull surface for a gigantic abandoned orbital station, filling the entire square edge to edge. Flat overhead camera, no perspective. Dense intricate gunmetal and blue slate armor plates, layered inset machinery, radial-looking conduits but no central focal object, fine bevels, scratched titanium, tiny amber running lights and sparse luminous icy cyan circuit strips, occasional dark recessed vents. Cinematic physically rendered materials, elegant restrained sci-fi art direction, luminous cosmic ruins. Large readable panels with fine micro-detail, strong surface depth but moderate contrast. This texture will be clipped into station ring segments and shipwreck silhouettes by the game engine, so cover the entire frame with continuous hull surface. No space background, no stars, no text, no logos, no watermark. Crisp high quality square bitmap.

Used as a surface texture clipped to the exact convex polygons in `src/world/generate.ts`. Empty ring entrances are real empty space, never painted openings over a solid collider. `src/render/landmarks.ts` fits the source over the full generated surface while preserving aspect ratio, rotates its material coordinates with the landmark, caches the clipped art and adds edge lighting. Texture, shading and fracture extents must use the generated canvas bounds, never a fixed 880- or 1200-unit rectangle. Replace the PNG to change the material without changing gameplay.

## nebula.png (original, retained for reference)

Use case: stylized-concept. Asset type: wide background plate for a premium top-down 2D space exploration game. Primary request: breathtaking but restrained deep-space nebula, cinematic astronomical image, luminous cosmic ruins art direction. Ultra-dark midnight navy space with delicate wisps of deep teal and desaturated indigo interstellar dust flowing diagonally along the outer thirds. Small concentrated pale cyan glow in the upper left far corner, a very faint muted violet haze toward bottom right. Vast dark negative space in the central 70 percent for bright gameplay objects to remain clearly readable. Beautiful intricate organic filament structure in the dust clouds, very fine sparse stars, depth and scale, sophisticated subtle lighting, no oversaturated rainbow colors, no large bright white areas. Wide landscape composition. No planets, no ships, no structures, no text, no UI, no logos, no watermark. This is a backdrop, not a scene of the game. High quality raster art.

Background only, drawn with low opacity and the same world movement as the terrain by `src/render/starfield.ts`. It has no gameplay collision.

## nebula-v2.png (active background)

Regenerated with the built-in image generation tool. The new plate contains only nebula clouds; stars remain separately drawn by the engine. It uses the existing opacity and world transform, including camera shake.

Exact generation prompt:

Use case: stylized-concept. Asset type: production background bitmap for a top-down 2D space scavenger game, landscape 3:2 composition, maximum practical resolution. Primary request: regenerate a stunning deep-space nebula background with intricate, clean, organically varied dust clouds throughout the image, readable behind moving ships and asteroids. Style: cinematic astronomical cloud photography, fine turbulent filaments and layered translucent gas, sophisticated atmospheric depth. Color palette: midnight navy and near-black, muted petrol teal, blue-indigo, restrained violet. Composition: irregular wisps and flowing broken clouds crossing the interior as well as edges, interspersed with dark open channels; no big empty central rectangle, no radial halo, no frame, no single bright focal point. Soft low-contrast luminosity with visible mid-dark cloud detail, darkest space around RGB 5,8,18 and luminous gas subdued rather than white. Keep the central regions usable for bright cyan collectibles, gray rocks and a red pursuer. This image will be a world-anchored environmental plate behind a separately rendered procedural starfield. Constraints: absolutely no stars, no point lights, no speckles resembling collectibles, no lens flares, no suns, planets, asteroids, ships, structures, text, UI, logos or watermark. Opaque full-bleed bitmap, no transparency, no painted game objects.

## station-hull-v2.png (active metal material)

Built-in image generation. Replaces the original busy architectural image with an orthographic armor material. Repeats every 512 world units, clipped to exact physical geometry. Original retained for reference.

Exact generation prompt:

Use case: stylized-concept. Asset type: seamless square material texture for a top-down 2D space game. Generate a beautiful production-quality spacecraft armor surface, viewed exactly perpendicular from overhead, orthographic. Full-bleed opaque material swatch, no object silhouette. Broad modular slate blue-gray metal plates with restrained chamfered edges, dark narrow recessed seams, a few recessed vents and inset access panels, sparse bolts, subtle worn edges. Hand-painted game material with clear large forms and selective fine detail, matte surfaces, soft shallow ambient occlusion. Medium-dark steel palette, gentle upper-left illumination, consistent brightness across the whole image. Tile seamlessly on both axes. This texture will be clipped to arbitrary station hull polygons and repeated at a fixed scale. Absolutely no diagonal architecture, no perspective, no curved station ring, no raised buildings, no pipes spanning the image, no space background, no emissive or colored lights, no cyan lines, no text, logos, symbols, borders, frame or watermark. Square 1024x1024.

## asteroid-rock.png (active rock material)

Built-in image generation. Shared by rocky landmarks and moving asteroids at 320 world units per tile. Asteroids use varied crops, retain their collision silhouettes, and rotate with their material. Surface caches refresh when either texture loads.

Exact generation prompt:

Use case: stylized-concept. Asset type: square seamless rock material for overhead 2D space game asteroids and rocky landmarks. Full-bleed opaque surface swatch of ancient fractured carbonaceous asteroid stone, viewed exactly perpendicular, orthographic. Cohesive premium hand-painted game material: broad angular weathered facets, chipped ridges, dark irregular fissures, shallow impact pits and selective small mineral grains. Clear readable rock masses with restrained detail. Desaturated warm graphite and gray basalt, slight brown undertones, moderately dark midtones; softly lit from upper left with shallow ambient occlusion. Uniform scale and brightness across image, tile seamlessly on both axes. Material fills every edge, no isolated rock silhouette. Will be clipped into physical polygon outlines in game. No glowing crystals, no colored veins, no metallic armor, no lava, no plants, no space or background, no stars, no painted drop shadow, no perspective, no text or watermark. Square 1024x1024.


## asteroid-ice.png (first ice attempt, retained for reference)

Built-in image generation. Mixed into roughly 38% of asteroids via a stable hash of existing seeded vertices; no extra gameplay RNG is consumed. Same 320-unit material scale and collision behavior as rocky asteroids.

Exact generation prompt:

Use case: stylized-concept. Asset type: square seamless icy asteroid rock material for an overhead 2D space game. Full-bleed opaque surface swatch, viewed exactly perpendicular, orthographic. Beautiful premium hand-painted game material with realistically textured broad angular fractured graphite stone, shallow impact pits and chipped ridges. Ice-rich asteroid variant: generous irregular patches of dull pale blue-gray frozen water embedded in the rock, frosted cracks, translucent smoky blue ice facets, fine frost coating selected rocky ridges. About 45 percent ice, 55 percent dark desaturated charcoal basalt. Clear large readable forms and restrained fine detail. Moderately dark overall with ice lighter than stone but never bright white; soft upper-left illumination and shallow ambient occlusion. Uniform material scale and brightness throughout, tile seamlessly on both axes. Surface fills every edge, no isolated asteroid silhouette. Will be clipped into physical polygons as small as 40 pixels wide. No glowing or luminous ice, no cyan neon gems or crystals, no colored veins, no metallic panels, no lava, no space background, no stars, no painted drop shadow, no perspective, no text, logos or watermark. Square 1024x1024.

## asteroid-ice-v2.png (active icy asteroid variant)

Regenerated with built-in image generation to make the frozen water clearly distinct from blue-gray stone. Larger translucent frozen expanses, pale frost and internal ice cracks. Uses the same seeded variant selection described above.

Exact generation prompt:

Use case: stylized-concept. Asset type: square opaque seamless ICE-RICH ASTEROID surface material for top-down 2D space game. It must unmistakably read as frozen water ice, not blue-colored stone. Exactly overhead orthographic view. Large continuous expanses of translucent pale glacier blue water ice cover about 70 percent of the surface, with trapped tiny bubbles, cloudy white frost near fractured edges, long delicate branching fractures INSIDE smooth glassy ice, a few angular transparent ice chips. About 30 percent exposed jagged charcoal asteroid rock in irregular islands, partially encased beneath the translucent ice. Strong material contrast between rough matte dark stone and smooth luminous but NOT glowing blue ice. Premium detailed hand-painted game material with physically convincing frozen water, clean readable large forms, soft upper-left illumination. Midtone blue ice with restrained bright frosted edges, dark graphite rock. Even scale and lighting throughout, full bleed edge to edge, seamless on both axes. NO regular paving stones, no continuous slate stone slabs, no masonry, no metallic panels, no dry blue rocks, no turquoise gemstones or pointed crystals, no neon or emissive glow, no space background, no isolated asteroid silhouette, no perspective, no text, no watermark. Square 1024x1024.
