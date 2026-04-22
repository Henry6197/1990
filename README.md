# Neon Citadel 1990

A browser-based retro raycasting shooter inspired by early Doom/Wolf3D style rendering.

## Features

- 2D-grid raycast wall renderer in a first-person view
- 3 handcrafted levels with progression gates
- Fun movement mechanics:
	- momentum acceleration while chaining movement
	- sprint with stamina management
	- directional dash (`E`) with cooldown
	- temporary speed boosts from overdrive tiles
- Enemy combat AI:
	- grid pathfinding (BFS) to chase the player around walls
	- line-of-sight checks
	- ranged attacks (enemy bullets)
- Player combat:
	- projectile firing with slight spread
	- enemy hit feedback and kill tracking
- Minimap, HUD, crosshair, and in-game notifications

## Run

From the repository root, start a local web server:

```bash
python3 -m http.server 4173
```

Then open:

- `http://127.0.0.1:4173`

## Controls

- `W A S D`: move
- `Mouse` or `Arrow Left/Right`: look
- `Left Click` or `F`: fire
- `Shift`: sprint
- `E`: dash
- `Enter`: restart after death or victory

## Objective

Clear all enemies in the current sector, then move onto the green exit tile to advance.