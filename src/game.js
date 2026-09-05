// v1: Bob, pissed-off hoodie guy. Walk + idle breath. No bad guys.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

const PLAYER_SIZE = 48;
const PLAYER_SPEED = 300; // sprint. was 220 for the old stroll.

// Both sheets share the same cell size so Bob doesn't hop when he stops.
// Rows: down, right, up, left. Walk has 8 cols, idle has 4.
const SPRITE_CELL_W = 157;
const SPRITE_CELL_H = 160;
const WALK_COLS = 8;
const IDLE_COLS = 3; // stand, dip, lower — ping-pong = fighting-game bounce
const WALK_FPS = 14; // faster cycle = reads as a sprint
const IDLE_FPS = 6; // bounce. slower than sprint, faster than a nap.
const DRAW_H = 104;
const DRAW_W = DRAW_H * (SPRITE_CELL_W / SPRITE_CELL_H);
const DIR_ROW = { down: 0, right: 1, up: 2, left: 3 };

const PISTOL_OFFSET = {
  down: { x: 0.36, y: 0.02 },
  right: { x: 0.44, y: -0.06 },
  up: { x: 0.28, y: 0.02 },
  left: { x: -0.44, y: -0.06 },
};
const AK_OFFSET = {
  down: { x: 0.42, y: 0.02 },
  right: { x: 0.52, y: -0.02 },
  up: { x: 0.18, y: -0.28 },
  left: { x: -0.52, y: -0.02 },
};

const BULLET_LENGTH = 10;
const BULLET_WIDTH = 3;
const BULLET_SPEED = 500;
const AK_COOLDOWN = 0.07; // primary: dump the mag
const PISTOL_COOLDOWN = 1; // secondary: slow poke
const ENEMY_MAX_HP = 6;
const AK_DAMAGE = 1; // 6 AK shots to kill
const PISTOL_DAMAGE = 2; // 3 pistol shots to kill (2+2+2)
const ENEMY_DAMAGE = 1; // 3 shots to drop Bob
const PLAYER_MAX_HP = 3;
const ENEMY_SPEED = 110;
const ENEMY_FIRE_COOLDOWN = 2.2; // looks like an AR, shoots like a musket
const CROUCH_TIME = 0.9; // plant behind cover, then shoot
const STUN_TIME = 0.8;
const SHIELD_STUN = 5;
const HIT_RADIUS = 28;
const SHIELD_RADIUS = 58;
const BARK_TIME = 1.1;
const BOOM_CELL = 192;
const BOOM_COLS = 10;
const BOOM_FPS = 12;
const BOOM_DRAW = 220;
const DROP_CHANCE = 0.5;
const POWER_TIME = 10;
const DASH_SPEED = 900;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 0.7;
const PICK_RADIUS = 32;
const POWER_KINDS = ["damage", "spread", "dash"];
const VEND_COST = 5;
const POTION_HEAL = 1;

const TILE = 48;
const HALL_W = 4;
const WALL = 0;
const FLOOR = 1;
const DOOR = 2;
const ROOM = 3;
const DESK = 4;
const CABINET = 5;
const PLANT = 6;
const VENDING = 7;

const tiles = new Map();
const camera = { x: 0, y: 0 };

const linoleumImg = new Image();
linoleumImg.src = "tiles/linoleum.jpg";
const carpetImg = new Image();
carpetImg.src = "tiles/carpet.jpg";
const wallImg = new Image();
wallImg.src = "tiles/wall.jpg";
let linoleumPat = null;
let carpetPat = null;
let wallPat = null;

function tileKey(tx, ty) {
  return tx + "," + ty;
}

function setTile(tx, ty, kind) {
  tiles.set(tileKey(tx, ty), kind);
}

function getTile(tx, ty) {
  const key = tileKey(tx, ty);
  if (!tiles.has(key)) return null;
  return tiles.get(key);
}

