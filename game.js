const canvas = document.getElementById("game");
const displayCtx = canvas.getContext("2d");
const sceneCanvas = document.createElement("canvas");
sceneCanvas.width = canvas.width;
sceneCanvas.height = canvas.height;
const ctx = sceneCanvas.getContext("2d");
const pixelCanvas = document.createElement("canvas");
pixelCanvas.width = Math.floor(canvas.width / 8);
pixelCanvas.height = Math.floor(canvas.height / 8);
const pixelCtx = pixelCanvas.getContext("2d");
displayCtx.imageSmoothingEnabled = false;
pixelCtx.imageSmoothingEnabled = false;
const overlay = document.getElementById("overlay");

const W = canvas.width;
const H = canvas.height;
const FOV = Math.PI / 3;
const HALF_FOV = FOV / 2;
const MAX_RAY_DIST = 24;
const PLAYER_RADIUS = 0.2;
const ENEMY_RADIUS = 0.22;
const RENDER_STRIP = 3;
const RAY_COUNT = Math.floor(W / RENDER_STRIP);
const TEX_SIZE = 32;
const FLOOR_SAMPLE_X = 9;
const FLOOR_SAMPLE_Y = 3;
const EXTRA_ENEMIES_PER_LEVEL = 12;
const MEDKITS_PER_LEVEL = 10;
const MAZE_COLS = 16;
const MAZE_ROWS = 16;

const COLORS = {
  wallA: "#9ca3af",
  wallB: "#6b7280",
  skyTop: "#0f172a",
  skyBottom: "#1d4ed8",
  floorTop: "#1f2937",
  floorBottom: "#030712",
  enemy: "#ef4444",
  enemyHit: "#fca5a5",
  playerBullet: "#22d3ee",
  enemyBullet: "#f97316",
  booster: "#22c55e",
  medkit: "#fb7185",
};

function makeTexture(drawFn) {
  const c = document.createElement("canvas");
  c.width = TEX_SIZE;
  c.height = TEX_SIZE;
  const tctx = c.getContext("2d");
  drawFn(tctx);
  const data = tctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data;
  return { canvas: c, data };
}

function drawBrickTexture(tctx, brickColor, mortarColor) {
  tctx.fillStyle = mortarColor;
  tctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const rowH = 8;
  const brickW = 14;
  for (let y = 0; y < TEX_SIZE; y += rowH) {
    const offset = (Math.floor(y / rowH) % 2) * (brickW / 2);
    for (let x = -brickW; x < TEX_SIZE + brickW; x += brickW + 2) {
      tctx.fillStyle = brickColor;
      tctx.fillRect(Math.floor(x + offset), y + 1, brickW, rowH - 2);
      tctx.fillStyle = "rgba(255,255,255,0.08)";
      tctx.fillRect(Math.floor(x + offset), y + 1, brickW, 1);
      tctx.fillStyle = "rgba(0,0,0,0.18)";
      tctx.fillRect(Math.floor(x + offset), y + rowH - 2, brickW, 1);
    }
  }
}

function drawStoneFloorTexture(tctx, base, seam) {
  tctx.fillStyle = base;
  tctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let y = 0; y < TEX_SIZE; y += 8) {
    for (let x = 0; x < TEX_SIZE; x += 8) {
      tctx.fillStyle = (x + y) % 16 === 0 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)";
      tctx.fillRect(x + 1, y + 1, 6, 6);
      tctx.fillStyle = seam;
      tctx.fillRect(x, y + 7, 8, 1);
      tctx.fillRect(x + 7, y, 1, 8);
    }
  }
}

const TEXTURES = {
  wallGray: makeTexture((tctx) => drawBrickTexture(tctx, "#6f7379", "#2f3135")),
  wallBrown: makeTexture((tctx) => drawBrickTexture(tctx, "#8b623a", "#3a2a1f")),
  wallRed: makeTexture((tctx) => drawBrickTexture(tctx, "#8f1a18", "#2d1010")),
  doorMetal: makeTexture((tctx) => {
    tctx.fillStyle = "#5f4912";
    tctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let y = 0; y < TEX_SIZE; y += 8) {
      tctx.fillStyle = y % 16 === 0 ? "#f7c948" : "#e0a91f";
      tctx.fillRect(0, y, TEX_SIZE, 6);
      tctx.fillStyle = "#6d4e14";
      tctx.fillRect(0, y + 6, TEX_SIZE, 2);
    }

    // Hazard stripe center seam.
    tctx.fillStyle = "#1f2937";
    tctx.fillRect(14, 0, 4, TEX_SIZE);
    for (let y = -4; y < TEX_SIZE + 4; y += 6) {
      tctx.fillStyle = "#facc15";
      tctx.fillRect(14, y, 4, 3);
    }

    tctx.fillStyle = "#fde68a";
    tctx.fillRect(3, 3, 3, 3);
    tctx.fillRect(TEX_SIZE - 6, TEX_SIZE - 6, 3, 3);
  }),
  wallExit: makeTexture((tctx) => {
    drawBrickTexture(tctx, "#3f7f28", "#12220e");
    tctx.fillStyle = "#a3e635";
    tctx.fillRect(11, 10, 10, 12);
    tctx.fillStyle = "#0b1220";
    tctx.fillRect(14, 14, 4, 4);
  }),
  floorStone: makeTexture((tctx) => drawStoneFloorTexture(tctx, "#3d3b38", "#262522")),
  floorTech: makeTexture((tctx) => drawStoneFloorTexture(tctx, "#3f4630", "#1e2515")),
};

function getWallThemeTexture() {
  const theme = Math.floor(state.levelIndex / 2) % 3;
  if (theme === 0) return TEXTURES.wallGray;
  if (theme === 1) return TEXTURES.wallBrown;
  return TEXTURES.wallRed;
}

function getFloorTexture() {
  const theme = Math.floor(state.levelIndex / 2) % 2;
  return theme === 0 ? TEXTURES.floorStone : TEXTURES.floorTech;
}

function getWallTexture(mapX, mapY, tile) {
  if (tile === 6) return TEXTURES.doorMetal;
  if (tile === 2) return TEXTURES.wallExit;
  return getWallThemeTexture();
}

function getTexturePixel(texture, tx, ty) {
  const ix = ((ty * TEX_SIZE + tx) * 4);
  return [texture.data[ix], texture.data[ix + 1], texture.data[ix + 2]];
}

const LEVELS = [
  { name: "Sector A - Foundry" },
  { name: "Sector B - Arc Tunnels" },
  { name: "Sector C - Iron Vault" },
];

const keys = {};
let mouseLocked = false;
let lastTime = performance.now();

const state = {
  running: true,
  paused: false,
  levelIndex: 0,
  levelName: "",
  map: [],
  mapW: 0,
  mapH: 0,
  player: null,
  enemies: [],
  corpses: [],
  projectiles: [],
  wallSplats: [],
  messages: [],
  killCount: 0,
  levelKills: 0,
  totalLevels: LEVELS.length,
  doors: new Map(),
};

function doorKey(x, y) {
  return `${x},${y}`;
}

function getDoorAt(x, y) {
  return state.doors.get(doorKey(x, y));
}

function isDoorOpenEnough(door) {
  return door && door.open >= 0.92;
}

function makePlayer(x, y) {
  return {
    x,
    y,
    angle: 0,
    health: 100,
    stamina: 100,
    staminaMax: 100,
    staminaRegenDelay: 0,
    dashCooldown: 0,
    dashTime: 0,
    dashVector: { x: 0, y: 0 },
    moveMomentum: 0,
    speedBuff: 0,
    hasKey: false,
    fireCooldown: 0,
    recoil: 0,
    bob: 0,
    bobT: 0,
  };
}

function pushMessage(text, duration = 2.2) {
  state.messages.push({ text, ttl: duration });
}

