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

const GUN_OFFSET = {
  down: { x: 0.36, y: 0.02 },
  right: { x: 0.44, y: -0.06 },
  up: { x: 0.28, y: 0.02 },
  left: { x: -0.44, y: -0.06 },
};

const BULLET_LENGTH = 10;
const BULLET_WIDTH = 3;
const BULLET_SPEED = 500;
const FIRE_COOLDOWN = 1;

const player = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  facingX: 0,
  facingY: 1,
  moving: false,
};

const bullets = [];
const keys = {};
let fireCooldown = 0;
let animTime = 0;
let wasMoving = false;

const walkSheet = new Image();
walkSheet.src = "bob-walk.png";
const idleSheet = new Image();
idleSheet.src = "bob-idle.png";

window.addEventListener("keydown", (event) => {
  keys[event.key.toLowerCase()] = true;
  if (event.code === "Space") {
    event.preventDefault();
    keys.space = true;
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
  if (event.code === "Space") {
    keys.space = false;
  }
});

function facingDir() {
  if (Math.abs(player.facingX) > Math.abs(player.facingY)) {
    return player.facingX > 0 ? "right" : "left";
  }
  return player.facingY > 0 ? "down" : "up";
}

function gunTip() {
  const offset = GUN_OFFSET[facingDir()];
  return {
    x: player.x + offset.x * DRAW_W,
    y: player.y + offset.y * DRAW_H,
  };
}

function shoot() {
  if (fireCooldown > 0) return;
  fireCooldown = FIRE_COOLDOWN;
  const tip = gunTip();
  bullets.push({
    x: tip.x,
    y: tip.y,
    vx: player.facingX * BULLET_SPEED,
    vy: player.facingY * BULLET_SPEED,
  });
}

// 0,1,2,3,2,1,0,1... so the last breath frame slides back into the first.
function pingPong(index, n) {
  const cycle = n * 2 - 2;
  const i = ((index % cycle) + cycle) % cycle;
  return i < n ? i : cycle - i;
}

function drawPlayer() {
  const sheet = player.moving ? walkSheet : idleSheet;
  const ready = sheet.complete && sheet.naturalWidth > 0;
  if (!ready) {
    ctx.fillStyle = "#7CFF6B";
    ctx.beginPath();
    ctx.arc(player.x, player.y, 10, 0, Math.PI * 2);
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
    player.x - DRAW_W / 2,
    player.y - DRAW_H / 2,
    DRAW_W,
    DRAW_H
  );
}

function update(dt) {
  if (fireCooldown > 0) fireCooldown -= dt;
  if (keys.space) shoot();

  let dx = 0;
  let dy = 0;
  if (keys["w"]) dy -= 1;
  if (keys["s"]) dy += 1;
  if (keys["a"]) dx -= 1;
  if (keys["d"]) dx += 1;

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
    player.x += dx * PLAYER_SPEED * dt;
    player.y += dy * PLAYER_SPEED * dt;
  }

  const half = PLAYER_SIZE / 2;
  if (player.x < half) player.x = half;
  if (player.y < half) player.y = half;
  if (player.x > canvas.width - half) player.x = canvas.width - half;
  if (player.y > canvas.height - half) player.y = canvas.height - half;

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    const off =
      bullet.x < 0 ||
      bullet.y < 0 ||
      bullet.x > canvas.width ||
      bullet.y > canvas.height;
    if (off) {
      bullets.splice(i, 1);
    }
  }
}

function draw() {
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawPlayer();

  ctx.fillStyle = "#FFE14A";
  for (const bullet of bullets) {
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
    ctx.fillRect(-BULLET_LENGTH / 2, -BULLET_WIDTH / 2, BULLET_LENGTH, BULLET_WIDTH);
    ctx.restore();
  }

  ctx.fillStyle = "#aaaaaa";
  ctx.font = "16px monospace";
  ctx.fillText("WASD move  |  SPACE shoot", 16, 28);
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
