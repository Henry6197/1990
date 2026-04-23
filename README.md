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
- `R` / `Q` (on ladder tile): climb up / down
- `Enter`: restart after death or victory

## Objective

Clear all enemies in the current sector, then move onto the green exit tile to advance.

## Create Your Own Levels

You can now mix procedural and handcrafted levels.

In `game.js`, each entry in `LEVELS` can optionally include a `map` array:

```js
const LEVELS = [
	{
		name: "My Custom Sector",
		map: [
			"1111111111",
			"1300000001",
			"1011111101",
			"1000400001",
			"1000010001",
			"1000060001",
			"1000080001",
			"1000000201",
			"1111111111",
		],
	},
	{ name: "Sector B - Arc Tunnels" }, // no map = procedural
];
```

Tile legend:

- `0` empty floor
- `1` solid wall
- `2` exit tile
- `3` player spawn
- `4` enemy spawn
- `5` speed booster
- `6` door tile
- `7` medkit
- `8` key pickup
- `9` ladder (use `R` / `Q` to climb)
- `A` stairs (north side is high)
- `B` stairs (east side is high)
- `C` stairs (south side is high)
- `D` stairs (west side is high)
- `E` elevated platform (height 1)

Rules for handcrafted maps:

- Every row must be the same length.
- Include at least one `3` (spawn).
- Include at least one `2` (exit).
- Use only `0-9` and `A-E`.

If a level has a `map`, the generator will not overwrite it.