function parseLevel(levelIdx) {
  const level = LEVELS[levelIdx];
  state.map = level.map.map((row) => row.split("").map((n) => Number(n)));
  state.mapH = state.map.length;
  state.mapW = state.map[0].length;
  state.levelName = level.name;
  state.projectiles = [];
  state.corpses = [];
  state.wallSplats = [];
  state.levelKills = 0;
  state.enemies = [];
  state.doors = new Map();

  let start = { x: 1.5, y: 1.5 };
  for (let y = 0; y < state.mapH; y += 1) {
    for (let x = 0; x < state.mapW; x += 1) {
      const tile = state.map[y][x];
      if (tile === 3) {
        start = { x: x + 0.5, y: y + 0.5 };
        state.map[y][x] = 0;
      } else if (tile === 4) {
        const spawnX = x + 0.5;
        const spawnY = y + 0.5;
        const patrolRoute = makePatrolRoute(spawnX, spawnY);
        state.enemies.push({
          x: spawnX,
          y: spawnY,
          health: 45,
          path: [],
          pathIndex: 0,
          repathTimer: Math.random() * 0.6,
          fireCooldown: Math.random() * 0.8,
          hurtTimer: 0,
          alerted: false,
          alertTimer: 0,
          patrolRoute,
          patrolTarget: patrolRoute.length > 1 ? 1 : 0,
          patrolStuckTimer: 0,
        });
        state.map[y][x] = 0;
      } else if (tile === 6) {
        // Check if a paired door tile already exists (right or down neighbor already registered).
        const partnerRight = state.doors.get(doorKey(x - 1, y));
        const partnerDown  = state.doors.get(doorKey(x, y - 1));
        const existing = partnerRight || partnerDown;
        if (existing) {
          // Share the same door object so both tiles open/close together.
          state.doors.set(doorKey(x, y), existing);
        } else {
          const rightTile = state.map[y]?.[x + 1];
          const downTile  = state.map[y + 1]?.[x];
          const orientation = (rightTile === 6) ? "ns" : (downTile === 6) ? "ew" : "ns";
          state.doors.set(doorKey(x, y), {
            x,
            y,
            orientation,
            open: 0,
            moving: 0,
            holdTimer: 0,
          });
        }
      }
    }
  }

  if (!state.player) {
    state.player = makePlayer(start.x, start.y);
  } else {
    state.player.x = start.x;
    state.player.y = start.y;
    state.player.angle = 0;
    state.player.dashCooldown = 0;
    state.player.dashTime = 0;
    state.player.moveMomentum = 0;
    state.player.hasKey = false;
  }

  pushMessage(`Loaded ${level.name}`);
}

function resetGame(fullReset = true) {
  state.running = true;
  state.paused = false;
  state.messages = [];
  if (fullReset) {
    state.levelIndex = 0;
    state.killCount = 0;
    state.player = null;
  }
  parseLevel(state.levelIndex);
  hideOverlay();
}

function showOverlay(text) {
  overlay.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function isWall(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gy < 0 || gx < 0 || gy >= state.mapH || gx >= state.mapW) return true;
  const tile = state.map[gy][gx];
  if (tile === 6) {
    const door = getDoorAt(gx, gy);
    return !isDoorOpenEnough(door);
  }
  return tile === 1;
}

function isExit(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  return state.map[gy]?.[gx] === 2;
}

function canMoveTo(x, y, radius) {
  return (
    !isWall(x - radius, y - radius) &&
    !isWall(x + radius, y - radius) &&
    !isWall(x - radius, y + radius) &&
    !isWall(x + radius, y + radius)
  );
}

function hasLineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist * 12);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;
    if (isWall(x, y)) return false;
  }
  return true;
}

function fireProjectile(owner, x, y, angle, speed, damage) {
  state.projectiles.push({
    owner,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    ttl: 2.5,
  });
}

function angleDiff(a, b) {
  let d = (a - b + Math.PI) % (Math.PI * 2) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function onPlayerShot() {
  const p = state.player;
  if (p.fireCooldown > 0 || !state.running) return;
  p.fireCooldown = 0.2;
  p.recoil = Math.min(0.2, p.recoil + 0.11);
  const spread = (Math.random() - 0.5) * 0.03;
  fireProjectile("player", p.x, p.y, p.angle + spread, 10.5, 18);
}

function normalize(vx, vy) {
  const m = Math.hypot(vx, vy);
  return m > 0 ? { x: vx / m, y: vy / m } : { x: 0, y: 0 };
}

function tryDash() {
  const p = state.player;
  if (p.dashCooldown > 0 || p.dashTime > 0 || p.stamina < 20) return;
  let dx = 0;
  let dy = 0;
  if (keys.KeyW) {
    dx += Math.cos(p.angle);
    dy += Math.sin(p.angle);
  }
  if (keys.KeyS) {
    dx -= Math.cos(p.angle);
    dy -= Math.sin(p.angle);
  }
  if (keys.KeyA) {
    dx += Math.cos(p.angle - Math.PI / 2);
    dy += Math.sin(p.angle - Math.PI / 2);
  }
  if (keys.KeyD) {
    dx += Math.cos(p.angle + Math.PI / 2);
    dy += Math.sin(p.angle + Math.PI / 2);
  }
  if (dx === 0 && dy === 0) {
    dx = Math.cos(p.angle);
    dy = Math.sin(p.angle);
  }
  const dir = normalize(dx, dy);
  p.dashVector = dir;
  p.dashTime = 0.12;
  p.dashCooldown = 1.1;
  p.stamina = Math.max(0, p.stamina - 20);
  p.staminaRegenDelay = 0.35;
}

function tryOpenDoor() {
  const p = state.player;
  const dirX = Math.cos(p.angle);
  const dirY = Math.sin(p.angle);

  for (let d = 0.45; d <= 1.25; d += 0.08) {
    const tx = Math.floor(p.x + dirX * d);
    const ty = Math.floor(p.y + dirY * d);
    if (state.map[ty]?.[tx] !== 6) continue;

    const door = getDoorAt(tx, ty);
    if (!door) return true;

    if (door.open > 0.7 || door.moving > 0) {
      door.moving = -1;
      door.holdTimer = 0;
    } else {
      door.moving = 1;
      door.holdTimer = 6.5;
    }
    return true;
  }

  return false;
}

function updatePlayer(dt) {
  const p = state.player;
  const turnSpeed = 2.4;
  if (keys.ArrowLeft) p.angle -= turnSpeed * dt;
  if (keys.ArrowRight) p.angle += turnSpeed * dt;

  let mx = 0;
  let my = 0;
  if (keys.KeyW) {
    mx += Math.cos(p.angle);
    my += Math.sin(p.angle);
  }
  if (keys.KeyS) {
    mx -= Math.cos(p.angle);
    my -= Math.sin(p.angle);
  }
  if (keys.KeyA) {
    mx += Math.cos(p.angle - Math.PI / 2);
    my += Math.sin(p.angle - Math.PI / 2);
  }
  if (keys.KeyD) {
    mx += Math.cos(p.angle + Math.PI / 2);
    my += Math.sin(p.angle + Math.PI / 2);
  }

  const moveVec = normalize(mx, my);
  const moving = moveVec.x !== 0 || moveVec.y !== 0;
  p.moveMomentum = moving ? Math.min(1, p.moveMomentum + dt * 0.9) : Math.max(0, p.moveMomentum - dt * 2.4);

  let speed = 1.9 + p.moveMomentum * 1.0;

  if (p.speedBuff > 0) {
    p.speedBuff -= dt;
    speed *= 1.2;
  }

  const sprinting = keys.ShiftLeft || keys.ShiftRight;
  if (sprinting && moving && p.stamina > 0) {
    speed *= 1.25;
    p.stamina = Math.max(0, p.stamina - 37 * dt);
    p.staminaRegenDelay = 0.45;
  } else if (p.staminaRegenDelay > 0) {
    p.staminaRegenDelay -= dt;
  } else {
    p.stamina = Math.min(p.staminaMax, p.stamina + 26 * dt);
  }

  if (p.dashCooldown > 0) p.dashCooldown -= dt;

  let vx = moveVec.x * speed;
  let vy = moveVec.y * speed;

  if (p.dashTime > 0) {
    p.dashTime -= dt;
    vx = p.dashVector.x * 6;
    vy = p.dashVector.y * 6;
  }

  const stepX = p.x + vx * dt;
  const stepY = p.y + vy * dt;

  if (canMoveTo(stepX, p.y, PLAYER_RADIUS)) p.x = stepX;
  if (canMoveTo(p.x, stepY, PLAYER_RADIUS)) p.y = stepY;

  const tile = state.map[Math.floor(p.y)]?.[Math.floor(p.x)];
  if (tile === 8) {
    p.hasKey = true;
    state.map[Math.floor(p.y)][Math.floor(p.x)] = 0;
    pushMessage("Key acquired. Exit unlocked.", 1.5);
  }

  if (tile === 5) {
    p.speedBuff = Math.max(p.speedBuff, 2.2);
    state.map[Math.floor(p.y)][Math.floor(p.x)] = 0;
    pushMessage("Overdrive pad! Movement boosted.", 1.8);
  }

  if (tile === 7) {
    if (p.health < 100) {
      const healFraction = 0.25 + Math.random() * 0.25;
      const healAmount = Math.round(100 * healFraction);
      const before = p.health;
      p.health = Math.min(100, p.health + healAmount);
      state.map[Math.floor(p.y)][Math.floor(p.x)] = 0;
      pushMessage(`Medkit +${Math.ceil(p.health - before)} HP`, 1.6);
    }
  }

  if (isExit(p.x, p.y)) {
    if (!p.hasKey) {
      pushMessage("Exit locked. Find the key.", 1.2);
    } else {
      state.levelIndex += 1;
      if (state.levelIndex >= LEVELS.length) {
        state.running = false;
        showOverlay("Citadel Cleared! Press Enter to restart");
      } else {
        parseLevel(state.levelIndex);
      }
    }
  }

  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  p.recoil = Math.max(0, p.recoil - dt * 3.3);

  const bobMagnitude = moving ? (sprinting ? 0.04 : 0.025) : 0;
  p.bobT += dt * (moving ? speed : 1.5);
  p.bob = Math.sin(p.bobT * 9) * bobMagnitude;
}

function updateDoors(dt) {
  const p = state.player;
  for (const door of state.doors.values()) {
    const centerX = door.x + 0.5;
    const centerY = door.y + 0.5;

    if (door.moving < 0) {
      if (Math.hypot(p.x - centerX, p.y - centerY) < 0.65) {
        door.moving = 0;
        door.holdTimer = 1.2;
        continue;
      }
      let blocked = false;
      for (const e of state.enemies) {
        if (Math.hypot(e.x - centerX, e.y - centerY) < 0.55) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        door.moving = 0;
        door.holdTimer = 1.2;
        continue;
      }
    }

    if (door.moving !== 0) {
      door.open += door.moving * dt * 2.2;
      if (door.open >= 1) {
        door.open = 1;
        door.moving = 0;
        if (door.holdTimer <= 0) door.holdTimer = 6.5;
      } else if (door.open <= 0) {
        door.open = 0;
        door.moving = 0;
      }
      continue;
    }

    if (door.open >= 1 && door.holdTimer > 0) {
      door.holdTimer -= dt;
      if (door.holdTimer <= 0) {
        door.moving = -1;
      }
    }
  }
}

function tileWalkable(x, y) {
  if (!(x >= 0 && y >= 0 && x < state.mapW && y < state.mapH)) return false;
  const tile = state.map[y][x];
  if (tile === 1) return false;
  if (tile === 6) return isDoorOpenEnough(getDoorAt(x, y));
  return true;
}

function findPath(startX, startY, goalX, goalY) {
  const q = [[startX, startY]];
  const key = (x, y) => `${x},${y}`;
  const from = new Map();
  from.set(key(startX, startY), null);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (q.length) {
    const [x, y] = q.shift();
    if (x === goalX && y === goalY) break;

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (!tileWalkable(nx, ny)) continue;
      const k = key(nx, ny);
      if (from.has(k)) continue;
      from.set(k, [x, y]);
      q.push([nx, ny]);
    }
  }

  const endKey = key(goalX, goalY);
  if (!from.has(endKey)) return [];

  const path = [];
  let node = [goalX, goalY];
  while (node) {
    path.push(node);
    node = from.get(key(node[0], node[1]));
  }
  path.reverse();
  return path.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
}

