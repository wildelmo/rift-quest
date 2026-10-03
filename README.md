# RIFT

A mixed-reality bullet hell for Meta Quest 3. It takes the hand-held ship from Xortex (Valve's
*The Lab*) and mixes in Gradius and R-Type. Passthrough stays on and your room is the arena:
rifts tear open in your real walls and ceiling, wreckage bounces on your real floor and tables,
and a giant sentinel pushes out through the wall in front of you.

**Stage 1 — "Living Room Breach":** four short waves with breathers between them, then the boss,
**THE GYRE**.

## Play

1. Open the deployed page in the **Meta Quest Browser** and tap **Enter Mixed Reality**.
   If you've done Room Setup, the rifts open on your real walls and ceiling. Without it they float
   at fixed distances in front of you.
2. Reach out and **squeeze grip** on either controller to grab the ship. The ship *is* your hand.
   It tracks your controller one-to-one with no smoothing and no steering.

| Input | Action |
| --- | --- |
| Grip (hold) | Hold the ship. Let go to pause; grab it again to resume. |
| Point the ship | Auto-fire goes wherever the nose points (light aim assist). |
| Trigger (hold → release) | Charge an R-Type style wave blast. It pierces everything. |
| A / X, B / Y, or off-hand trigger | Singularity bomb: clears bullets and makes you briefly invulnerable. |
| Thumbstick click (paused / menus) | Recentre the arena in front of you. |
| B / Y (paused) | Toggle sound. |

Turn your off-hand wrist toward you to see a wrist display with your score, ships and bombs.

### Systems

- **Tiny hitbox.** Only the glowing white core in the cockpit can be hit. Bullets that pass close
  to it count as a **graze**, which scores points and gives a haptic tick.
- **Power capsules** (Gradius style) drop when you wipe out a whole formation, and from the bigger
  enemies:
  - **P** raises weapon power. At level 2 you add spread shots, at 3 homing seekers, and at 4 the main guns get heavier.
  - **O** adds an *Option* drone that follows your hand's path, up to three.
  - **S** gives you a shield.
  - **B** gives you an extra bomb.
- **Chains.** Kill enemies in quick succession to build a score multiplier, up to ×16. When you
  destroy a big enemy, the bullets around it turn into gold stars that fly into your ship.
- **The Gyre** has three phases:
  - **Crown:** destroy the turret pods on the tilted outer ring.
  - **Lattice:** break the two prism emitters while dodging sweeping lasers (crosshatch, closing
    spiral, scissor).
  - **Heart:** the shell opens a single aperture. You can only hit the core by flying into its
    gaze, inside the hollow cone of fire it pours out.

Everything is procedural: models, particles, the synthwave soundtrack, and spatialised HRTF
sound effects. There are no asset files.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173 (desktop preview: mouse = ship)
npm test             # unit tests (math, coroutines, bullet patterns, tuning)
npm run e2e          # headless Chromium: full autopilot play-through + menu/pause/continue flow
```

WebXR needs HTTPS or `localhost`. To try a dev build on a Quest over USB:

```bash
adb reverse tcp:5173 tcp:5173   # then open http://localhost:5173 in the Quest Browser
```

Pushing to `main` builds, tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

### Debug URL parameters

- `?boss` starts at the boss.
- `?wave=3` starts at a given wave.
- `?god` makes you invulnerable.
- `?bot` turns on the autopilot.
- `?speed=2` speeds up time.
- `?eyecam` switches the desktop preview to a headset-like viewpoint.
- `?substeps=N` fast-forwards with fixed steps (used by tests).

### Layout

```
src/
  main.js            renderer, XR session, plane detection, main loop
  engine/            billboards (instanced sprites), coroutines, math, canvas text
  audio/             synthesised SFX + sequencer music
  input/             Quest controllers, desktop mouse rig, autopilot
  game/
    game.js          state machine, collisions, scoring, feedback (haptics, hit-stop, flashes)
    stage.js         the four waves and the boss sequence
    boss.js          THE GYRE
    enemies.js       darts, blooms, lancers, carriers, the swarm, capsules
    player.js        ship, shots, options, charge blast
    bullets.js       enemy bullets, lasers, score stars
    patterns.js      pure bullet-pattern geometry (fans, cones, shells)
    room.js          arena placement, detected walls/tables, rifts, deck, dimmer
    hud.js           in-headset UI
    models.js        procedural models
    fx.js            particles and debris
```
