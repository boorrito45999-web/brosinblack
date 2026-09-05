# brosinblack

Top-down arena shooter. One HTML page. One JavaScript file.

## Pitch

You are a shape seen from above, inside a square. You move. You shoot.

## v1 (what exists now)

- one square arena (the canvas)
- a player shape
- WASD movement, stay inside the square
- one gun
- Space fires a bullet the way you last walked
- bullets vanish off-screen
- NO bad guys
- NO Glock vs AK
- NO HP / score / waves

## Later

- v2: bad guys chase you, you can kill them, you can die
- v3: Glock 17 vs AK-47 (keys 1 / 2)
- v4: waves + score

## Tech

- browser, vanilla JS, no framework, no bundler
- `src/index.html` + `src/game.js` + `package.json`
- Node + pnpm + `serve` so we open http://localhost:3000

## Controls (v1)

- WASD move
- Space shoot
- facing = last move direction

## Commands

```bash
cd ~/brosinblack
pnpm install
pnpm start
```

Then open http://localhost:3000
Click the page, then WASD + Space.
Ctrl+C in Terminal stops the server.