function makePatrolRoute(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  const route = [{ x: gx + 0.5, y: gy + 0.5 }];
  const offsets = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [2, 0],
    [0, 2],
    [-2, 0],
    [0, -2],
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];

  for (const [ox, oy] of offsets) {
    const tx = gx + ox;
    const ty = gy + oy;
    if (tileWalkable(tx, ty)) {
      route.push({ x: tx + 0.5, y: ty + 0.5 });
      if (route.length >= 4) break;
    }
  }

  if (route.length < 2) {
    for (let r = 1; r <= 4 && route.length < 3; r += 1) {
      for (let yy = gy - r; yy <= gy + r && route.length < 3; yy += 1) {
        for (let xx = gx - r; xx <= gx + r && route.length < 3; xx += 1) {
          if (xx === gx && yy === gy) continue;
          if (!tileWalkable(xx, yy)) continue;
          const path = findPath(gx, gy, xx, yy);
          if (path.length > 1) {
            route.push({ x: xx + 0.5, y: yy + 0.5 });
          }
        }
      }
    }
  }

  return route;
}

function updateEnemies(dt) {
  const p = state.player;

  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const e = state.enemies[i];
    e.repathTimer -= dt;
    e.fireCooldown -= dt;
    e.hurtTimer = Math.max(0, e.hurtTimer - dt);
    e.alertTimer = Math.max(0, e.alertTimer - dt);

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy);
    const los = hasLineOfSight(e.x, e.y, p.x, p.y);

    if (los && dist < 9.5) {
      e.alerted = true;
      e.alertTimer = 3.4;
    } else if (e.alertTimer <= 0) {
      e.alerted = false;
    }

    let target = null;
    let speed = 0.45;

    if (e.alerted) {
      if (e.repathTimer <= 0) {
        const sx = Math.floor(e.x);
        const sy = Math.floor(e.y);
        const gx = Math.floor(p.x);
        const gy = Math.floor(p.y);
        e.path = findPath(sx, sy, gx, gy);
        e.pathIndex = Math.min(1, e.path.length - 1);
        e.repathTimer = 0.32;
      }

      speed = dist < 2.2 ? 0.65 : 1.35;
      if (e.path.length > 1 && e.pathIndex >= 0) {
        target = e.path[e.pathIndex];
      }
    } else if (e.patrolRoute.length > 0) {
      if (e.patrolTarget >= e.patrolRoute.length) e.patrolTarget = 0;
      target = e.patrolRoute[e.patrolTarget];
    }

    if (target) {
      const tx = target.x - e.x;
      const ty = target.y - e.y;
      const len = Math.hypot(tx, ty);
      if (len < 0.12) {
        if (e.alerted && e.pathIndex < e.path.length - 1) {
          e.pathIndex += 1;
        } else if (!e.alerted && e.patrolRoute.length > 1) {
          e.patrolTarget = (e.patrolTarget + 1) % e.patrolRoute.length;
          e.patrolStuckTimer = 0;
        }
      } else if (len >= 0.01) {
        const prevX = e.x;
        const prevY = e.y;
        const mx = (tx / len) * speed;
        const my = (ty / len) * speed;
        const nx = e.x + mx * dt;
        const ny = e.y + my * dt;
        if (canMoveTo(nx, e.y, ENEMY_RADIUS)) e.x = nx;
        if (canMoveTo(e.x, ny, ENEMY_RADIUS)) e.y = ny;

        if (!e.alerted && e.patrolRoute.length > 1) {
          const moved = Math.hypot(e.x - prevX, e.y - prevY) > 0.002;
          if (moved) {
            e.patrolStuckTimer = 0;
          } else {
            e.patrolStuckTimer += dt;
            if (e.patrolStuckTimer > 0.55) {
              e.patrolTarget = (e.patrolTarget + 1) % e.patrolRoute.length;
              e.patrolStuckTimer = 0;
            }
          }
        }
      }
    }

    if (e.alerted && los && dist < 8.5 && e.fireCooldown <= 0) {
      const baseA = Math.atan2(dy, dx);
      const spread = (Math.random() - 0.5) * 0.18;
      fireProjectile("enemy", e.x, e.y, baseA + spread, 6.5, 9);
      e.fireCooldown = 0.85 + Math.random() * 0.45;
    }

    if (e.health <= 0) {
      state.corpses.push({ x: e.x, y: e.y });
      state.enemies.splice(i, 1);
      state.killCount += 1;
      state.levelKills += 1;
      pushMessage("Hostile down", 0.8);
    }
  }
}

function updateProjectiles(dt) {
  const p = state.player;

  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const b = state.projectiles[i];
    b.ttl -= dt;
    if (b.ttl <= 0) {
      state.projectiles.splice(i, 1);
      continue;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (isWall(b.x, b.y)) {
      state.projectiles.splice(i, 1);
      continue;
    }

    if (b.owner === "player") {
      for (const e of state.enemies) {
        if (Math.hypot(e.x - b.x, e.y - b.y) < ENEMY_RADIUS) {
          e.health -= b.damage;
          e.hurtTimer = 0.15;
          spawnWallSplat(e.x, e.y, b.vx, b.vy);
          state.projectiles.splice(i, 1);
          break;
        }
      }
    } else {
      if (Math.hypot(p.x - b.x, p.y - b.y) < PLAYER_RADIUS) {
        p.health -= b.damage;
        state.projectiles.splice(i, 1);
        pushMessage("You are hit!", 0.5);
        if (p.health <= 0) {
          state.running = false;
          showOverlay("You were neutralized. Press Enter to restart");
        }
      }
    }
  }
}

function spawnWallSplat(x, y, vx, vy) {
  const mag = Math.hypot(vx, vy);
  if (mag < 0.0001) return;
  const dx = vx / mag;
  const dy = vy / mag;

  let px = x;
  let py = y;
  for (let t = 0; t < 10; t += 0.04) {
    px += dx * 0.04;
    py += dy * 0.04;
    if (isWall(px, py)) {
      const mapX = Math.floor(px);
      const mapY = Math.floor(py);
      state.wallSplats.push({
        mapX,
        mapY,
        ux: px - mapX,
        uy: py - mapY,
        v: 0.35 + Math.random() * 0.35,
        radius: 0.06 + Math.random() * 0.04,
        alpha: 0.55 + Math.random() * 0.3,
      });
      if (state.wallSplats.length > 80) state.wallSplats.shift();
      return;
    }
  }
}

