# RIFT / The Glass Tide

A passthrough mixed-reality side-scrolling shooter for Meta Quest 3, built with Three.js and WebXR and served on GitHub Pages.

**Play:** https://wildelmo.github.io/rift-quest/

## Quest setup

1. Open the play URL in Meta Quest Browser on the headset.
2. Select **Enter mixed reality** and accept the immersive-session prompt. Both Touch controllers are required.
3. Face the room area you want to use. The flight plane is placed in that direction, near eye height and above the floor.
4. In the pause menu, move the left stick up/down to select a row and left/right to adjust it. Set arena width and plane distance (5–8 feet). **X** recenters the arena.
5. Select **Deploy ship** and pull the right trigger to start. The arena stays fixed as you move your head.

The scene has no skybox, opaque background, or background art. The immersive AR session and zero-alpha WebGL clear leave the room visible. Combat simulation is strictly 2D; incoming enemies only become collidable after arriving on the plane. Explosions, debris, hulls, and machinery provide decorative depth. Amber rings mark exact enemy and boss collision boundaries.

Room fit is manual: this version does not scan walls, request room meshes, or occlude objects behind furniture. Default width is 3.8 m with a 16:9 arena. The ship is approximately 8 cm long at default scale. Placement lasts for the current session. No APK installation is required.

## Controls

| Action | Quest Touch controllers | Desktop |
| --- | --- | --- |
| Move | Point right controller (default); left stick in Thumbstick mode | WASD / arrows |
| Fire | Right trigger | Space |
| Charge / release lance | Right grip | Shift |
| Precision focus / show hitbox | Left grip; reduces motion reach to 35% | Ctrl |
| Reset hand position without moving ship | Hold right thumbstick button | — |
| Pulse bomb | A | E |
| Pause | B | P / Escape |
| Resume | Select Resume, right trigger / B | Resume / P |
| Recenter / enter standby | X | — |
| Menu navigation / settings | Left stick up/down selects; left/right adjusts; trigger confirms | Pause menu controls |
| Restart | Right trigger after results | Restart / R |
| Exit | Pause → Exit game → right trigger; system session exit also shuts down | Pause → Exit game |

Focus reduces movement range and reveals the exact hitbox. Full charge takes 1.4 seconds; the lance works with every loadout. Bombs clear hostile bullets, cancel boss beams, briefly protect the ship, and damage enemies. Firing is deliberate. Tracking loss, missing controllers, or app visibility loss pauses play.

## Motion controls

Controller aim is the default on Quest. Point and move the right controller to guide the ship along the anchored flight plane. A fine outlined light tether and faint widening cone connect the controller to the actual ship. They are decorative and draw below hostile projectile marks. Controller movement toward/away from the plane never moves combat out of 2D.

This is relative guidance: the hand is calibrated to the current ship when deploying, resuming, or changing settings. It does not snap the ship to the pointing ray. Slow hand movement receives more filtering than deliberate sweeps. Hold the left grip for 35% motion gain and the visible hitbox. Hold the right thumbstick button while repositioning your hand; the ship stays still, then continues from that hand position when released. Motion reach changes how far a gesture moves the ship. Trigger fire, charged lance, and bombs retain their buttons.

Missing or emulated controller tracking pauses play and audio. A valid tracked controller pointed away from the flight plane temporarily holds movement and hides the guide; returning recalibrates without jumping. The ship has a movement speed limit, and relative swept collision detects hazards crossed by fast movements. Thumbstick mode remains available and has a gentler central response curve. Menus continue to use the left stick.

