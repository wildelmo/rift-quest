# RIFT / The Glass Tide

A passthrough mixed-reality side-scrolling shooter for Meta Quest 3, built with Three.js and WebXR and served on GitHub Pages.

**Play:** https://wildelmo.github.io/rift-quest/

## Quest setup

1. Open the play URL in Meta Quest Browser on the headset.
2. Select **Enter mixed reality** and accept the immersive-session prompt. Both Touch controllers are required.
3. Face the room area you want to use. The flight plane is placed in that direction, near eye height and above the floor.
4. During **Flight standby**, move the left stick horizontally to adjust width and vertically to adjust distance (5–8 feet). **X** recenters the arena.
5. Pull the right trigger to start. The arena stays fixed as you move your head.

The scene has no skybox, opaque background, or background art. The immersive AR session and zero-alpha WebGL clear leave the room visible. Combat simulation is strictly 2D; incoming enemies only become collidable after arriving on the plane. Explosions, debris, hulls, and machinery provide decorative depth. Amber rings mark exact enemy and boss collision boundaries.

Room fit is manual: this version does not scan walls, request room meshes, or occlude objects behind furniture. Default width is 3.8 m with a 16:9 arena. The ship is approximately 8 cm long at default scale. Placement lasts for the current session. No APK installation is required.

## Controls

| Action | Quest Touch controllers | Desktop |
| --- | --- | --- |
| Move | Left stick | WASD / arrows |
| Fire | Right trigger | Space |
| Charge / release lance | Right grip | Shift |
| Precision focus / show hitbox | Left grip | Ctrl |
| Pulse bomb | A | E |
| Pause | B | P / Escape |
| Resume | Right trigger | Resume / P |
| Recenter / enter standby | X | — |
| Adjust room fit | Left stick during standby | Setup before play |
| Restart | Right trigger after results | Restart / R |
| Exit | Headset system menu | Return to hangar |

Focus slows movement and reveals the exact hitbox. Full charge takes 1.4 seconds; the lance works with every loadout. Bombs clear hostile bullets, cancel boss beams, briefly protect the ship, and damage enemies. Firing is deliberate. Tracking loss, missing controllers, or app visibility loss pauses play.

## One authored level

Three acts take the room through **Glass Rain**, **Copper Foundry**, and **Heart of the Machine**. They change enemy-role mixes, conductor rhythms, and spatial set pieces: a skeletal Leviathan, three counter-rotating forge machines, and a smooth luminous Helix. Fans, moving safe corridors, and recovery windows remain separated.

The clawed **Gatekeeper** arrives at 66 seconds. Its later phases fire coordinated Scissor patterns from two, then three emitters. Defeat it for an echo wing and shield. Level progression pauses during that fight so later acts and set pieces cannot be skipped.

The **Cathedral** arrives after 180 seconds of level progression. Its phases change from Needle Choir / Bloom attacks, to concentric Orrery rings, to isolated Last Opening corridors alternating with the Heartbreaker beam. Beam warnings last 1.5 seconds. Armor opens and sheds petals; destruction preserves that damaged pose, separates the machinery, and finishes before results appear.

Five power-ups: **Spread**, **Lance**, **Echo**, **Shield**, and **Bomb**. Duplicate weapons upgrade to level 3. Spread gains damage, cadence, and a seven-shot formation. Lance gains damage and parallel rails. Echo adds a second firing drone; shields absorb damage and repair one hull point. Nearby pickups magnetize. Grazing builds a visible temporary score multiplier; damage resets it. The browser stores only the best score.

## Art, motion, and sound

Compound hulls, glass, ceramic armor, graphite machinery, copper surfaces, manufactured roughness maps, articulated fins, engines, and deep mechanical piping establish distinct silhouettes. Shared merged geometry and instanced bullets/particles control draw cost. Electric ribbon beams, muzzle flashes, trails, soft shockwaves, and flying metal fragments provide spectacle without a background image or processing the room.

Separate budgets reserve 900 hostile and 240 player projectiles, 1,800 sparks, and 180 fragments. The desktop ship is enlarged for screen readability.

An authored PCM bank combines FM plasma, resonant metal, mechanical transients, and low-frequency pressure. Stereo positioning, reverb, compression, bounded explosion overlap, music ducking, laser buildup, and a victory release support an adaptive 132/140/144 BPM soundtrack. A short scheduling lookahead keeps rhythm stable. Audio starts after a play gesture. Gameplay needs no downloaded art or audio assets; landing fonts have local fallbacks.

## Develop and publish

Use Node.js 22.12+ or 24+. Run npm ci, npm test, npm run dev, and npm run build. On this Windows development machine, the full npm.cmd path avoids a misconfigured shell shim.

WebXR needs a secure context; use the HTTPS Pages link on Quest. A LAN HTTP preview serves desktop practice.

The main branch deploys through .github/workflows/deploy.yml. Pages Source is GitHub Actions. The workflow tests, builds, uploads dist, and deploys. Relative asset paths support the repository subpath.

## Architecture

- src/game.js: seeded 90 Hz simulation, swept collision, conductor, weapons, power-ups, bosses, and outcomes.
- src/art.js: shared geometry, merging, plate, and glow helpers.
- src/sculpt.js: compound models, material maps, articulated machinery, and bespoke set pieces.
- src/view.js: instancing, shaders, motion, anchored arena, collision markers, and in-headset HUD.
- src/main.js: desktop/XR lifecycle, controllers, room fit, pause, fixed simulation, and accessible menus.
- src/audio.js / src/sound-bank.js: PCM effects, adaptive music, scheduling, voice management, ducking, and mixing.
- tests/game.test.js: 20 checks covering collision, progression, power-ups, budgets, phase isolation/recovery, act deferral, and deterministic stress.
- tests/render-check.cjs / tests/audio-check.cjs / tests/showcase-check.cjs: optional isolated Chrome scene, busy mix, composited motion, and lifecycle verification. Use Playwright through NODE_PATH; scene/audio checks accept RIFT_BROWSER.

## Validation and limits

Desktop captures, motion, pause/restart, combat tests, and production build were verified. The independent reviewer checked every act and set piece across three progression seeds, then tested all six boss phases for 30 seconds from three starting heights with reactive movement, without firing, bombs, or artificial invulnerability. All 18 phase probes survived. Automated probes establish routes and transitions; they do not establish human difficulty ratings.

The busy 15.96-second audio audition includes upgraded weapons, multikills, warning/fire, bomb, collapse, and victory. It measured peak 0.678, RMS 0.062, and zero clipped samples. Subjective listening remains unverified. See QUALITY_REVIEW.md for the independent assessment.

**Physical Quest 3 passthrough, controller mapping, readability, comfort, and sustained frame rate need on-device validation.** Check room visibility, anchoring under head motion, controller mapping, tracking-loss pause, session reentry, and worst-phase frame time before calling this headset-validated.

Platform references: [Meta mixed reality in Browser](https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/), [Three.js WebXRManager](https://threejs.org/docs/pages/WebXRManager.html).