function castRay(rayAngle) {
  const p = state.player;
  let mapX = Math.floor(p.x);
  let mapY = Math.floor(p.y);

  const rayDirX = Math.cos(rayAngle);
  const rayDirY = Math.sin(rayAngle);

  const deltaDistX = Math.abs(1 / (rayDirX || 0.0001));
  const deltaDistY = Math.abs(1 / (rayDirY || 0.0001));

  let stepX;
  let stepY;
  let sideDistX;
  let sideDistY;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (p.x - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - p.x) * deltaDistX;
  }

  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (p.y - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - p.y) * deltaDistY;
  }

  let side = 0;
  let hit = false;
  let dist = 0;
  let tile = 1;
  let wallX = 0;

  while (!hit && dist < MAX_RAY_DIST) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }

    tile = state.map[mapY]?.[mapX] ?? 1;
    if (tile === 1 || tile === 2) hit = true;
    if (tile === 6) {
      const door = getDoorAt(mapX, mapY);
      if (!door) {
        hit = true;
      } else if (!isDoorOpenEnough(door)) {
        hit = true;
      }
    }

    if (side === 0) {
      dist = (mapX - p.x + (1 - stepX) / 2) / (rayDirX || 0.0001);
    } else {
      dist = (mapY - p.y + (1 - stepY) / 2) / (rayDirY || 0.0001);
    }
  }

  if (side === 0) {
    wallX = p.y + dist * rayDirY;
  } else {
    wallX = p.x + dist * rayDirX;
  }
  wallX -= Math.floor(wallX);

  return {
    dist: Math.max(0.01, dist),
    side,
    tile,
    wallX,
    mapX,
    mapY,
  };
}

function render3D() {
  const p = state.player;
  const horizon = H / 2 + p.bob * 100;
  const horizonY = Math.max(0, Math.floor(horizon));

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(1, COLORS.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizonY);

  const floorTex = getFloorTexture();
  const leftRayX = Math.cos(p.angle - HALF_FOV);
  const leftRayY = Math.sin(p.angle - HALF_FOV);
  const rightRayX = Math.cos(p.angle + HALF_FOV);
  const rightRayY = Math.sin(p.angle + HALF_FOV);

  for (let y = horizonY; y < H; y += FLOOR_SAMPLE_Y) {
    const rowDist = (0.5 * H) / (y - horizon + 0.0001);
    let floorX = p.x + rowDist * leftRayX;
    let floorY = p.y + rowDist * leftRayY;
    const stepX = (rowDist * (rightRayX - leftRayX)) / W;
    const stepY = (rowDist * (rightRayY - leftRayY)) / W;
    const shade = Math.min(0.75, rowDist / 9.5);

    for (let x = 0; x < W; x += FLOOR_SAMPLE_X) {
      const tx = Math.floor((floorX - Math.floor(floorX)) * TEX_SIZE) & (TEX_SIZE - 1);
      const ty = Math.floor((floorY - Math.floor(floorY)) * TEX_SIZE) & (TEX_SIZE - 1);
      const [r, g, b] = getTexturePixel(floorTex, tx, ty);
      ctx.fillStyle = `rgb(${Math.floor(r * (1 - shade))}, ${Math.floor(g * (1 - shade))}, ${Math.floor(b * (1 - shade))})`;
      ctx.fillRect(x, y, FLOOR_SAMPLE_X, FLOOR_SAMPLE_Y);
      floorX += stepX * FLOOR_SAMPLE_X;
      floorY += stepY * FLOOR_SAMPLE_X;
    }
  }

  const zBuffer = new Array(RAY_COUNT);

  for (let i = 0; i < RAY_COUNT; i += 1) {
    const rayAngle = p.angle - HALF_FOV + (i / RAY_COUNT) * FOV;
    const ray = castRay(rayAngle);
    const dist = ray.dist * Math.cos(rayAngle - p.angle);
    zBuffer[i] = dist;

    const wallHeight = Math.min(H * 2, (H / dist) * 0.95);
    const top = Math.floor(horizon - wallHeight / 2);
    const tex = getWallTexture(ray.mapX, ray.mapY, ray.tile);
    let texX = Math.floor(ray.wallX * TEX_SIZE) % TEX_SIZE;
    if (ray.tile === 6) {
      const door = getDoorAt(ray.mapX, ray.mapY);
      if (door) {
        texX = Math.floor((ray.wallX + door.open) * TEX_SIZE) % TEX_SIZE;
      }
    }
    ctx.drawImage(
      tex.canvas,
      texX,
      0,
      1,
      TEX_SIZE,
      i * RENDER_STRIP,
      top,
      RENDER_STRIP + 1,
      wallHeight
    );

    const shade = Math.min(0.75, dist / 13 + (ray.side ? 0.16 : 0));
    ctx.fillStyle = `rgba(2, 6, 23, ${shade})`;
    ctx.fillRect(i * RENDER_STRIP, top, RENDER_STRIP + 1, wallHeight);

    for (const splat of state.wallSplats) {
      if (splat.mapX !== ray.mapX || splat.mapY !== ray.mapY) continue;
      const du = Math.min(Math.abs(ray.wallX - splat.ux), Math.abs(ray.wallX - splat.uy));
      if (du > splat.radius) continue;
      const splatTop = top + wallHeight * (splat.v - splat.radius * 0.7);
      const splatHeight = wallHeight * splat.radius * 1.5;
      ctx.fillStyle = `rgba(120, 8, 8, ${splat.alpha})`;
      ctx.fillRect(i * RENDER_STRIP, splatTop, RENDER_STRIP + 1, splatHeight);
      ctx.fillStyle = `rgba(50, 0, 0, ${Math.min(0.7, splat.alpha + 0.1)})`;
      ctx.fillRect(i * RENDER_STRIP, splatTop + splatHeight * 0.7, RENDER_STRIP + 1, splatHeight * 0.25);
    }
  }

  renderSprites(zBuffer);
}