function worldToTile(x, y) {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

function isSolid(kind) {
  return (
    kind === WALL ||
    kind === DESK ||
    kind === CABINET ||
    kind === PLANT ||
    kind === VENDING ||
    kind === null
  );
}

function walkable(kind) {
  return kind === FLOOR || kind === ROOM || kind === DOOR;
}

function blockedAt(x, y) {
  const r = 16;
  const spots = [
    [x - r, y],
    [x + r, y],
    [x, y - r],
    [x, y + r],
  ];
  for (const [px, py] of spots) {
    const { tx, ty } = worldToTile(px, py);
    if (isSolid(getTile(tx, ty))) return true;
  }
  return false;
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function tryWall(tx, ty) {
  if (getTile(tx, ty) === null) setTile(tx, ty, WALL);
}

function facingGrid() {
  if (Math.abs(player.facingX) > Math.abs(player.facingY)) {
    return { dirX: Math.sign(player.facingX), dirY: 0 };
  }
  return { dirX: 0, dirY: Math.sign(player.facingY) || 1 };
}

function hallOriginAt(tx, ty, dirX, dirY) {
  if (dirY === 0) {
    let y = ty;
    while (walkable(getTile(tx, y - 1))) y -= 1;
    return { x: tx, y };
  }
  let x = tx;
  while (walkable(getTile(x - 1, ty))) x -= 1;
  return { x, y: ty };
}

function stampHall(x, y, dirX, dirY) {
  if (dirY === 0) {
    for (let i = 0; i < HALL_W; i++) setTile(x, y + i, FLOOR);
    tryWall(x, y - 1);
    tryWall(x, y + HALL_W);
  } else {
    for (let i = 0; i < HALL_W; i++) setTile(x + i, y, FLOOR);
    tryWall(x - 1, y);
    tryWall(x + HALL_W, y);
  }
}

function stampDoor(x, y, dirX, dirY, side) {
  if (dirY === 0) {
    const dy = side > 0 ? y + HALL_W : y - 1;
    setTile(x, dy, DOOR);
    setTile(x + 1, dy, DOOR);
  } else {
    const dx = side > 0 ? x + HALL_W : x - 1;
    setTile(dx, y, DOOR);
    setTile(dx, y + 1, DOOR);
  }
}

function generateHall(tx, ty, dirX, dirY) {
  let x = tx;
  let y = ty;
  let dx = dirX;
  let dy = dirY;
  const len = randInt(16, 30);
  for (let i = 0; i < len; i++) {
    stampHall(x, y, dx, dy);
    if (i > 4 && i < len - 4 && Math.random() < 0.16) {
      stampDoor(x, y, dx, dy, Math.random() < 0.5 ? 1 : -1);
    }
    if (i > 6 && i < len - 6 && Math.random() < 0.1) {
      const turn = Math.random() < 0.5 ? 1 : -1;
      const ndx = dy * turn;
      const ndy = -dx * turn;
      let bx = x;
      let by = y;
      const stub = randInt(8, 14);
      for (let k = 0; k < stub; k++) {
        stampHall(bx, by, ndx, ndy);
        bx += ndx;
        by += ndy;
      }
    }
    x += dx;
    y += dy;
  }
  if (Math.random() < 0.5) {
    const turn = Math.random() < 0.5 ? 1 : -1;
    const ndx = dy * turn;
    const ndy = -dx * turn;
    const extra = randInt(10, 18);
    for (let i = 0; i < extra; i++) {
      stampHall(x, y, ndx, ndy);
      x += ndx;
      y += ndy;
    }
  }
}

function generateRoom(tx, ty, dirX, dirY) {
  const w = randInt(10, 16);
  const h = randInt(10, 16);
  let ox = tx;
  let oy = ty;
  if (dirX === 1) ox = tx;
  if (dirX === -1) ox = tx - w + 1;
  if (dirY === 1) oy = ty;
  if (dirY === -1) oy = ty - h + 1;
  if (dirX === 0) ox = tx - Math.floor(w / 2);
  if (dirY === 0) oy = ty - Math.floor(h / 2);

  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + w; x++) {
      if (getTile(x, y) !== DOOR) setTile(x, y, ROOM);
    }
  }
  for (let x = ox - 1; x <= ox + w; x++) {
    tryWall(x, oy - 1);
    tryWall(x, oy + h);
  }
  for (let y = oy; y < oy + h; y++) {
    tryWall(ox - 1, y);
    tryWall(ox + w, y);
  }

  const entrance = (x, y) => Math.abs(x - tx) + Math.abs(y - ty) <= 2;

  for (let y = oy + 2; y < oy + h - 2; y += 3) {
    for (let x = ox + 2; x < ox + w - 2; x += 4) {
      if (entrance(x, y)) continue;
      if (getTile(x, y) === DOOR) continue;
      setTile(x, y, DESK);
    }
  }
  const cabWall = dirX !== 0 ? oy + 1 : ox + 1;
  if (dirX !== 0) {
    for (let x = ox + 2; x < ox + w - 2; x += 2) {
      if (entrance(x, cabWall)) continue;
      setTile(x, cabWall, CABINET);
    }
  } else {
    for (let y = oy + 2; y < oy + h - 2; y += 2) {
      if (entrance(cabWall, y)) continue;
      setTile(cabWall, y, CABINET);
    }
  }
  const px = ox + w - 2;
  const py = oy + h - 2;
  if (!entrance(px, py) && getTile(px, py) === ROOM) setTile(px, py, PLANT);

  if (Math.random() < 0.7) placeVendingInRoom(ox, oy, w, h, entrance);

  if (Math.random() < 0.55) {
    const ex = (ox + Math.floor(w / 2)) * TILE + TILE / 2;
    const ey = (oy + Math.floor(h / 2)) * TILE + TILE / 2;
    enemies.push(makeEnemy(ex, ey));
  }
}

function maybeGenerate() {
  const { tx, ty } = worldToTile(player.x, player.y);
  const { dirX, dirY } = facingGrid();
  const here = getTile(tx, ty);
  if (here === DOOR) {
    for (let step = 1; step <= 2; step++) {
      const lookX = tx + dirX * step;
      const lookY = ty + dirY * step;
      if (getTile(lookX, lookY) === null) {
        generateRoom(lookX, lookY, dirX, dirY);
        return;
      }
    }
    return;
  }
  if (here !== FLOOR) return;
  const origin = hallOriginAt(tx, ty, dirX, dirY);
  for (let step = 1; step <= 3; step++) {
    const ox = origin.x + dirX * step;
    const oy = origin.y + dirY * step;
    let empty = true;
    let hitWall = false;
    for (let i = 0; i < HALL_W; i++) {
      const cx = dirY === 0 ? ox : ox + i;
      const cy = dirY === 0 ? oy + i : oy;
      const t = getTile(cx, cy);
      if (t === WALL) hitWall = true;
      if (t !== null) empty = false;
    }
    if (hitWall) return;
    if (empty) {
      generateHall(ox, oy, dirX, dirY);
      return;
    }
  }
}

