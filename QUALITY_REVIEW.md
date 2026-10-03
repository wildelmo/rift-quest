# Independent quality review

The user asked for an independent agent to judge RIFT against a modern bullet-hell side-scroller and to keep iterating until the agent rated the result at least 9/10.

## Final assessment — October 3, 2026

**9.0/10 for the verified web build, provisional.** The independent quality_review agent reported a weighted score of **9.035**, rounded to 9.0. It found no remaining must-fix software defect in the reviewed build.

| Category | Weight | Score |
| --- | --- | --- |
| Art and readability | 25% | 9.1 |
| Combat and level design | 25% | 9.2 |
| Animation and impact | 20% | 9.1 |
| Audio implementation and output | 15% | 8.5, unlistened |
| Interface and reliability | 15% | 9.1 |

The reviewer inspected actual scene captures and sequential frames from the final correctly composited motion recording. It identified the bespoke Leviathan, rotating forge Procession, and smooth Helix as distinct depth set pieces; confirmed visibly changing boss mechanisms, electric beams, exact collision boundaries, and destruction preserving battle damage; and judged the boss phases to require different movement decisions with deliberate recovery windows.

## Evidence and limits

- All 20 simulation tests passed independently.
- Three seeded progression probes reached all acts and set pieces.
- Every boss phase was held at fixed health for 30 seconds from starting heights -2, 0, and +2. All 18 reactive navigation probes survived at full hull, without firing, bombs, or artificial invulnerability. These demonstrate routes; they are not human difficulty ratings.
- The final staged motion capture reported zero JavaScript errors, and verified pause/restart and results appearing only after complete destruction. The capture deliberately skips forward between scenes and uses invulnerability; it is not a complete human playthrough.
- Sampled staged scenes reported up to 239 draw calls and 163,238 triangles. This is scene complexity on the tested desktop renderer, not a Quest frame-rate measurement or a universal worst-case bound.
- The busy 15.96-second audio audition included rapid upgraded fire, simultaneous kills, beam warning/fire, bomb, boss collapse, and victory. Peak was 0.6777, RMS 0.06179, with zero clipped samples at 48 kHz. Voice limits and music ducking were reviewed.

**The agent did not listen to the audio or physically play on Quest.** This grade does not certify headset performance, comfort, controller feel, passthrough readability, subjective sound quality, or a finished commercial release. Those remain the next validation priorities. No background art or off-plane combat hazards were added.

## Iteration history

| Revision | Independent assessment | Main findings |
| --- | --- | --- |
| Initial prototype | 2/10 | Generic primitives, sparse attacks, minimal effects. |
| First rebuild | 5.5–6/10 | Stronger effects, but excessive overlapping attacks and similar bosses. |
| Pacing and encounter pass | 6.5–7/10 | Controlled attack windows and distinct bosses; art and output verification remained weak. |
| Sculpted art, staged destruction, PCM audio | 8.5/10 | Strong finish; repeated flybys and insufficient phase identities held the score back. |
| Bespoke spatial set pieces and authored boss phases | 9.0/10, provisional | Distinct visual identity, coherent phase choreography, protected reading beats, measured busy mix, and verified motion/lifecycle. |

## Subsequent pause and shutdown update

The 9.0 assessment above applies to the preceding art/combat revision; it is not a new grade for this menu update. Added saved volume/music/difficulty controls, an in-headset controller menu, and complete audio/rendering cleanup on Exit or system XR end. Arcade retains the reviewed balance. All 24 simulation/menu checks, isolated browser lifecycle checks, and desktop render checks pass. Simulated XR transport verifies controller/session code paths; on-headset menu readability, native tab-closing behavior, and sustained performance remain unverified.

## Subsequent passthrough visibility update

Added opaque shaded projectile bodies, graphite edges, warm/mint cores, dual hull contours, a persistent player beacon, and solid beam/warning borders. Decorative sparks no longer overdraw critical projectile marks. No simulation rules, room backdrop, or background processing were added. All 24 simulation/menu checks and browser render/lifecycle checks pass. The new contrast suite checks four room-color fixtures, minimum width at maximum distance, oblique views, shader compilation, and a visible hostile core through 182 burst particles. The staged busy scene had 92 hostile shots and 212 draw calls; a separate desktop render probe had 280 calls and 323,174 triangles. These are scene samples, not measured Quest frame rates. This pass has no new independent numerical grade; real Quest visibility and performance remain unverified.

## Arsenal upgrade review — October 3, 2026

**Fresh independent assessment: 9.0/10, provisional, for the verified web arsenal upgrade.** The reviewer found no blocking software defect. This grade applies to the implemented power-up revision, with the headset limitations below.