function renderSprites(zBuffer) {
  const p = state.player;
  const sprites = [];

  for (const e of state.enemies) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.hypot(dx, dy);
    const rel = angleDiff(Math.atan2(dy, dx), p.angle);
    if (Math.abs(rel) > HALF_FOV + 0.3) continue;
    sprites.push({
      kind: "enemy",
      dist,
      rel,
      hurt: e.hurtTimer > 0,
    });
  }

  for (const b of state.projectiles) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const dist = Math.hypot(dx, dy);
    const rel = angleDiff(Math.atan2(dy, dx), p.angle);
    if (Math.abs(rel) > HALF_FOV + 0.3) continue;
    sprites.push({ kind: b.owner === "player" ? "pbullet" : "ebullet", dist, rel });
  }

  for (const c of state.corpses) {
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const dist = Math.hypot(dx, dy);
    const rel = angleDiff(Math.atan2(dy, dx), p.angle);
    if (Math.abs(rel) > HALF_FOV + 0.35) continue;
    sprites.push({ kind: "corpse", dist, rel });
  }

  for (let y = 0; y < state.mapH; y += 1) {
    for (let x = 0; x < state.mapW; x += 1) {
      if (state.map[y][x] !== 8) continue;
      const sx = x + 0.5;
      const sy = y + 0.5;
      const dx = sx - p.x;
      const dy = sy - p.y;
      const dist = Math.hypot(dx, dy);
      const rel = angleDiff(Math.atan2(dy, dx), p.angle);
      if (Math.abs(rel) > HALF_FOV + 0.35) continue;
      sprites.push({ kind: "key", dist, rel });
    }
  }

  sprites.sort((a, b) => b.dist - a.dist);

  for (const s of sprites) {
    const screenX = (0.5 + s.rel / FOV) * W;
    const size = Math.max(4, (H / s.dist) * (s.kind.includes("bullet") ? 0.11 : s.kind === "corpse" ? 0.36 : s.kind === "key" ? 0.3 : 0.5));
    const y = H / 2 - size / 2 + p.bob * 100;

    const leftCol = Math.floor((screenX - size / 2) / RENDER_STRIP);
    const rightCol = Math.floor((screenX + size / 2) / RENDER_STRIP);
    let visible = false;
    for (let c = Math.max(0, leftCol); c <= Math.min(RAY_COUNT - 1, rightCol); c += 1) {
      if (s.dist < zBuffer[c]) {
        visible = true;
        break;
      }
    }
    if (!visible) continue;

    if (s.kind === "enemy") {
      ctx.fillStyle = s.hurt ? COLORS.enemyHit : COLORS.enemy;
      ctx.fillRect(screenX - size / 2, y, size, size * 1.2);
      ctx.fillStyle = "#111827";
      ctx.fillRect(screenX - size * 0.2, y + size * 0.35, size * 0.12, size * 0.12);
      ctx.fillRect(screenX + size * 0.08, y + size * 0.35, size * 0.12, size * 0.12);
    } else if (s.kind === "corpse") {
      const corpseY = y + size * 1.05;
      ctx.fillStyle = "rgba(95, 6, 6, 0.65)";
      ctx.fillRect(screenX - size * 0.55, corpseY, size * 1.1, size * 0.22);
      ctx.fillStyle = "#5b1f1f";
      ctx.fillRect(screenX - size * 0.42, corpseY - size * 0.24, size * 0.84, size * 0.3);
      ctx.fillStyle = "#3f1515";
      ctx.fillRect(screenX - size * 0.2, corpseY - size * 0.16, size * 0.4, size * 0.12);
    } else if (s.kind === "key") {
      const keyY = y + size * 0.55;
      ctx.fillStyle = "#facc15";
      ctx.fillRect(screenX - size * 0.16, keyY, size * 0.32, size * 0.62);
      ctx.fillRect(screenX - size * 0.34, keyY + size * 0.08, size * 0.68, size * 0.2);
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(screenX - size * 0.1, keyY + size * 0.42, size * 0.2, size * 0.2);
    } else {
      ctx.fillStyle = s.kind === "pbullet" ? COLORS.playerBullet : COLORS.enemyBullet;
      ctx.beginPath();
      ctx.arc(screenX, y + size / 2, size * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function renderWeapon() {
  const p = state.player;
  const bobX = Math.floor(Math.sin(p.bobT * 9) * 8);
  const bobY = Math.floor(Math.abs(Math.sin(p.bobT * 9)) * 6);
  const recoilY = Math.floor(p.recoil * 95);

  const gunW = 228;
  const gunH = 120;
  const x = Math.floor(W / 2 - gunW / 2 + bobX);
  const y = Math.floor(H - gunH + bobY + recoilY);

  ctx.fillStyle = "rgba(2, 6, 23, 0.48)";
  ctx.fillRect(x - 18, y + 24, gunW + 36, gunH + 16);

  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 58, y + 10, 112, 52);

  ctx.fillStyle = "#374151";
  ctx.fillRect(x + 50, y + 20, 128, 56);
  ctx.fillRect(x + 18, y + 52, 192, 48);

  ctx.fillStyle = "#6b7280";
  ctx.fillRect(x + 68, y + 30, 96, 24);
  ctx.fillRect(x + 30, y + 64, 168, 26);

  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(x + 102, y + 35, 28, 8);
  ctx.fillRect(x + 118, y + 44, 8, 8);

  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(x + 206, y + 58, 22, 26);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(x + 210, y + 64, 14, 14);
}

function renderHud(targetCtx = ctx) {
  const p = state.player;
  const barW = 220;
  let medkitsLeft = 0;
  let boostsLeft = 0;
  for (let y = 0; y < state.mapH; y += 1) {
    for (let x = 0; x < state.mapW; x += 1) {
      const t = state.map[y][x];
      if (t === 7) medkitsLeft += 1;
      else if (t === 5) boostsLeft += 1;
    }
  }

  targetCtx.fillStyle = "rgba(2, 6, 23, 0.65)";
  targetCtx.fillRect(12, 12, 290, 105);

  targetCtx.fillStyle = "#e5e7eb";
  targetCtx.font = "16px Trebuchet MS";
  targetCtx.fillText(state.levelName, 20, 34);

  targetCtx.font = "14px Trebuchet MS";
  targetCtx.fillText(`HP: ${Math.max(0, Math.ceil(p.health))}`, 20, 56);
  targetCtx.fillText(`Enemies: ${state.enemies.length}`, 20, 78);
  targetCtx.fillText(`Total Kills: ${state.killCount}`, 20, 100);

  targetCtx.fillStyle = "#111827";
  targetCtx.fillRect(135, 46, barW, 11);
  targetCtx.fillRect(135, 64, barW, 11);

  targetCtx.fillStyle = "#ef4444";
  targetCtx.fillRect(135, 46, (Math.max(0, p.health) / 100) * barW, 11);

  targetCtx.fillStyle = "#22d3ee";
  targetCtx.fillRect(135, 64, (p.stamina / p.staminaMax) * barW, 11);

  targetCtx.fillStyle = "#e5e7eb";
  targetCtx.fillText("Health", 360, 55);
  targetCtx.fillText("Stamina", 360, 73);

  const cd = Math.max(0, p.dashCooldown);
  targetCtx.fillText(`Dash: ${cd <= 0 ? "Ready" : cd.toFixed(1) + "s"}`, 20, 121);

  // Additional always-visible status display.
  targetCtx.fillStyle = "rgba(2, 6, 23, 0.65)";
  targetCtx.fillRect(12, H - 98, 315, 86);
  targetCtx.fillStyle = "#e5e7eb";
  targetCtx.font = "14px Trebuchet MS";
  targetCtx.fillText(`Objective: ${p.hasKey ? "Reach Exit" : "Find Key"}`, 20, H - 72);
  targetCtx.fillText(`Key: ${p.hasKey ? "Collected" : "Missing"}`, 20, H - 50);
  targetCtx.fillText(`Medkits Left: ${medkitsLeft}   Boosts Left: ${boostsLeft}`, 20, H - 28);

  targetCtx.strokeStyle = "rgba(255,255,255,0.65)";
  targetCtx.beginPath();
  targetCtx.moveTo(W / 2 - 8, H / 2);
  targetCtx.lineTo(W / 2 + 8, H / 2);
  targetCtx.moveTo(W / 2, H / 2 - 8);
  targetCtx.lineTo(W / 2, H / 2 + 8);
  targetCtx.stroke();
}

function renderMinimap(targetCtx = ctx) {
  const scale = 5;
  const ox = W - state.mapW * scale - 14;
  const oy = 14;

  targetCtx.fillStyle = "rgba(2, 6, 23, 0.65)";
  targetCtx.fillRect(ox - 6, oy - 6, state.mapW * scale + 12, state.mapH * scale + 12);

  for (let y = 0; y < state.mapH; y += 1) {
    for (let x = 0; x < state.mapW; x += 1) {
      const t = state.map[y][x];
      if (t === 1) targetCtx.fillStyle = "#475569";
      else if (t === 2) targetCtx.fillStyle = "#22c55e";
      else if (t === 8) targetCtx.fillStyle = "#fde047";
      else if (t === 6) {
        const door = getDoorAt(x, y);
        targetCtx.fillStyle = door && door.open > 0.85 ? "#b45309" : "#facc15";
      }
      else if (t === 7) targetCtx.fillStyle = COLORS.medkit;
      else if (t === 5) targetCtx.fillStyle = COLORS.booster;
      else targetCtx.fillStyle = "#0b1220";
      targetCtx.fillRect(ox + x * scale, oy + y * scale, scale - 1, scale - 1);
    }
  }

  targetCtx.fillStyle = "#ef4444";
  for (const e of state.enemies) {
    targetCtx.fillRect(ox + e.x * scale - 2, oy + e.y * scale - 2, 4, 4);
  }

  targetCtx.fillStyle = "#fbbf24";
  targetCtx.beginPath();
  targetCtx.arc(ox + state.player.x * scale, oy + state.player.y * scale, 3, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.strokeStyle = "#fbbf24";
  targetCtx.beginPath();
  targetCtx.moveTo(ox + state.player.x * scale, oy + state.player.y * scale);
  targetCtx.lineTo(
    ox + (state.player.x + Math.cos(state.player.angle) * 1.2) * scale,
    oy + (state.player.y + Math.sin(state.player.angle) * 1.2) * scale
  );
  targetCtx.stroke();
}

function renderMessages(dt, targetCtx = ctx) {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    state.messages[i].ttl -= dt;
    if (state.messages[i].ttl <= 0) state.messages.splice(i, 1);
  }

  if (!state.messages.length) return;
  targetCtx.font = "18px Trebuchet MS";
  targetCtx.fillStyle = "rgba(17, 24, 39, 0.65)";
  targetCtx.fillRect(W / 2 - 210, 12, 420, 36);
  targetCtx.fillStyle = "#f8fafc";
  targetCtx.textAlign = "center";
  targetCtx.fillText(state.messages[state.messages.length - 1].text, W / 2, 35);
  targetCtx.textAlign = "start";
}

function update(dt) {
  if (!state.running) return;

  updateDoors(dt);
  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
}

function render(dt) {
  ctx.clearRect(0, 0, W, H);
  render3D();
  renderWeapon();

  pixelCtx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);
  pixelCtx.drawImage(sceneCanvas, 0, 0, pixelCanvas.width, pixelCanvas.height);
  displayCtx.clearRect(0, 0, W, H);
  displayCtx.drawImage(pixelCanvas, 0, 0, W, H);
  renderHud(displayCtx);
  renderMinimap(displayCtx);
  renderMessages(dt, displayCtx);
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  render(dt);

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;

  if (e.code === "KeyF") onPlayerShot();
  if (e.code === "KeyE") {
    tryOpenDoor();
  }

  if (e.code === "Enter" && !state.running) {
    resetGame(true);
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

canvas.addEventListener("click", () => {
  if (!mouseLocked) {
    canvas.requestPointerLock();
  }
  onPlayerShot();
});

document.addEventListener("pointerlockchange", () => {
  mouseLocked = document.pointerLockElement === canvas;
});

window.addEventListener("mousemove", (e) => {
  if (!mouseLocked || !state.running) return;
  state.player.angle += e.movementX * 0.0024;
});

function isPassableTileChar(ch) {
  return ch !== "1";
}

function widenNarrowCorridors(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const toOpen = [];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      if (grid[y][x] !== "1") continue;
      const l = isPassableTileChar(grid[y][x - 1]);
      const r = isPassableTileChar(grid[y][x + 1]);
      const u = isPassableTileChar(grid[y - 1][x]);
      const d = isPassableTileChar(grid[y + 1][x]);
      if ((l && r) || (u && d)) {
        toOpen.push({ x, y });
      }
    }
  }
  for (const c of toOpen) {
    if (grid[c.y][c.x] === "1") grid[c.y][c.x] = "0";
  }
}

function countNonWallTiles(grid) {
  let count = 0;
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] !== "1") count += 1;
    }
  }
  return count;
}