function generateStart() {
  const y2 = HALL_W + 6;
  for (let x = -30; x <= 30; x++) {
    stampHall(x, 0, 1, 0);
    stampHall(x, y2, 1, 0);
  }
  for (let y = 0; y <= y2; y++) {
    stampHall(-14, y, 0, 1);
    stampHall(14, y, 0, 1);
  }
  stampDoor(-22, 0, 1, 0, -1);
  stampDoor(-6, 0, 1, 0, 1);
  stampDoor(4, 0, 1, 0, -1);
  stampDoor(22, 0, 1, 0, 1);
  stampDoor(-8, y2, 1, 0, 1);
  stampDoor(8, y2, 1, 0, -1);
  setTile(-2, 0, VENDING);
  setTile(6, y2 + HALL_W - 1, VENDING);
}

function placeVendingInRoom(ox, oy, w, h, entrance) {
  const spots = [];
  for (let x = ox + 1; x < ox + w - 1; x++) {
    if (getTile(x, oy) === ROOM && !entrance(x, oy)) spots.push([x, oy]);
    if (getTile(x, oy + h - 1) === ROOM && !entrance(x, oy + h - 1)) {
      spots.push([x, oy + h - 1]);
    }
  }
  for (let y = oy + 1; y < oy + h - 1; y++) {
    if (getTile(ox, y) === ROOM && !entrance(ox, y)) spots.push([ox, y]);
    if (getTile(ox + w - 1, y) === ROOM && !entrance(ox + w - 1, y)) {
      spots.push([ox + w - 1, y]);
    }
  }
  if (!spots.length) return;
  const pick = spots[randInt(0, spots.length - 1)];
  setTile(pick[0], pick[1], VENDING);
}

function ensurePatterns() {
  if (!linoleumPat && linoleumImg.complete && linoleumImg.naturalWidth) {
    linoleumPat = ctx.createPattern(linoleumImg, "repeat");
  }
  if (!carpetPat && carpetImg.complete && carpetImg.naturalWidth) {
    carpetPat = ctx.createPattern(carpetImg, "repeat");
  }
  if (!wallPat && wallImg.complete && wallImg.naturalWidth) {
    wallPat = ctx.createPattern(wallImg, "repeat");
  }
}

function fillWorldPattern(pat, x, y, w, h) {
  if (!pat) return false;
  ctx.save();
  pat.setTransform(new DOMMatrix().translate(-camera.x, -camera.y));
  ctx.fillStyle = pat;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  return true;
}

function drawBaseboards(tx, ty, x, y) {
  const edges = [
    [0, -1, x, y, TILE, 8],
    [0, 1, x, y + TILE - 8, TILE, 8],
    [-1, 0, x, y, 8, TILE],
    [1, 0, x + TILE - 8, y, 8, TILE],
  ];
  ctx.fillStyle = "#4a4036";
  for (const [dx, dy, rx, ry, rw, rh] of edges) {
    if (walkable(getTile(tx + dx, ty + dy))) ctx.fillRect(rx, ry, rw, rh);
  }
}

function drawDesk(x, y) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x + 6, y + 8, TILE - 10, TILE - 10);
  ctx.fillStyle = "#6b4a2b";
  ctx.fillRect(x + 4, y + 6, TILE - 10, TILE - 12);
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(x + 6, y + 8, TILE - 14, TILE - 20);
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(x + TILE / 2 - 8, y + 10, 16, 12);
  ctx.fillStyle = "#3a7ca5";
  ctx.fillRect(x + TILE / 2 - 6, y + 12, 12, 8);
  ctx.fillStyle = "#2a2420";
  ctx.beginPath();
  ctx.arc(x + TILE / 2, y + TILE - 10, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawCabinet(x, y) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x + 8, y + 8, TILE - 12, TILE - 10);
  ctx.fillStyle = "#5c6368";
  ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
  ctx.strokeStyle = "#2f3438";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + TILE / 2, y + 8);
  ctx.lineTo(x + TILE / 2, y + TILE - 8);
  ctx.stroke();
  ctx.fillStyle = "#c9a227";
  ctx.fillRect(x + TILE / 2 - 10, y + TILE / 2 - 2, 4, 4);
  ctx.fillRect(x + TILE / 2 + 6, y + TILE / 2 - 2, 4, 4);
}