The reviewer independently checked source, eight pickup icons, pale and busy background captures, and four sequential motion frames. VECTOR provides wide upper/lower diagonal fire. MISSILE launches restrained paired seekers with bounded turning and target reacquisition. RING expands as a hollow annulus and pierces formations; LANCE gains a longer core, rails, damage, and penetration. Echo reproduces the earlier flight path and fires from its own delayed position. Offensive modules stack across primary switches, and primary upgrade levels persist.

- All 32 simulation/menu tests, the production build, and all 10 browser lifecycle scenarios passed independently.
- Maximum-loadout tracking probes exposed all three phases of each boss. Strongest Lance took 13.48 seconds for Gatekeeper and 29.89 seconds for Cathedral, with 7 and 13 attack events. Ring took 20.23 and 46.47 seconds, with 10 and 20 attacks. These measurement probes use invulnerability and do not establish human difficulty.
- Actual transparent-renderer fixtures showed readable hostile fire over rings and burst effects. A probe core remained opaque [255, 241, 207, 255], with friendly layers drawing before hostile layers. The shipped scene keeps a null background and zero-alpha clear.
- Staged upgraded scenes sampled 152–159 draw calls and 202,560–233,318 triangles. A separate ordinary-combat sample reached 304 calls / 330,428 triangles. These are desktop scene samples, not headset frame rates or universal upper bounds.
- The updated 15.96-second busy audio capture includes ring, vector, and missile effects alongside upgraded fire, impacts, multikills, beam warnings/fire, bomb, collapse, and victory. Peak 0.6126, RMS 0.0697, zero clipped samples at 48 kHz, and zero page errors. The reviewer checked recorded statistics and did not listen.

No physical Quest playtest, measured headset frame rate, real passthrough lighting assessment, subjective audio review, or complete human playthrough was performed. The 9.0 score assesses this web upgrade; it does not certify a finished commercial Quest release.

Reproducible local checks: npm test, npm run build, tests/arsenal-render-check.cjs, tests/contrast-check.cjs, tests/lifecycle-check.cjs, tests/render-check.cjs, and tests/audio-check.cjs. Browser checks use an isolated Playwright/Chrome session; QA background fixtures and development controls are not shipped gameplay.

## Subsequent controller precision update

The arsenal score above does not grade this later control revision. Controller aim is now the default for Quest, with a visible controller-to-ship tether and faint light cone. Relative calibration preserves the current ship position on deployment, pause/resume, focus changes, and hand repositioning. Adaptive filtering reduces tremor while allowing faster sweeps; left grip reduces gain to 35%; holding the right thumbstick button resets hand position. Saved controls and motion reach are available in both menus. Thumbstick mode remains available with a finer central response curve.

All 39 current simulation/menu tests and the 10-case lifecycle suite pass. The new simulated XR browser check exercises the actual controller input path against a translated, scaled, rotated flight plane. It verifies exact pointer projection and tether endpoint, trigger fire, no snapping when focusing/resetting/resuming, pause and guide removal on missing/emulated tracking, mode switching, and complete disposal. The production build passes. Player/hostile relative swept collisions also prevent fast motion from skipping a bullet, body, or active beam. Decorative guide geometry never participates in combat.

This is a first motion-control pass, without a fresh independent score. No physical controller comfort, accuracy, fatigue, actual passthrough visibility, or sustained Quest performance is claimed. The user's headset feedback must determine whether the control feel is acceptable.

## Fixed controller ray correction after headset feedback

The user reported that relative guidance drifted out of alignment and became uncontrollable near corners. Removed the calibrated hand-to-ship offsets, motion gain, and focus/release recalibration. The controller now projects a fixed pointing ray; its exact flight-plane intersection is marked by a crosshair and supplies the absolute ship destination. The guide remains collinear with controller orientation independently of the ship position. Left grip and Aim steadiness affect filtering and speed only. Right thumbstick press holds position, with no recalibration on release. Out-of-bounds or unusable intersections hold position and show an amber ray rather than driving the ship into a corner.

All 39 simulation/menu tests pass. Updated tests repeatedly change focus, hold/release, settings, and resets while aiming at the same point, checking convergence without accumulated offsets. The actual browser input path performs 24 focus/pause/out-of-bounds cycles against a scaled/rotated arena: destination error below 0.00001 scene units, ray-angle error below 0.0000001 radians, accurate crosshair projection, and stable ship position when aimed beyond each arena edge. Production build and simulated XR lifecycle checks pass. This verifies software mapping, not physical tracking accuracy or a new numerical quality grade. The user's next Quest playtest is needed to confirm the reported drift is resolved on-device.

## Room placement and tracking correction after headset feedback