function expandFloorspaceNaturally(grid, multiplier = 1.75) {
  const h = grid.length;
  const w = grid[0].length;
  const base = countNonWallTiles(grid);
  const interiorCap = Math.floor((w - 2) * (h - 2) * 0.7);
  const target = Math.min(Math.floor(base * multiplier), interiorCap);

  let current = base;
  for (let pass = 0; pass < 7 && current < target; pass += 1) {
    const candidates = [];
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        if (grid[y][x] !== "1") continue;

        const l = isPassableTileChar(grid[y][x - 1]) ? 1 : 0;
        const r = isPassableTileChar(grid[y][x + 1]) ? 1 : 0;
        const u = isPassableTileChar(grid[y - 1][x]) ? 1 : 0;
        const d = isPassableTileChar(grid[y + 1][x]) ? 1 : 0;
        const n = l + r + u + d;
        if (n < 2 || n > 3) continue;

        // Favor walls that connect open lanes without hollowing entire blocks.
        const corridorLike = (l && r) || (u && d);
        const score = (corridorLike ? 4 : 2) + ((x * 7 + y * 11 + pass) % 5);
        candidates.push({ x, y, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const openBudget = Math.min(candidates.length, Math.max(8, Math.floor((target - current) * 0.45)));
    for (let i = 0; i < openBudget && current < target; i += 1) {
      const c = candidates[i];
      if (grid[c.y][c.x] === "1") {
        grid[c.y][c.x] = "0";
        current += 1;
      }
    }
  }
}

function roomCanBePlaced(grid, room) {
  const h = grid.length;
  const w = grid[0].length;
  if (room.x < 1 || room.y < 1 || room.x + room.w > w - 1 || room.y + room.h > h - 1) return false;

  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      const t = grid[y][x];
      if (t === "2" || t === "3") return false;
    }
  }

  return true;
}

function carveRoomWithDoors(grid, room) {
  if (!roomCanBePlaced(grid, room)) return null;

  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      const border = x === room.x || x === room.x + room.w - 1 || y === room.y || y === room.y + room.h - 1;
      grid[y][x] = border ? "1" : "0";
    }
  }

  const midX = room.x + Math.floor(room.w / 2);
  const midY = room.y + Math.floor(room.h / 2);
  if (room.doorAxis === "horizontal") {
    grid[midY][room.x] = "6";
    grid[midY][room.x + room.w - 1] = "6";
    if (room.x - 1 > 0) grid[midY][room.x - 1] = "0";
    if (room.x + room.w < grid[0].length - 1) grid[midY][room.x + room.w] = "0";
  } else {
    grid[room.y][midX] = "6";
    grid[room.y + room.h - 1][midX] = "6";
    if (room.y - 1 > 0) grid[room.y - 1][midX] = "0";
    if (room.y + room.h < grid.length - 1) grid[room.y + room.h][midX] = "0";
  }

  const enemySlots = [
    { x: room.x + 1, y: room.y + 1 },
    { x: room.x + room.w - 2, y: room.y + room.h - 2 },
    { x: room.x + 1, y: room.y + room.h - 2 },
    { x: room.x + room.w - 2, y: room.y + 1 },
  ];
  let placed = 0;
  for (const s of enemySlots) {
    if (placed >= room.enemies) break;
    if (grid[s.y]?.[s.x] === "0") {
      grid[s.y][s.x] = "4";
      placed += 1;
    }
  }

  return {
    x: room.x,
    y: room.y,
    w: room.w,
    h: room.h,
    area: room.w * room.h,
    center: {
      x: room.x + Math.floor(room.w / 2),
      y: room.y + Math.floor(room.h / 2),
    },
  };
}

function addLargeRooms(grid, levelIdx) {
  const rooms = ROOM_BLUEPRINTS[levelIdx % ROOM_BLUEPRINTS.length] || [];
  const placedRooms = [];
  for (const room of rooms) {
    const placed = carveRoomWithDoors(grid, room);
    if (placed) placedRooms.push(placed);
  }
  return placedRooms;
}

function isPassableForReachability(ch) {
  return ch !== "1";
}

function hasPath(grid, start, target) {
  const h = grid.length;
  const w = grid[0].length;
  const visited = Array.from({ length: h }, () => Array(w).fill(false));
  const q = [[start.x, start.y]];
  visited[start.y][start.x] = true;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (q.length) {
    const [x, y] = q.shift();
    if (x === target.x && y === target.y) return true;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (visited[ny][nx]) continue;
      if (!isPassableForReachability(grid[ny][nx])) continue;
      visited[ny][nx] = true;
      q.push([nx, ny]);
    }
  }

  return false;
}

function carveDirectPath(grid, from, to) {
  const h = grid.length;
  const w = grid[0].length;
  let x = from.x;
  let y = from.y;
  while (x !== to.x) {
    x += to.x > x ? 1 : -1;
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) break;
    if (grid[y][x] === "1") grid[y][x] = "0";
  }
  while (y !== to.y) {
    y += to.y > y ? 1 : -1;
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) break;
    if (grid[y][x] === "1") grid[y][x] = "0";
  }
}

function ensureCriticalConnectivity(grid, spawn, key, exitPos) {
  if (key && !hasPath(grid, spawn, key)) {
    carveDirectPath(grid, spawn, key);
  }
  if (exitPos) {
    const from = key || spawn;
    if (!hasPath(grid, from, exitPos)) {
      carveDirectPath(grid, from, exitPos);
    }
  }
}

function carveSpawnStartRoom(grid, spawnX, spawnY) {
  const h = grid.length;
  const w = grid[0].length;

  const roomCx = Math.min(Math.max(spawnX, 2), w - 3);
  const roomCy = Math.min(Math.max(spawnY, 2), h - 3);

  // 5x5 shell with 3x3 interior for a safe starter room.
  for (let y = roomCy - 2; y <= roomCy + 2; y += 1) {
    for (let x = roomCx - 2; x <= roomCx + 2; x += 1) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const border = x === roomCx - 2 || x === roomCx + 2 || y === roomCy - 2 || y === roomCy + 2;
      grid[y][x] = border ? "1" : "0";
    }
  }

  const doorOptions = [
    { dx: 2, dy: 0, odx: 3, ody: 0 },
    { dx: -2, dy: 0, odx: -3, ody: 0 },
    { dx: 0, dy: 2, odx: 0, ody: 3 },
    { dx: 0, dy: -2, odx: 0, ody: -3 },
  ];

  for (const d of doorOptions) {
    const doorX = roomCx + d.dx;
    const doorY = roomCy + d.dy;
    const outX = roomCx + d.odx;
    const outY = roomCy + d.ody;
    if (doorX < 1 || doorY < 1 || doorX >= w - 1 || doorY >= h - 1) continue;
    if (outX < 1 || outY < 1 || outX >= w - 1 || outY >= h - 1) continue;
    grid[doorY][doorX] = "6";
    if (grid[outY][outX] === "1") grid[outY][outX] = "0";
    break;
  }

  grid[roomCy][roomCx] = "3";
  return { x: roomCx, y: roomCy };
}

function doorBetweenWalls(grid, x, y) {
  const up    = grid[y - 1]?.[x] === "1";
  const down  = grid[y + 1]?.[x] === "1";
  const left  = grid[y]?.[x - 1] === "1";
  const right = grid[y]?.[x + 1] === "1";
  // Single-tile door (legacy): walled on exactly two opposite sides.
  if ((left && right && !up && !down) || (up && down && !left && !right)) return true;
  // 2-wide E/W door: this tile (x,y) and partner (x,y+1) form a vertical pair
  // with walls above and below the pair.
  const pairDown = grid[y + 1]?.[x] === "6";
  if (pairDown && grid[y - 1]?.[x] === "1" && grid[y + 2]?.[x] === "1") return true;
  const pairUp = grid[y - 1]?.[x] === "6";
  if (pairUp && grid[y - 2]?.[x] === "1" && grid[y + 1]?.[x] === "1") return true;
  // 2-wide N/S door: this tile (x,y) and partner (x+1,y) form a horizontal pair
  // with walls left and right of the pair.
  const pairRight = grid[y]?.[x + 1] === "6";
  if (pairRight && grid[y]?.[x - 1] === "1" && grid[y]?.[x + 2] === "1") return true;
  const pairLeft = grid[y]?.[x - 1] === "6";
  if (pairLeft && grid[y]?.[x - 2] === "1" && grid[y]?.[x + 1] === "1") return true;
  return false;
}