The implementation uses the preferred pointing pose from [WebXR targetRaySpace](https://www.w3.org/TR/webxr/#dom-xrinputsource-targetrayspace), transformed into the actual scaled/rotated arena. Controller aim and tether geometry were verified through a simulated XR transport, not a physical headset. Actual precision, fatigue, controller feel, and passthrough visibility require a Quest playtest.

## Pause settings and full exit

The desktop and in-headset menus provide master volume, music volume, **Casual / Arcade / Expert** difficulty, **Controller aim / Thumbstick** controls, and motion reach (60–160%). Settings persist between visits and apply during a flight. Casual slows hostile bullets, widens safe corridors, reduces firing cadence, and grants longer protection after a hit. Arcade preserves the original balance. Expert increases hostile speed/cadence and tightens corridors. Ship movement, hitbox, player weapon speed, and beam warnings remain unchanged. Difficulty changes rescale existing hostile velocities without teleporting them or repairing the player.

Pause suspends the AudioContext. App/tab visibility loss also stops game rendering; returning shows the paused state and does not restart audio automatically. Return to hangar closes the old audio context, and starting another flight creates a fresh one.

**Exit game** immediately mutes and stops audio sources, closes the AudioContext, stops animation, ends the immersive session, disposes graphics resources, and attempts to close the tab. Leaving XR through the headset/system menu follows the same cleanup. If the browser refuses tab closure, the game navigates to a static **Game closed** page with no scripts, game canvas, fonts, or media. A web page cannot force the entire browser application to quit.

Research: [XRSession.end only ends the XR session](https://developer.mozilla.org/en-US/docs/Web/API/XRSession/end), [AudioContext.close stops audio processing and releases system resources](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close), [window.close restrictions](https://developer.mozilla.org/en-US/docs/Web/API/Window/close), [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

## One authored level

Three acts take the room through **Glass Rain**, **Copper Foundry**, and **Heart of the Machine**. They change enemy-role mixes, conductor rhythms, and spatial set pieces: a skeletal Leviathan, three counter-rotating forge machines, and a smooth luminous Helix. Fans, moving safe corridors, and recovery windows remain separated.

The clawed **Gatekeeper** arrives at 66 seconds. Its later phases fire coordinated Scissor patterns from two, then three emitters. Defeat it for an echo wing and shield. Level progression pauses during that fight so later acts and set pieces cannot be skipped.

The **Cathedral** arrives after 180 seconds of level progression. Its phases change from Needle Choir / Bloom attacks, to concentric Orrery rings, to isolated Last Opening corridors alternating with the Heartbreaker beam. Beam warnings last 1.5 seconds. Armor opens and sheds petals; destruction preserves that damaged pose, separates the machinery, and finishes before results appear.

Eight pickups build a layered arsenal. **Vector** adds independent diagonal guns above and below the ship; three upgrades widen coverage and add branches. **Missile** continuously launches pairs of low-damage seekers while the trigger is held. They choose the nearest eligible target, turn gradually, and reacquire destroyed targets. **Ring** replaces the primary with growing hollow waves that damage through their rim and pierce several enemies. **Spread** is a wide fan with a seven-shot top tier. **Lance** gains a longer ion core, twin rails, and limited penetration. Primary upgrade levels persist when switching weapons. **Echo** replays your flight path with a 0.28-second delay and fires from its own position at reduced damage. Vector and Missile stack with every primary and Echo. **Shield** absorbs hits and repairs one hull point; **Bomb** adds a screen-clearing pulse. Nearby pickups magnetize; timed drops introduce every family before the final boss, and carriers drop additional upgrades. Grazing builds a temporary score multiplier; damage resets it. The browser stores the best score and flight settings locally.

## Visibility in bright rooms

Passthrough visibility is the default visual treatment. Projectiles have an opaque graphite keyline, a shaded saturated body, and a small warm or mint core. Warm coral/amber/magenta marks hostile fire; cool cyan/teal/violet marks player fire. Orb, petal, and needle proportions also distinguish patterns. Glow supports these solid marks instead of carrying their visibility. All core/body/keyline centers remain on the collision plane, including under oblique head views.

Small ships have cached dark and light hull contours. The player ship stays visible throughout damage protection, with a steady outlined center beacon; a slow amber pulse indicates protection. Precision focus still displays the actual hitbox. Sparks have small dark edges and beams/warnings have solid contrast borders. Projectile marks draw after decorative transparency so explosion glow cannot erase them. Hostile collision sizes and difficulty rules are unchanged. Friendly weapon marks draw below hostile outlines, so stacked fire cannot cover incoming threats.

No room-sized dark panel, skybox, room texture, passthrough sampling, or full-screen effect is introduced. Shared instanced batches handle bullets, hollow rings, missile hulls and trails, and spark outlines; two cached contour meshes are added per small hull. Physical Quest performance remains to be measured.

The QA-only tests/contrast-check.cjs composites the actual transparent renderer against pale, warm, dark, and busy patterned fixtures. It checks opaque colored bodies/keylines, shader compilation, a narrow arena at 8 feet, oblique views, and a threat core inside a dense burst. These are desktop visual checks, not a substitute for real headset lighting/readability validation. Design references: [Meta color guidance](https://developers.meta.com/vr/design/styles_color/) and [mixed reality considerations](https://developers.meta.com/vr/design/mr-design-guideline/).

## Art, motion, and sound

Compound hulls, glass, ceramic armor, graphite machinery, copper surfaces, manufactured roughness maps, articulated fins, engines, and deep mechanical piping establish distinct silhouettes. Shared merged geometry and instanced bullets/particles control draw cost. Electric ribbon beams, muzzle flashes, trails, soft shockwaves, and flying metal fragments provide spectacle without a background image or processing the room.

Separate budgets reserve 900 hostile and 240 player projectiles, 1,800 sparks, and 180 fragments. The desktop ship is enlarged for screen readability.

An authored PCM bank combines FM plasma, resonant metal, mechanical transients, and low-frequency pressure. Stereo positioning, reverb, compression, bounded explosion overlap, music ducking, laser buildup, and a victory release support an adaptive 132/140/144 BPM soundtrack. A short scheduling lookahead keeps rhythm stable. Audio starts after a play gesture. Gameplay needs no downloaded art or audio assets; landing fonts have local fallbacks.

## Develop and publish

Use Node.js 22.12+ or 24+. Run npm ci, npm test, npm run dev, and npm run build. On this Windows development machine, the full npm.cmd path avoids a misconfigured shell shim.

WebXR needs a secure context; use the HTTPS Pages link on Quest. A LAN HTTP preview serves desktop practice.

The main branch deploys through .github/workflows/deploy.yml. Pages Source is GitHub Actions. The workflow tests, builds, uploads dist, and deploys. Relative asset paths support the repository subpath.

## Architecture

- src/arsenal.js: stackable modules, primary weapons, bounded homing, annular collision, and pickup descriptions.
- src/game.js: seeded 90 Hz simulation, swept collision, conductor, weapons, power-ups, bosses, and outcomes.
- src/art.js: shared geometry, merging, plate, and glow helpers.
- src/sculpt.js: compound models, material maps, articulated machinery, and bespoke set pieces.
- src/view.js: instancing, shaders, motion, anchored arena, collision markers, and in-headset HUD.
- src/main.js: desktop/XR lifecycle, controllers, room fit, pause, fixed simulation, and accessible menus.
- src/audio.js / src/sound-bank.js: PCM effects, adaptive music, scheduling, voice management, ducking, and mixing.
- src/motion.js: relative pointer calibration, adaptive smoothing, precision gain, and thumbstick curve.
- src/menu.js: validated saved settings and controller-operated pause menu.
- tests/game.test.js / tests/menu.test.js / tests/arsenal.test.js / tests/motion.test.js: 39 checks covering collision, progression, power-ups, budgets, phase isolation/recovery, act deferral, and deterministic stress.
- tests/render-check.cjs / tests/audio-check.cjs / tests/showcase-check.cjs: optional isolated Chrome scene, busy mix, composited motion, and lifecycle verification. Use Playwright through NODE_PATH; scene/audio checks accept RIFT_BROWSER.

The optional tests/lifecycle-check.cjs checks pause/audio suspension, saved settings, difficulty, hangar/reentry, hidden-page rendering, complete shutdown, blocked/allowed tab closure, simulated XR controller and session events, failure cleanup, and audio-resume races. Its fake XR transport is not a physical headset test.

The optional tests/motion-render-check.cjs verifies real input handling and guide geometry through a fake XR transport: scaled/rotated placement, no initial/resume snapping, precision transitions, hand reset, tracking-loss pause, mode switching, and full disposal.

## Validation and limits

Desktop captures, motion, pause/restart, combat tests, and production build were verified. The independent reviewer checked every act and set piece across three progression seeds, then tested all six boss phases for 30 seconds from three starting heights with reactive movement, without firing, bombs, or artificial invulnerability. All 18 phase probes survived. Automated probes establish routes and transitions; they do not establish human difficulty ratings.

The preceding arsenal review scored 9.0/10 provisionally. The subsequent controller revision has no new numerical grade. All 39 current simulation/menu tests, the lifecycle suite, and simulated motion-controller checks pass. Upgraded shots remain distinct over pale and busy fixtures; sequential frames verify curved seekers and delayed Echo movement. Maximum-loadout tracking probes still expose all boss phases, with the strongest Lance taking about 13.5 seconds for Gatekeeper and 29.9 seconds for Cathedral. These use invulnerability for measurement and do not establish human difficulty.

The updated 15.96-second audio audition includes Ring, Vector, and Missile effects, upgraded fire, multikills, warning/fire, bomb, collapse, and victory. It measured peak 0.613, RMS 0.070, and zero clipped samples. Subjective listening remains unverified. See QUALITY_REVIEW.md for the independent assessment.

**Physical Quest 3 passthrough, controller mapping, readability, comfort, and sustained frame rate need on-device validation.** Check room visibility, anchoring under head motion, controller mapping, tracking-loss pause, session reentry, and worst-phase frame time before calling this headset-validated.

Platform references: [Meta mixed reality in Browser](https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/), [Three.js WebXRManager](https://threejs.org/docs/pages/WebXRManager.html).