function drawPlant(x, y) {
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(x + TILE / 2 - 8, y + TILE - 16, 16, 10);
  ctx.fillStyle = "#2f6b3a";
  ctx.beginPath();
  ctx.arc(x + TILE / 2, y + TILE / 2 - 2, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3f8a4a";
  ctx.beginPath();
  ctx.arc(x + TILE / 2 + 6, y + TILE / 2 - 8, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawVending(x, y) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x + 8, y + 10, TILE - 14, TILE - 12);
  ctx.fillStyle = "#8b1e2d";
  ctx.fillRect(x + 6, y + 2, TILE - 12, TILE - 6);
  ctx.fillStyle = "#241014";
  ctx.fillRect(x + 10, y + 6, TILE - 20, 20);
  const colors = ["#e23b4a", "#3ad17e", "#4ecbff"];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(x + 16 + i * 8, y + 16, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#c9a227";
  ctx.fillRect(x + TILE / 2 - 7, y + 28, 14, 5);
  ctx.fillStyle = "#f0e6d0";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("$5", x + TILE / 2, y + 42);
  ctx.textAlign = "start";
}

function drawDoorTile(x, y) {
  ctx.fillStyle = "#3b2a1c";
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = "#6e4a2e";
  ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
  ctx.fillStyle = "#c4a35a";
  ctx.beginPath();
  ctx.arc(x + TILE - 14, y + TILE / 2, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround() {
  ensurePatterns();
  ctx.fillStyle = "#1c1b18";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startTx = Math.floor(camera.x / TILE) - 1;
  const startTy = Math.floor(camera.y / TILE) - 1;
  const cols = Math.ceil(canvas.width / TILE) + 2;
  const rows = Math.ceil(canvas.height / TILE) + 2;

  for (let ty = startTy; ty < startTy + rows; ty++) {
    for (let tx = startTx; tx < startTx + cols; tx++) {
      const kind = getTile(tx, ty);
      const x = tx * TILE - camera.x;
      const y = ty * TILE - camera.y;
      if (kind === FLOOR) {
        if (!fillWorldPattern(linoleumPat, x, y, TILE, TILE)) {
          ctx.fillStyle = "#d4c7a1";
          ctx.fillRect(x, y, TILE, TILE);
        }
        const inner =
          walkable(getTile(tx - 1, ty)) && walkable(getTile(tx + 1, ty)) ||
          walkable(getTile(tx, ty - 1)) && walkable(getTile(tx, ty + 1));
        if (inner && (tx + ty) % 5 === 0) {
          const g = ctx.createRadialGradient(
            x + TILE / 2,
            y + TILE / 2,
            4,
            x + TILE / 2,
            y + TILE / 2,
            TILE
          );
          g.addColorStop(0, "rgba(255, 244, 210, 0.28)");
          g.addColorStop(1, "rgba(255, 244, 210, 0)");
          ctx.fillStyle = g;
          ctx.fillRect(x, y, TILE, TILE);
        }
      } else if (kind === ROOM) {
        if (!fillWorldPattern(carpetPat, x, y, TILE, TILE)) {
          ctx.fillStyle = "#6a5a4a";
          ctx.fillRect(x, y, TILE, TILE);
        }
      } else if (kind === DOOR) {
        drawDoorTile(x, y);
      } else if (kind === DESK) {
        if (!fillWorldPattern(carpetPat, x, y, TILE, TILE)) {
          ctx.fillStyle = "#6a5a4a";
          ctx.fillRect(x, y, TILE, TILE);
        }
        drawDesk(x, y);
      } else if (kind === CABINET) {
        if (!fillWorldPattern(carpetPat, x, y, TILE, TILE)) {
          ctx.fillStyle = "#6a5a4a";
          ctx.fillRect(x, y, TILE, TILE);
        }
        drawCabinet(x, y);
      } else if (kind === PLANT) {
        if (!fillWorldPattern(carpetPat, x, y, TILE, TILE)) {
          ctx.fillStyle = "#6a5a4a";
          ctx.fillRect(x, y, TILE, TILE);
        }
        drawPlant(x, y);
      } else if (kind === VENDING) {
        const hall =
          getTile(tx - 1, ty) === FLOOR ||
          getTile(tx + 1, ty) === FLOOR ||
          getTile(tx, ty - 1) === FLOOR ||
          getTile(tx, ty + 1) === FLOOR;
        if (hall) {
          if (!fillWorldPattern(linoleumPat, x, y, TILE, TILE)) {
            ctx.fillStyle = "#d4c7a1";
            ctx.fillRect(x, y, TILE, TILE);
          }
        } else if (!fillWorldPattern(carpetPat, x, y, TILE, TILE)) {
          ctx.fillStyle = "#6a5a4a";
          ctx.fillRect(x, y, TILE, TILE);
        }
        drawVending(x, y);
      } else {
        if (!fillWorldPattern(wallPat, x, y, TILE, TILE)) {
          ctx.fillStyle = "#7a7368";
          ctx.fillRect(x, y, TILE, TILE);
        }
        drawBaseboards(tx, ty, x, y);
      }
    }
  }
}

generateStart();

const player = {
  x: TILE * 2,
  y: TILE * 2,
  facingX: 0,
  facingY: 1,
  moving: false,
  stun: 0,
  shield: false,
  weapon: "ak",
  hp: PLAYER_MAX_HP,
  coins: 0,
  potions: 0,
  damageMul: 1,
  damageTime: 0,
  spread: false,
  spreadTime: 0,
  dash: false,
  dashing: 0,
  dashCooldown: 0,
};

const bullets = [];
const pickups = [];
const keys = {};
let toast = "";
let toastTime = 0;
let fireCooldown = 0;
let animTime = 0;
let wasMoving = false;
let dead = false;

const walkSheet = new Image();
walkSheet.src = "bob-walk.png";
const idleSheet = new Image();
idleSheet.src = "bob-idle.png";
const akIdleSheet = new Image();
akIdleSheet.src = "bob-ak-idle.png";
const akWalkSheet = new Image();
akWalkSheet.src = "bob-ak-walk.png";
const shieldIdleSheet = new Image();
shieldIdleSheet.src = "bob-shield-idle.png";
const shieldWalkSheet = new Image();
shieldWalkSheet.src = "bob-shield-walk.png";
const enemyWalkSheet = new Image();
enemyWalkSheet.src = "enemy-walk.png";
const enemyIdleSheet = new Image();
enemyIdleSheet.src = "enemy-idle.png";
const enemyCrouchSheet = new Image();
enemyCrouchSheet.src = "enemy-crouch.png";
const boomSheet = new Image();
boomSheet.src = "boom.png";

function makeEnemy(x, y) {
  return {
    x,
    y,
    facingX: 0,
    facingY: 1,
    moving: false,
    animTime: 0,
    alive: true,
    stun: 0,
    fireCooldown: 1,
    crouch: 0,
    wasMoving: false,
    bark: "",
    barkTime: 0,
    exploding: false,
    explodeTime: 0,
    fallen: false,
    hp: ENEMY_MAX_HP,
  };
}

const enemies = [makeEnemy(14 * TILE + TILE / 2, TILE * 2)];

window.addEventListener("keydown", (event) => {
  keys[event.key.toLowerCase()] = true;
  if (event.code === "Space") {
    event.preventDefault();
    keys.space = true;
  }
  if (event.key.toLowerCase() === "e" && !event.repeat && !dead) {
    player.shield = !player.shield;
  }
  if (event.key.toLowerCase() === "f" && !event.repeat && !dead) {
    buyPotion();
  }
  if (event.key.toLowerCase() === "q" && !event.repeat && !dead) {
    drinkPotion();
  }
  if (event.key === "Shift") keys.shift = true;
  if (!dead && !event.repeat) {
    if (event.key === "1") {
      player.weapon = "ak";
      player.shield = false;
      fireCooldown = 0;
    }
    if (event.key === "2") {
      player.weapon = "pistol";
      fireCooldown = 0;
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
  if (event.code === "Space") {
    keys.space = false;
  }
  if (event.key === "Shift") keys.shift = false;
});

function facingDir() {
  if (Math.abs(player.facingX) > Math.abs(player.facingY)) {
    return player.facingX > 0 ? "right" : "left";
  }
  return player.facingY > 0 ? "down" : "up";
}

function gunTipFor(x, y, dir, weapon) {
  const table = weapon === "ak" ? AK_OFFSET : PISTOL_OFFSET;
  const offset = table[dir];
  return {
    x: x + offset.x * DRAW_W,
    y: y + offset.y * DRAW_H,
  };
}

function gunTip() {
  return gunTipFor(player.x, player.y, facingDir(), player.weapon);
}

function shoot() {
  if (dead || player.stun > 0 || fireCooldown > 0) return;
  const aimLen = Math.hypot(player.facingX, player.facingY);
  if (aimLen < 0.01) return;
  if (player.shield) player.shield = false;
  fireCooldown = player.weapon === "ak" ? AK_COOLDOWN : PISTOL_COOLDOWN;
  const tip = gunTip();
  const nx = player.facingX / aimLen;
  const ny = player.facingY / aimLen;
  const dmg =
    (player.weapon === "ak" ? AK_DAMAGE : PISTOL_DAMAGE) * player.damageMul;
  const angles = player.spread ? [-0.28, 0, 0.28] : [0];
  for (const ang of angles) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    bullets.push({
      x: tip.x,
      y: tip.y,
      vx: (nx * c - ny * s) * BULLET_SPEED,
      vy: (nx * s + ny * c) * BULLET_SPEED,
      from: "player",
      damage: dmg,
    });
  }
}

function bark(enemy, text, force) {
  if (!force && enemy.barkTime > 0) return;
  enemy.bark = text;
  enemy.barkTime = BARK_TIME;
}

function killEnemy(enemy) {
  enemy.alive = false;
  enemy.exploding = true;
  enemy.explodeTime = 0;
  enemy.moving = false;
  enemy.crouch = 0;
  bark(enemy, "GABWARRRGH!!!", true);
  spawnDrops(enemy.x, enemy.y);
}

function spawnDrops(x, y) {
  if (Math.random() < DROP_CHANCE) {
    const kind = POWER_KINDS[Math.floor(Math.random() * POWER_KINDS.length)];
    pickups.push({ x: x + 18, y: y - 10, kind, bob: Math.random() * 6 });
  }
  if (Math.random() < DROP_CHANCE) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      pickups.push({
        x: x + (Math.random() - 0.5) * 50,
        y: y + (Math.random() - 0.5) * 50,
        kind: "coin",
        bob: Math.random() * 6,
      });
    }
  }
}

function drawPickups() {
  for (const item of pickups) {
    const x = item.x - camera.x;
    const y = item.y - camera.y + Math.sin(item.bob) * 4;
    if (item.kind === "coin") {
      ctx.fillStyle = "#F5C518";
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8a6a10";
      ctx.lineWidth = 2;
      ctx.stroke();
      continue;
    }
    const color =
      item.kind === "damage" ? "#FF3B3B" : item.kind === "spread" ? "#7CFF6B" : "#4ECBFF";
    const label =
      item.kind === "damage" ? "x100" : item.kind === "spread" ? "SPR" : "DSH";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 3);
    ctx.textAlign = "start";
  }
}

function applyPickup(kind) {
  if (kind === "coin") {
    player.coins += 1;
    return;
  }
  if (kind === "damage") {
    player.damageMul = 100;
    player.damageTime = POWER_TIME;
  } else if (kind === "spread") {
    player.spread = true;
    player.spreadTime = POWER_TIME;
  } else if (kind === "dash") {
    player.dash = true;
  }
}

function say(msg) {
  toast = msg;
  toastTime = 1.6;
}

function nearVending() {
  const { tx, ty } = worldToTile(player.x, player.y);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (getTile(tx + dx, ty + dy) === VENDING) return true;
    }
  }
  return false;
}