function sanitizeDoorTiles(grid) {
  for (let y = 1; y < grid.length - 1; y += 1) {
    for (let x = 1; x < grid[y].length - 1; x += 1) {
      if (grid[y][x] !== "6") continue;
      if (!doorBetweenWalls(grid, x, y)) grid[y][x] = "0";
    }
  }
}

// Procedural maze generator using iterative DFS backtracking.
// Each maze cell expands to a 2x2 floor area so all corridors are 2 tiles wide.
// Walls between cells are 1 tile thick, giving the pattern:
//   wall  floor floor  wall  floor floor  wall  ...
function generateMaze(cols, rows, seed) {
  const GW = cols * 3 + 1;
  const GH = rows * 3 + 1;
  const grid = Array.from({ length: GH }, () => Array(GW).fill("1"));
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

  // LCG random number generator seeded per level.
  let s = (seed * 1664525 + 1013904223) >>> 0;
  function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 0) / 0x100000000;
  }

  // Top-left corner of a maze cell in tile coordinates.
  function cx(c) { return c * 3 + 1; }
  function cy(r) { return r * 3 + 1; }

  function carve(c, r) {
    visited[r][c] = true;
    grid[cy(r)][cx(c)]         = "0";
    grid[cy(r)][cx(c) + 1]     = "0";
    grid[cy(r) + 1][cx(c)]     = "0";
    grid[cy(r) + 1][cx(c) + 1] = "0";
  }

  function carvePassage(c, r, dc, dr) {
    if (dc === 1) {
      grid[cy(r)][cx(c) + 2]     = "0";
      grid[cy(r) + 1][cx(c) + 2] = "0";
    } else if (dc === -1) {
      grid[cy(r)][cx(c) - 1]     = "0";
      grid[cy(r) + 1][cx(c) - 1] = "0";
    } else if (dr === 1) {
      grid[cy(r) + 2][cx(c)]     = "0";
      grid[cy(r) + 2][cx(c) + 1] = "0";
    } else {
      grid[cy(r) - 1][cx(c)]     = "0";
      grid[cy(r) - 1][cx(c) + 1] = "0";
    }
  }

  const DIRS = [
    { dc: 1, dr: 0 }, { dc: -1, dr: 0 },
    { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
  ];

  // Iterative DFS — no stack overflow risk on large mazes.
  carve(0, 0);
  const stack = [{ c: 0, r: 0 }];
  while (stack.length > 0) {
    const { c, r } = stack[stack.length - 1];

    // Shuffle directions deterministically from current cell + RNG state.
    const dirs = [...DIRS];
    for (let i = dirs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    let moved = false;
    for (const { dc, dr } of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (visited[nr][nc]) continue;
      carvePassage(c, r, dc, dr);
      carve(nc, nr);
      stack.push({ c: nc, r: nr });
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }

  // Spawn at top-left cell, exit at bottom-right.
  grid[cy(0)][cx(0)] = "3";
  grid[cy(rows - 1) + 1][cx(cols - 1) + 1] = "2";

  return grid;
}

// Add a few speed booster tiles to each level after parsing.
for (let levelIdx = 0; levelIdx < LEVELS.length; levelIdx += 1) {
  const level = LEVELS[levelIdx];
  const mutableRows = generateMaze(MAZE_COLS, MAZE_ROWS, levelIdx * 997 + 1337);
  const placedRooms = [];

  let spawnX = 1;
  let spawnY = 1;
  for (let y = 0; y < mutableRows.length; y += 1) {
    for (let x = 0; x < mutableRows[y].length; x += 1) {
      if (mutableRows[y][x] === "3") {
        mutableRows[y][x] = "0";
        spawnX = x;
        spawnY = y;
      }
    }
  }

  mutableRows[spawnY][spawnX] = "3";

  // Detect 2-wide doorway pairs matching the 2-cell-corridor maze.
  // E/W passage: 2 tiles stacked (x,y)+(x,y+1) with walls above and below the pair.
  // N/S passage: 2 tiles side-by-side (x,y)+(x+1,y) with walls left and right of the pair.
  const doorCandidates = [];
  let exitPos = null;
  for (let y = 1; y < mutableRows.length - 1; y += 1) {
    for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
      if (mutableRows[y][x] === "2") exitPos = { x, y };
    }
  }

  // E/W passage pairs: (x,y) and (x,y+1)
  for (let y = 1; y < mutableRows.length - 2; y += 1) {
    for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
      if (mutableRows[y][x] !== "0" || mutableRows[y + 1][x] !== "0") continue;
      if (mutableRows[y - 1][x] !== "1" || mutableRows[y + 2][x] !== "1") continue;
      // Passage must continue left or right (not a dead-end cap).
      const leftOpen = mutableRows[y][x - 1] === "0" && mutableRows[y + 1][x - 1] === "0";
      const rightOpen = mutableRows[y][x + 1] === "0" && mutableRows[y + 1][x + 1] === "0";
      if (!leftOpen && !rightOpen) continue;
      const distSpawn = Math.abs(x - spawnX) + Math.abs(y - spawnY);
      if (distSpawn <= 4) continue;
      doorCandidates.push({ x, y, paired: { x, y: y + 1 } });
    }
  }

  // N/S passage pairs: (x,y) and (x+1,y)
  for (let y = 1; y < mutableRows.length - 1; y += 1) {
    for (let x = 1; x < mutableRows[y].length - 2; x += 1) {
      if (mutableRows[y][x] !== "0" || mutableRows[y][x + 1] !== "0") continue;
      if (mutableRows[y][x - 1] !== "1" || mutableRows[y][x + 2] !== "1") continue;
      const upOpen = mutableRows[y - 1][x] === "0" && mutableRows[y - 1][x + 1] === "0";
      const downOpen = mutableRows[y + 1][x] === "0" && mutableRows[y + 1][x + 1] === "0";
      if (!upOpen && !downOpen) continue;
      const distSpawn = Math.abs(x - spawnX) + Math.abs(y - spawnY);
      if (distSpawn <= 4) continue;
      doorCandidates.push({ x, y, paired: { x: x + 1, y } });
    }
  }

  const placedDoors = [];
  const maxDoors = 30;
  const doorSectorCols = Math.min(4, Math.max(2, Math.floor((mutableRows[0].length - 2) / 12)));
  const doorSectorRows = Math.min(4, Math.max(2, Math.floor((mutableRows.length - 2) / 12)));
  const doorBuckets = Array.from({ length: doorSectorCols * doorSectorRows }, () => []);
  for (const c of doorCandidates) {
    const sx = Math.min(
      doorSectorCols - 1,
      Math.floor(((c.x - 1) * doorSectorCols) / Math.max(1, mutableRows[0].length - 2))
    );
    const sy = Math.min(
      doorSectorRows - 1,
      Math.floor(((c.y - 1) * doorSectorRows) / Math.max(1, mutableRows.length - 2))
    );
    const bi = sy * doorSectorCols + sx;
    const score = (c.x * 37 + c.y * 19 + levelIdx * 11) % 211;
    doorBuckets[bi].push({ ...c, score });
  }
  for (const b of doorBuckets) b.sort((a, b2) => a.score - b2.score);

  let placedDoorPass = true;
  while (placedDoors.length < maxDoors && placedDoorPass) {
    placedDoorPass = false;
    for (let bi = 0; bi < doorBuckets.length; bi += 1) {
      if (placedDoors.length >= maxDoors) break;
      const bucket = doorBuckets[bi];
      if (!bucket.length) continue;

      const c = bucket.shift();
      let tooClose = false;
      for (const p of placedDoors) {
        const manhattan = Math.abs(c.x - p.x) + Math.abs(c.y - p.y);
        if (manhattan < 3) {
          tooClose = true;
          break;
        }
        if (c.y === p.y && Math.abs(c.x - p.x) <= 3) {
          tooClose = true;
          break;
        }
        if (c.x === p.x && Math.abs(c.y - p.y) <= 3) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        mutableRows[c.y][c.x] = "6";
        if (c.paired) mutableRows[c.paired.y][c.paired.x] = "6";
        placedDoors.push(c);
        placedDoorPass = true;
      }
    }
  }

  const enemySpots = [];
  for (let y = 1; y < mutableRows.length - 1; y += 1) {
    for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
      if (mutableRows[y][x] !== "0") continue;
      const distSpawn = Math.abs(x - spawnX) + Math.abs(y - spawnY);
      if (distSpawn < 14) continue;
      enemySpots.push({ x, y, score: (x * 17 + y * 31 + spawnX * 13 + spawnY * 7) % 101 });
    }
  }
  const enemySectorCols = Math.min(4, Math.max(2, Math.floor((mutableRows[0].length - 2) / 12)));
  const enemySectorRows = Math.min(4, Math.max(2, Math.floor((mutableRows.length - 2) / 12)));
  const enemyBuckets = Array.from({ length: enemySectorCols * enemySectorRows }, () => []);
  for (const s of enemySpots) {
    const sx = Math.min(
      enemySectorCols - 1,
      Math.floor(((s.x - 1) * enemySectorCols) / Math.max(1, mutableRows[0].length - 2))
    );
    const sy = Math.min(
      enemySectorRows - 1,
      Math.floor(((s.y - 1) * enemySectorRows) / Math.max(1, mutableRows.length - 2))
    );
    enemyBuckets[sy * enemySectorCols + sx].push(s);
  }
  for (const b of enemyBuckets) b.sort((a, b2) => a.score - b2.score);

  let extraEnemiesPlaced = 0;
  const usedEnemySpots = [];
  let placedEnemyPass = true;
  while (extraEnemiesPlaced < EXTRA_ENEMIES_PER_LEVEL && placedEnemyPass) {
    placedEnemyPass = false;
    for (let bi = 0; bi < enemyBuckets.length; bi += 1) {
      if (extraEnemiesPlaced >= EXTRA_ENEMIES_PER_LEVEL) break;
      const bucket = enemyBuckets[bi];
      if (!bucket.length) continue;

      const s = bucket.shift();
      let tooClose = false;
      for (const u of usedEnemySpots) {
        if (Math.abs(s.x - u.x) + Math.abs(s.y - u.y) < 4) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      mutableRows[s.y][s.x] = "4";
      usedEnemySpots.push(s);
      extraEnemiesPlaced += 1;
      placedEnemyPass = true;
    }
  }

  let placed = 0;
  const boostMax = 16;
  const bsCols = 4;
  const bsRows = 4;
  const boostBuckets = Array.from({ length: bsCols * bsRows }, () => []);
  for (let y = 1; y < mutableRows.length - 1; y += 1) {
    for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
      if (mutableRows[y][x] !== "0") continue;
      const sx = Math.min(bsCols - 1, Math.floor((x - 1) * bsCols / Math.max(1, mutableRows[0].length - 2)));
      const sy = Math.min(bsRows - 1, Math.floor((y - 1) * bsRows / Math.max(1, mutableRows.length - 2)));
      const score = (x * 53 + y * 41 + levelIdx * 17) % 199;
      boostBuckets[sy * bsCols + sx].push({ x, y, score });
    }
  }
  for (const b of boostBuckets) b.sort((a, b2) => a.score - b2.score);
  for (let pass = 0; pass < 4 && placed < boostMax; pass += 1) {
    for (let bi = 0; bi < boostBuckets.length && placed < boostMax; bi += 1) {
      const bucket = boostBuckets[bi];
      while (bucket.length > 0) {
        const s = bucket.shift();
        if (mutableRows[s.y][s.x] === "0") {
          mutableRows[s.y][s.x] = "5";
          placed += 1;
          break;
        }
      }
    }
  }

  let medkitsPlaced = 0;
  const mkCols = 4;
  const mkRows = 4;
  const medkitBuckets = Array.from({ length: mkCols * mkRows }, () => []);
  for (let y = 1; y < mutableRows.length - 1; y += 1) {
    for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
      if (mutableRows[y][x] !== "0") continue;
      const distSpawn = Math.abs(x - spawnX) + Math.abs(y - spawnY);
      if (distSpawn < 8) continue;
      const sx = Math.min(mkCols - 1, Math.floor((x - 1) * mkCols / Math.max(1, mutableRows[0].length - 2)));
      const sy = Math.min(mkRows - 1, Math.floor((y - 1) * mkRows / Math.max(1, mutableRows.length - 2)));
      const score = (x * 71 + y * 29 + levelIdx * 23) % 251;
      medkitBuckets[sy * mkCols + sx].push({ x, y, score });
    }
  }
  for (const b of medkitBuckets) b.sort((a, b2) => a.score - b2.score);
  for (let pass = 0; pass < 4 && medkitsPlaced < MEDKITS_PER_LEVEL; pass += 1) {
    for (let bi = 0; bi < medkitBuckets.length && medkitsPlaced < MEDKITS_PER_LEVEL; bi += 1) {
      const bucket = medkitBuckets[bi];
      while (bucket.length > 0) {
        const s = bucket.shift();
        if (mutableRows[s.y][s.x] === "0") {
          mutableRows[s.y][s.x] = "7";
          medkitsPlaced += 1;
          break;
        }
      }
    }
  }

  let keyPos = null;
  if (placedRooms.length > 0) {
    placedRooms.sort((a, b) => b.area - a.area);
    const largestRoom = placedRooms[0];
    const cx = largestRoom.center.x;
    const cy = largestRoom.center.y;
    if (mutableRows[cy]?.[cx] === "0") {
      keyPos = { x: cx, y: cy };
    } else {
      const slots = [
        { x: largestRoom.x + 1, y: largestRoom.y + 1 },
        { x: largestRoom.x + largestRoom.w - 2, y: largestRoom.y + 1 },
        { x: largestRoom.x + 1, y: largestRoom.y + largestRoom.h - 2 },
        { x: largestRoom.x + largestRoom.w - 2, y: largestRoom.y + largestRoom.h - 2 },
      ];
      for (const s of slots) {
        if (mutableRows[s.y]?.[s.x] === "0") {
          keyPos = s;
          break;
        }
      }
    }
  }

  if (!keyPos) {
    const minKeyY = Math.floor(mutableRows.length * 0.5);
    const minKeyX = Math.floor(mutableRows[0].length * 0.33);
    let bestDist = -1;
    for (let y = 1; y < mutableRows.length - 1; y += 1) {
      for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
        if (mutableRows[y][x] !== "0") continue;
        if (y < minKeyY && x < minKeyX) continue;
        const distSpawn = Math.abs(x - spawnX) + Math.abs(y - spawnY);
        if (distSpawn < 20) continue;
        if (distSpawn > bestDist) {
          bestDist = distSpawn;
          keyPos = { x, y };
        }
      }
    }
    // Fallback: just use farthest spot if constraints were too strict.
    if (!keyPos) {
      for (let y = 1; y < mutableRows.length - 1; y += 1) {
        for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
          if (mutableRows[y][x] !== "0") continue;
          const distSpawn = Math.abs(x - spawnX) + Math.abs(y - spawnY);
          if (distSpawn > bestDist) {
            bestDist = distSpawn;
            keyPos = { x, y };
          }
        }
      }
    }
  }

  if (keyPos) mutableRows[keyPos.y][keyPos.x] = "8";

  // Keep key meaningfully away from the exit and door tiles.
  if (keyPos && exitPos) {
    const tooCloseToExit = Math.abs(keyPos.x - exitPos.x) + Math.abs(keyPos.y - exitPos.y) < 7;
    const nextToDoor = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => mutableRows[keyPos.y + dy]?.[keyPos.x + dx] === "6");

    if (tooCloseToExit || nextToDoor) {
      mutableRows[keyPos.y][keyPos.x] = "0";
      let replacement = null;
      let bestScore = -1;
      for (let y = 1; y < mutableRows.length - 1; y += 1) {
        for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
          if (mutableRows[y][x] !== "0") continue;
          const de = Math.abs(x - exitPos.x) + Math.abs(y - exitPos.y);
          const ds = Math.abs(x - spawnX) + Math.abs(y - spawnY);
          const nearDoor =
            mutableRows[y][x + 1] === "6" ||
            mutableRows[y][x - 1] === "6" ||
            mutableRows[y + 1][x] === "6" ||
            mutableRows[y - 1][x] === "6";
          if (de < 7 || nearDoor) continue;
          const score = de + ds;
          if (score > bestScore) {
            bestScore = score;
            replacement = { x, y };
          }
        }
      }
      if (!replacement) {
        // Fallback: still prefer distance from exit, even if adjacent to doors.
        let fallbackBest = -1;
        for (let y = 1; y < mutableRows.length - 1; y += 1) {
          for (let x = 1; x < mutableRows[y].length - 1; x += 1) {
            if (mutableRows[y][x] !== "0") continue;
            const de = Math.abs(x - exitPos.x) + Math.abs(y - exitPos.y);
            if (de > fallbackBest) {
              fallbackBest = de;
              replacement = { x, y };
            }
          }
        }
      }

      if (replacement) {
        keyPos = replacement;
        mutableRows[keyPos.y][keyPos.x] = "8";
      }
    }
  }

  ensureCriticalConnectivity(
    mutableRows,
    { x: spawnX, y: spawnY },
    keyPos,
    exitPos
  );

  sanitizeDoorTiles(mutableRows);

  level.map = mutableRows.map((r) => r.join(""));
}

resetGame(true);
requestAnimationFrame(loop);
