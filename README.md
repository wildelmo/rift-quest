# RIFT / The Glass Tide

A playable, passthrough mixed-reality side-scrolling shooter for Meta Quest 3. Built with Three.js and WebXR, served as a static site on GitHub Pages.

**Play:** https://wildelmo.github.io/rift-quest/

## Play on Quest 3

1. Open the play URL in **Meta Quest Browser on the headset** (not the browser on a PC connected via Quest Link).
2. Select **Enter mixed reality** and accept the browser's immersive-session prompt. Both Touch controllers are required.
3. Face the part of the room you want to use. The flight plane is placed in that direction, centered near eye height with its lower edge above the floor.
4. While in **Flight standby**, move the left stick horizontally to change the width and vertically to change the distance (5–8 feet). Press **X** to recenter in your current viewing direction.
5. Pull the **right trigger** to begin. The arena now stays fixed in the room as you move your head.

The scene has no skybox, opaque background, or background art. `immersive-ar`, a transparent WebGL canvas, and a zero-alpha clear color leave the real room visible. All combat simulation is strictly 2D; entry animations only become collidable when they arrive on the plane. Debris, explosions, hull geometry, and boss machinery add depth without creating off-plane hazards. The amber boss ring marks its collision core; extended machinery is decorative.

Room fit is **manual**. This version does not request scene meshes or scan walls, and does not occlude ships behind real furniture. Default arena width is 3.8 m with a 16:9 play area; adjust it to suit the available room. The ship is approximately 8 cm long at default scale. Arena placements last for the current session, not across reloads. No APK or app-store installation is required.

## Controls

| Action | Quest Touch controllers | Desktop practice |
| --- | --- | --- |
| Move | Left thumbstick | WASD / arrows |
| Fire | Hold right trigger | Hold Space |
| Charge lance | Hold right grip, then release | Hold Shift, then release |
| Pulse bomb | A | E |
| Pause | B | P / Escape |
| Resume | Right trigger | Resume button / P |
| Recenter | X; also enters standby | Not applicable |
| Resize/reposition | Left stick during standby | Flight setup before play |
| Restart after result | Right trigger | Restart button / R |
| Exit MR | Headset system menu | Return to hangar |

Charging slows movement for precision. The charged lance is available with every loadout; a full charge takes 1.4 seconds. Pulse bombs clear hostile bullets, cancel boss beams, briefly protect the ship, and damage enemies. There is no automatic fire. Headset tracking loss, app visibility loss, or missing controllers pauses the game.

## Level

The opening teaches wave reading with drones and fast darts. Sentinels aim three-way volleys, weavers change elevation, and armored carriers drop weapons. The Gatekeeper arrives at 66 seconds; break its core for an echo wing and shield. After 180 seconds and the Gatekeeper's defeat, the Cathedral arrives. Three health-based phases mix aimed fans, rotating radial volleys, and a beam telegraphed for 1.5 seconds. Defeat its core to finish the level.

Five collectible types: **Spread**, **Lance**, **Echo**, **Shield**, and **Bomb**. Repeated weapon pickups upgrade that weapon (maximum level 3). Shields absorb damage and repair one hull point. Echo adds a second firing drone. Nearby pickups magnetize toward the ship. The local browser stores only the best score.

Procedural low-poly models, instanced projectiles and debris, synthesized bass/percussion and stereo effects, controller haptics, and reusable geometry keep the runtime small. Sound begins after a play gesture. The landing page uses Google Fonts with local fallback fonts; gameplay requires no external art or audio assets.

## Develop

Node.js 22.12+ (or 24+) is recommended.

```sh
npm ci
npm test
npm run dev
npm run build
npm run preview
```

The Windows npm shim may be misconfigured on some systems; the full path `C:\Program Files\nodejs\npm.cmd` works on this development machine.

WebXR needs a secure context: use the HTTPS Pages URL on Quest. An ordinary LAN HTTP development URL can serve desktop practice but is not a headset MR deployment.

## Publish

The `main` branch deploys through `.github/workflows/deploy.yml`. Repository Settings → Pages → Source must be **GitHub Actions**. The workflow runs simulation tests, builds with Vite, uploads `dist`, and deploys Pages. `base: './'` supports the repository subpath.

## Architecture and validation

- `src/game.js`: seeded 90 Hz simulation, swept collision checks, wave director, weapons, power-ups, two bosses, victory/defeat.
- `src/view.js`: shared procedural geometry, instanced bullets/particles, depth-only spectacle, world-anchored arena, canvas-textured in-headset HUD.
- `src/main.js`: desktop/XR session lifecycle, controller mapping, room fit, pause, fixed time-step accumulator, accessible HTML menus.
- `src/audio.js`: gesture-unlocked Web Audio synthesis and stereo positioning.
- `tests/game.test.js`: movement bounds, deliberate fire, swept collision, power-ups, damage grace period, pulse cancellation, charge lanes, full boss progression, telegraph timing, restart, and a deterministic four-minute stress run.

Desktop browser rendering and UI were inspected during development; simulation tests and production build pass. **Physical Quest 3 passthrough, controller mapping, readability, comfort, and sustained frame rate still need on-device validation.** This is a playable first-level implementation, not a claim of hardware certification.

Before releasing a headset-tuned update, verify: room remains visible; the plane stays fixed under head movement; all controls match the table; moving outside the warning line avoids the beam; losing tracking pauses; ending/reentering XR works; and the worst boss phase holds the headset's target frame rate. Settings should be tuned from that headset test.

Platform references: [Meta mixed reality in Browser](https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/), [Three.js WebXRManager](https://threejs.org/docs/pages/WebXRManager.html).