function buyPotion() {
  if (!nearVending()) {
    say("WALK UP TO A VENDING MACHINE");
    return;
  }
  if (player.coins < VEND_COST) {
    say("NEED " + VEND_COST + " COINS");
    return;
  }
  player.coins -= VEND_COST;
  player.potions += 1;
  say("POTION +1  (Q to drink)");
}

function drinkPotion() {
  if (player.potions <= 0) {
    say("NO POTIONS");
    return;
  }
  if (player.hp >= PLAYER_MAX_HP) {
    say("ALREADY FULL HP");
    return;
  }
  player.potions -= 1;
  player.hp = Math.min(PLAYER_MAX_HP, player.hp + POTION_HEAL);
  say("GLUG  +" + POTION_HEAL + " HP");
}

function drawBark(enemy) {
  if (enemy.barkTime <= 0 || !enemy.bark) return;
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#ffffff";
  const barkY = enemy.y - DRAW_H / 2 - 6 - camera.y;
  ctx.strokeText(enemy.bark, enemy.x - camera.x, barkY);
  ctx.fillText(enemy.bark, enemy.x - camera.x, barkY);
  ctx.textAlign = "start";
}

function enemyShoot(enemy) {
  if (enemy.stun > 0 || enemy.fireCooldown > 0) return;
  enemy.fireCooldown = ENEMY_FIRE_COOLDOWN;
  bark(enemy, "FIRE!", true);
  const tip = gunTipFor(enemy.x, enemy.y, enemyFacingDir(enemy), "ak");
  bullets.push({
    x: tip.x,
    y: tip.y,
    vx: enemy.facingX * BULLET_SPEED,
    vy: enemy.facingY * BULLET_SPEED,
    from: "enemy",
    damage: ENEMY_DAMAGE,
  });
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clampToArena(thing) {
  if (!blockedAt(thing.x, thing.y)) return;
  const { tx, ty } = worldToTile(thing.x, thing.y);
  const n = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  for (const [dx, dy] of n) {
    const nx = (tx + dx) * TILE + TILE / 2;
    const ny = (ty + dy) * TILE + TILE / 2;
    if (!blockedAt(nx, ny)) {
      thing.x = nx;
      thing.y = ny;
      return;
    }
  }
}

function stunBoth(enemy) {
  player.stun = STUN_TIME;
  player.moving = false;
  enemy.stun = STUN_TIME;
  enemy.moving = false;
  enemy.crouch = 0;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const length = Math.hypot(dx, dy) || 1;
  player.x += (dx / length) * 40;
  player.y += (dy / length) * 40;
  enemy.x -= (dx / length) * 40;
  enemy.y -= (dy / length) * 40;
  clampToArena(player);
  clampToArena(enemy);
}

function knockDown(enemy) {
  enemy.stun = SHIELD_STUN;
  enemy.fallen = true;
  enemy.moving = false;
  enemy.crouch = 0;
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const length = Math.hypot(dx, dy) || 1;
  enemy.x += (dx / length) * 48;
  enemy.y += (dy / length) * 48;
  clampToArena(enemy);
}

// 0,1,2,3,2,1,0,1... so the last breath frame slides back into the first.
function pingPong(index, n) {
  const cycle = n * 2 - 2;
  const i = ((index % cycle) + cycle) % cycle;
  return i < n ? i : cycle - i;
}

function enemyFacingDir(enemy) {
  if (Math.abs(enemy.facingX) > Math.abs(enemy.facingY)) {
    return enemy.facingX > 0 ? "right" : "left";
  }
  return enemy.facingY > 0 ? "down" : "up";
}

function drawEnemy(enemy) {
  if (enemy.exploding) {
    const col = Math.min(
      BOOM_COLS - 1,
      Math.floor(enemy.explodeTime * BOOM_FPS)
    );
    if (boomSheet.complete && boomSheet.naturalWidth > 0) {
      ctx.drawImage(
        boomSheet,
        col * BOOM_CELL,
        0,
        BOOM_CELL,
        BOOM_CELL,
        enemy.x - BOOM_DRAW / 2 - camera.x,
        enemy.y - BOOM_DRAW + 36 - camera.y,
        BOOM_DRAW,
        BOOM_DRAW
      );
    }
    drawBark(enemy);
    return;
  }
  if (!enemy.alive) return;
  const crouching = enemy.crouch > 0;
  const sheet = crouching
    ? enemyCrouchSheet
    : enemy.moving
      ? enemyWalkSheet
      : enemyIdleSheet;
  const ready = sheet.complete && sheet.naturalWidth > 0;
  if (!ready) {
    ctx.fillStyle = "#888888";
    ctx.beginPath();
    ctx.arc(enemy.x - camera.x, enemy.y - camera.y, 10, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const row = DIR_ROW[enemyFacingDir(enemy)];
  const col = enemy.moving && !crouching
    ? Math.floor(enemy.animTime * WALK_FPS) % WALK_COLS
    : pingPong(Math.floor(enemy.animTime * IDLE_FPS), IDLE_COLS);

  if (enemy.fallen) {
    ctx.save();
    ctx.translate(enemy.x - camera.x, enemy.y - camera.y);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(
      sheet,
      col * SPRITE_CELL_W,
      row * SPRITE_CELL_H,
      SPRITE_CELL_W,
      SPRITE_CELL_H,
      -DRAW_W / 2,
      -DRAW_H / 2,
      DRAW_W,
      DRAW_H
    );
    ctx.restore();
    drawBark(enemy);
    return;
  }

  ctx.drawImage(
    sheet,
    col * SPRITE_CELL_W,
    row * SPRITE_CELL_H,
    SPRITE_CELL_W,
    SPRITE_CELL_H,
    enemy.x - DRAW_W / 2 - camera.x,
    enemy.y - DRAW_H / 2 - camera.y,
    DRAW_W,
    DRAW_H
  );

  drawBark(enemy);
}

function drawPlayer() {
  const sheet = player.shield
    ? player.moving
      ? shieldWalkSheet
      : shieldIdleSheet
    : player.weapon === "ak"
      ? player.moving
        ? akWalkSheet
        : akIdleSheet
      : player.moving
        ? walkSheet
        : idleSheet;
  const ready = sheet.complete && sheet.naturalWidth > 0;
  if (!ready) {
    ctx.fillStyle = "#7CFF6B";
    ctx.beginPath();
    ctx.arc(player.x - camera.x, player.y - camera.y, 10, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const row = DIR_ROW[facingDir()];
  const col = player.moving
    ? Math.floor(animTime * WALK_FPS) % WALK_COLS
    : pingPong(Math.floor(animTime * IDLE_FPS), IDLE_COLS);

  ctx.drawImage(
    sheet,
    col * SPRITE_CELL_W,
    row * SPRITE_CELL_H,
    SPRITE_CELL_W,
    SPRITE_CELL_H,
    player.x - DRAW_W / 2 - camera.x,
    player.y - DRAW_H / 2 - camera.y,
    DRAW_W,
    DRAW_H
  );
}

function shieldBlocks(bullet) {
  if (!player.shield) return false;
  if (dist(bullet.x, bullet.y, player.x, player.y) > SHIELD_RADIUS) return false;
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  const fromX = -bullet.vx / speed;
  const fromY = -bullet.vy / speed;
  // front half of wherever Bob is facing — not a skinny cone
  return player.facingX * fromX + player.facingY * fromY > 0;
}

function update(dt) {
  if (toastTime > 0) {
    toastTime -= dt;
    if (toastTime <= 0) toast = "";
  }
  if (dead) return;

  if (fireCooldown > 0) fireCooldown -= dt;
  if (player.stun > 0) player.stun -= dt;
  if (player.dashCooldown > 0) player.dashCooldown -= dt;
  if (player.dashing > 0) player.dashing -= dt;
  if (player.damageTime > 0) {
    player.damageTime -= dt;
    if (player.damageTime <= 0) player.damageMul = 1;
  }
  if (player.spreadTime > 0) {
    player.spreadTime -= dt;
    if (player.spreadTime <= 0) player.spread = false;
  }

  if (
    player.dash &&
    keys.shift &&
    player.dashCooldown <= 0 &&
    player.stun <= 0 &&
    player.dashing <= 0
  ) {
    player.dashing = DASH_TIME;
    player.dashCooldown = DASH_COOLDOWN + DASH_TIME;
  }

  if (player.stun <= 0 && keys.space) shoot();

  let dx = 0;
  let dy = 0;
  if (player.stun <= 0) {
    if (keys["w"]) dy -= 1;
    if (keys["s"]) dy += 1;
    if (keys["a"]) dx -= 1;
    if (keys["d"]) dx += 1;
  }

  const length = Math.hypot(dx, dy);
  const moving = length > 0;
  if (moving !== wasMoving) animTime = 0;
  wasMoving = moving;
  player.moving = moving;
  animTime += dt;

  if (moving) {
    dx /= length;
    dy /= length;
    player.facingX = dx;
    player.facingY = dy;
  }
  let speed = PLAYER_SPEED;
  if (player.dashing > 0) {
    player.moving = true;
    speed = DASH_SPEED;
    dx = player.facingX;
    dy = player.facingY;
    const dashLen = Math.hypot(dx, dy) || 1;
    dx /= dashLen;
    dy /= dashLen;
  }
  if (dx !== 0 || dy !== 0) {
    const nextX = player.x + dx * speed * dt;
    const nextY = player.y + dy * speed * dt;
    if (!blockedAt(nextX, player.y)) player.x = nextX;
    if (!blockedAt(player.x, nextY)) player.y = nextY;
  }
  maybeGenerate();
  camera.x = player.x - canvas.width / 2;
  camera.y = player.y - canvas.height / 2;

  for (const enemy of enemies) {
    if (enemy.exploding) {
      enemy.explodeTime += dt;
      if (enemy.barkTime > 0) enemy.barkTime -= dt;
      if (enemy.explodeTime >= BOOM_COLS / BOOM_FPS) {
        enemy.exploding = false;
      }
      continue;
    }
    if (!enemy.alive) continue;
    enemy.animTime += dt;
    if (enemy.stun > 0) enemy.stun -= dt;
    else enemy.fallen = false;
    if (enemy.fireCooldown > 0) enemy.fireCooldown -= dt;
    if (enemy.crouch > 0) enemy.crouch -= dt;
    if (enemy.barkTime > 0) enemy.barkTime -= dt;

    const toX = player.x - enemy.x;
    const toY = player.y - enemy.y;
    const toLen = Math.hypot(toX, toY) || 1;
    enemy.facingX = toX / toLen;
    enemy.facingY = toY / toLen;

    if (enemy.stun <= 0 && enemy.crouch <= 0 && enemy.fireCooldown <= 0) {
      enemy.crouch = CROUCH_TIME;
      enemy.animTime = 0;
      enemyShoot(enemy);
    }

    const chasing = enemy.stun <= 0 && enemy.crouch <= 0;
    if (chasing && !enemy.wasMoving) bark(enemy, "GET HIM!");
    if (chasing !== enemy.wasMoving) enemy.animTime = 0;
    enemy.wasMoving = chasing;
    enemy.moving = chasing;

    if (chasing) {
      const nextX = enemy.x + enemy.facingX * ENEMY_SPEED * dt;
      const nextY = enemy.y + enemy.facingY * ENEMY_SPEED * dt;
      if (!blockedAt(nextX, enemy.y)) enemy.x = nextX;
      if (!blockedAt(enemy.x, nextY)) enemy.y = nextY;
      if (Math.random() < 0.4 * dt) bark(enemy, "DIEDIEDIE!");
    }

    if (
      player.stun <= 0 &&
      enemy.stun <= 0 &&
      dist(player.x, player.y, enemy.x, enemy.y) < HIT_RADIUS * 2
    ) {
      const toPlayerX = (enemy.x - player.x) / (toLen || 1);
      const toPlayerY = (enemy.y - player.y) / (toLen || 1);
      const hitShield =
        player.shield &&
        player.facingX * toPlayerX + player.facingY * toPlayerY > 0.2;
      if (hitShield) knockDown(enemy);
      else stunBoth(enemy);
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    const { tx, ty } = worldToTile(bullet.x, bullet.y);
    const sx = bullet.x - camera.x;
    const sy = bullet.y - camera.y;
    const off =
      isSolid(getTile(tx, ty)) ||
      sx < -40 ||
      sy < -40 ||
      sx > canvas.width + 40 ||
      sy > canvas.height + 40;
    if (off) {
      bullets.splice(i, 1);
      continue;
    }

    if (bullet.from === "player") {
      let hit = false;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (dist(bullet.x, bullet.y, enemy.x, enemy.y) < HIT_RADIUS) {
          enemy.hp -= bullet.damage || 1;
          if (enemy.hp <= 0) killEnemy(enemy);
          hit = true;
          break;
        }
      }
      if (hit) bullets.splice(i, 1);
    } else if (shieldBlocks(bullet)) {
      bullets.splice(i, 1);
    } else if (dist(bullet.x, bullet.y, player.x, player.y) < HIT_RADIUS) {
      player.hp -= bullet.damage || 1;
      if (player.hp <= 0) {
        player.hp = 0;
        dead = true;
        player.moving = false;
      }
      bullets.splice(i, 1);
    }
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const item = pickups[i];
    item.bob += dt * 4;
    if (dist(player.x, player.y, item.x, item.y) < PICK_RADIUS) {
      applyPickup(item.kind);
      pickups.splice(i, 1);
    }
  }
}

function draw() {
  drawGround();

  drawPlayer();
  for (const enemy of enemies) {
    drawEnemy(enemy);
  }

  for (const bullet of bullets) {
    ctx.fillStyle = bullet.from === "enemy" ? "#FF5A3A" : "#FFE14A";
    ctx.save();
    ctx.translate(bullet.x - camera.x, bullet.y - camera.y);
    ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
    ctx.fillRect(-BULLET_LENGTH / 2, -BULLET_WIDTH / 2, BULLET_LENGTH, BULLET_WIDTH);
    ctx.restore();
  }

  drawPickups();

  ctx.fillStyle = "#aaaaaa";
  ctx.font = "16px monospace";
  const gunName = player.weapon === "ak" ? "AK-47" : "PISTOL";
  ctx.fillText(
    player.shield
      ? "WASD  |  SPACE  |  1 AK  2 pistol  |  E shield (UP)  |  F vend  Q drink  |  " + gunName
      : "WASD  |  SPACE  |  1 AK  2 pistol  |  E shield  |  F vend  Q drink  |  " + gunName,
    16,
    28
  );
  const alive = enemies.filter((e) => e.alive).length;
  const buffs = [];
  if (player.damageMul > 1) buffs.push("x100");
  if (player.spread) buffs.push("SPREAD");
  if (player.dash) buffs.push(player.dashing > 0 ? "DASH!" : "DASH ready (SHIFT)");
  ctx.fillText(
    "YOU " +
      player.hp +
      "  |  HOSTILES " +
      alive +
      "  |  COINS " +
      player.coins +
      "  |  POTIONS " +
      player.potions +
      (buffs.length ? "  |  " + buffs.join(" ") : ""),
    16,
    50
  );

  if (nearVending() && !dead) {
    ctx.fillStyle = "#F5C518";
    ctx.fillText("F  buy healing potion  (" + VEND_COST + " coins)", 16, 72);
  }
  if (toast) {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(toast, 16, nearVending() && !dead ? 94 : 72);
  }

  if (dead) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#FF5A3A";
    ctx.font = "48px monospace";
    ctx.fillText("GAME OVER", 16, 80);
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "16px monospace";
    ctx.fillText("refresh to retry", 16, 110);
  }
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