The user confirmed controller aiming is fixed, then reported an initially skewed arena and gradual leftward room drift. Deployment now captures the current horizontal headset direction after setup, with upright placement centered at eye height. The arena uses an optional native WebXR anchor and reads its pose each frame rather than relying on unchanged coordinates in a shifting tracking origin. Known reference-space resets apply the inverse origin transform. An unknown reset without an anchor pauses and requires explicit recentering; anchor tracking loss pauses combat and audio until tracking recovers and the player resumes. X replaces the placement without resetting the level. Exit removes active anchors and deletes anchors from late promise completions.

All 49 simulation/menu/control/room tests pass. Ten room tests cover square placement despite head pitch/roll, invalid poses, known 30-degree origin changes, fallback recovery, 6,000 native-anchor pose corrections, anchor loss/recovery, rejected creation, reference-space replacement, and late creation cleanup. The actual browser application loop ran 6,000 simulated frames over three minutes with a gradual 30-degree origin rotation and changing head direction. Physical arena matrix error remained below 1e-8, equal edge distances were verified at deployment, and recentering preserved game progress. The 10-case lifecycle suite and controller-ray browser suite also pass, with no page errors; transparency and full Exit cleanup remain intact. These simulated transports verify the app's coordinate handling, not the quality of Quest's native tracking or an on-device drift cure. A long Quest playtest is still required. No new numerical grade is assigned.

Primary references: [Meta WebXR mixed reality and anchors](https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/), [WebXR reference-space reset semantics](https://www.w3.org/TR/webxr/#eventdef-xrreferencespace-reset), and [WebXR Anchors specification](https://immersive-web.github.io/anchors/). Reproduce room integration with tests/room-render-check.cjs and unit coverage with npm test.

## Fleet and destructible boss art review — October 3, 2026

**Independent assessment: 9.0/10 for this art and damage-feedback upgrade.** The reviewer called the result outstanding within the game's stylized mixed-reality direction after three rounds of revisions (7.7, 8.5, then 9.0). This is not a claim of parity with a large studio production or a headset performance, comfort, or sound grade.

Replaced smooth glossy ship silhouettes with angular armor, faceted surfaces, etched metal panels, inset machinery, distinct needle/delta/segmented enemy profiles, and connected boss structures. Added animated reactor energy behind mechanical housings. Gatekeeper has two damageable pods; Cathedral has four pods/reactors. Their planar hit regions support bullets, rings, piercing shots, charges, bombs, and player collision. Destroying parts causes structural damage, awards score, weakens selected attacks, and leaves a persistent empty socket; the central core always remains viable. Per-target flashes preserve dark recesses. Textured surface explosions, spinning detached modules, and capped particle/debris effects provide impact feedback while hostile projectiles retain visual priority.

The reviewer inspected fleet and combat at gameplay size against white, dark, and busy room fixtures, both bosses intact/hit/break/aftermath, and an independent oblique view. Their independently advanced simulation sequence recorded a hit at 22 ms, complete flash recovery by 200 ms, one separated module at 289 ms, persistent broken socket at 844 ms, and debris cleanup by 1.956 seconds, with no browser errors. They explicitly rejected the initial placeholder reactor lights, disconnected pods, and occluded impact effects before approving the revision.

Validation: all 59 simulation/menu/control/room/boss tests and the production build pass. The browser art check verifies target nodes, persistent sockets, detached pieces, per-enemy flash isolation and decay, an 18-explosion cap, cleanup, transparent scene background, and impact rendering below hostile projectiles. Contrast fixtures preserve opaque threats on bright/busy backgrounds; the burst overlap probe remained [255, 241, 207, 255]. The staged 64-hostile combat sample rendered 108 calls / 66,668 triangles. Upgraded arsenal samples ranged 129–135 calls / 88,624–117,506 triangles. These are desktop scene samples, not measured Quest frame rates. On-headset lighting, scale, and sustained performance still require physical playtesting.

Reproduce with npm test, npm run build, tests/aesthetic-render-check.cjs, tests/contrast-check.cjs, tests/arsenal-render-check.cjs, and tests/lifecycle-check.cjs. Independent evidence is recorded in .artifacts/reviewer-sequence.json and reviewer-sequence-*.png. Reference study: [Konami's Gradius V imagery](https://www.konami.com/games/eu/es/topics/4694/) and [R-Type Final 2 official media](https://www.nisamerica.com/r-type-final-2/).

A separate 36-case perfect-aim balance probe with every weapon/module maximized retained both phase changes for both bosses. Fastest Cathedral kill was 27.18 seconds with 11 attacks; Ring destroyed all four parts in 29.77 seconds with 12 attacks. Fastest Gatekeeper was 9.07 seconds including entry, with 4 attacks, using an upgrade loadout unavailable before that encounter in ordinary play. These probes establish that parts remain strategically meaningful without skipping every boss phase; they do not establish human difficulty. Projectile target arrays and objects are reused to avoid per-shot allocation churn.
