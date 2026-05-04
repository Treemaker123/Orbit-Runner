# Orbit Runner

A browser-based, space-themed endless runner built with **vanilla JavaScript, HTML, and CSS** — no frameworks, no external libraries.

## How to Play

Serve the project with any static HTTP server, then open it in a browser:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080/
```

> **Note:** The game uses ES modules, so opening `index.html` directly via `file://` will not work. It must be served over HTTP.

## Controls

### Desktop
| Action | Keys |
|---|---|
| Switch lane left | `A` / `←` |
| Switch lane right | `D` / `→` |
| Jump | `W` / `↑` |
| Duck | `S` / `↓` |
| **Turn left (mandatory at turn points)** | `Q` |
| **Turn right (mandatory at turn points)** | `E` |
| Activate upgrade slot | `1` / `2` / `3` |
| Pause | `P` / `Esc` |

### Mobile
- **Tilt** device → switch lanes
- **Swipe left / right** → turn at corners
- **Swipe up** → jump
- **Swipe down** → duck
- **Tap upgrade icons** → activate upgrades

## Gameplay

- 3-lane grid-based track with mandatory 90° turns — react in time or it's game over.
- Obstacles: asteroids, laser beams, narrow tunnel sections, gravity zones, zero-G zones, wormholes.
- Collectibles:
  - **Energy cores** — main scoring item.
  - **Shield shards** — collect 3 to auto-activate a shield (~10 s, absorbs 1 hit).
  - **Slowdown orbs** — temporarily slow gameplay.
- **Score = distance + collected cores.** No STARS are earned during a run.

## STARS Economy (out-of-run only)

- **Entry fee:** 500 STARS per run
- **Revive:** 1000 STARS (1 per run)
- STARS are spent only on upgrades, cosmetics, and revives
- Player starts with 5000 STARS (persisted via `localStorage`)

## Upgrades (levels 1–10, up to 3 slots)

- **Magnet** — pulls energy cores toward the player
- **Shield** — manual protection
- **Slowdown** — slows gameplay temporarily
- **Core multiplier** — increases score from cores
- **Momentum control** — slows difficulty ramp-up
- **Auto dodge assist** — temporarily auto-performs the correct action

## Missions

- **Daily** — 3 missions, reset every 24 h
- **General** — long-term, tier-based progression
- Rewards: cosmetics and rare free-entry tokens

## Project Structure

```
index.html
css/style.css
js/
  main.js          entry point
  game.js          state machine & game loop
  track.js         grid track + 90° turn logic
  player.js        player controls & physics
  obstacles.js     obstacle spawning & collision
  collectibles.js  cores, shards, orbs
  renderer.js      Canvas 2D top-down renderer
  ui.js            menus, HUD, popups
  economy.js       STARS balance
  upgrades.js      upgrade definitions & state
  missions.js      daily/general missions
```
