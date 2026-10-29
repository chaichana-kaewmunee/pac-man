# Pac-Man Phaser Migration — Architecture Plan (Phase 1)

อ้างอิง: `.agent/skills/scenes/skill.md`, `.agent/skills/phaser-2d-game/skill.md`, สถาปัตยกรรมเดิม (engine-driven, React shell)

## 1. หลักการแบ่งความรับผิดชอบ

| Layer | รับผิดชอบ | ไม่รับผิดชอบ |
|---|---|---|
| **GameEngine** (`engine.ts`) | กติกา/state ทั้งหมด: movement, ghost AI, scoring, lives, win/lose; fixed timestep | Rendering, input, DOM |
| **Phaser Scenes** | Game loop (`update` → `engine.tick`), render จาก `getSnapshot()`, keyboard input → `engine.setPendingDirection`, animations | กติกาเกม, เรียก Backend |
| **React** | Main menu, HUD, pause/game-over/win overlays, Leaderboard, ScoreSubmit | ควบคุมตำแหน่งตัวละคร, game loop |

**กฎเหล็ก**
- แหล่งความจริงของเกม = `GameEngine` (เดิม) — Phaser เป็นเพียง "จอแสดงผล + input" ที่บาง
- ห้าม React เขียนพิกัด/state เกม; ห้าม Phaser แตะกติกา
- ห้ามเรียก Backend ทุก frame — เรียกตอนจบเกมเท่านั้น (ผ่าน `ScoreSubmit` เดิม)
- Phaser 1 instance ต่อ React mount; `StrictMode` double-mount ต้องมี guard (สร้าง/destroy ซ้ำปลอดภัย)

## 2. Scene Flow

```
┌─────────────────────────────────────────────────────────────┐
│  React (DOM)                                                │
│  App ──> GameScreen ──> [Phaser container <div>]            │
└──────────────┬──────────────────────────────┬───────────────┘
               │ mount (1 ครั้ง)               │ events
               ▼                              ▼
┌─────────────────────────┐      ┌───────────────────────────┐
│  BootScene               │  --> │  GameScene                 │
│  - generateTexture ทุกตัว│      │  - สร้าง maze จาก MazeGrid │
│  - asset manifest        │      │  - new GameEngine(maze)    │
│                          │      │  - keyboard → setPending   │
│                          │      │  - update → engine.tick(dt)│
│                          │      │    → draw(snapshot)        │
│                          │      │  - emit events: score/     │
│                          │      │    lives/status            │
└─────────────────────────┘      └──────────────┬──────────────┘
                                                │ scene.pause / restart
                                                ▼ (via React ปุ่ม)
                       React: Pause overlay / GameOver overlay / ScoreSubmit
```

- `BootScene`: 1 ครั้ง ตอนเริ่ม; สร้าง procedural textures แล้ว `scene.start('GameScene')`
- `GameScene`: scene หลัก; `init()` reset state ทุกครั้ง (ตาม scenes skill — reset ใน init ไม่ใช่ constructor)
- ไม่มี `UIScene` — HUD/menu เป็น React DOM โดยตรง (ตาม skill phaser-2d-game: DOM overlay สำหรับ HUD/menus ดีกว่า in-canvas)
- Pause: `scene.pause('GameScene')` + React overlay; Resume: `scene.resume`; Restart: `engine.reset()` + วาดใหม่ (หรือ `scene.restart`) — เลือก `engine.reset()` ใน scene เดิม เพื่อไม่สร้าง Engine ใหม่ (คง reference เดียว)

## 3. Phaser ↔ React Contract (integration boundary เดียว)

**ทิศเดียวเป็นหลัก**: Engine เป็นของ Phaser; React ฟัง event

- **GameScene → React (events)**: ใช้ `Phaser.Events.EventEmitter` ที่ scene (หรือ `this.registry`) emit เมื่อ state **เปลี่ยนเท่านั้น**:
  - `pacman:score` (score) — HUD
  - `pacman:lives` (lives) — HUD
  - `pacman:status` (status) — HUD + เปิด/ปิด overlay (ready/playing/paused/won/lost)
- **React → GameScene (commands)**: bridge object เก็บ reference ไปยัง scene/engine (เก็บใน ref ตอน `create`):
  - `startGame()` → `engine.start()`
  - `pause()/resume()` → `scene.pause()/scene.resume()`
  - `restart()` → `engine.reset(); engine.start()`
- **React ไม่รู้จัก `GameSnapshot` ทุก frame** — ไม่มี `useEffect(() => engine...)` ต่อ frame; HUD ใหม่เขียนด้วย state ที่อัปเดตจาก events เมื่อเปลี่ยน

**Result/Submit**: เมื่อ `status = won|lost` → React แสดง overlay + `ScoreSubmit` (ของเดิม ไม่แตะ)

## 4. Input ownership

- Phaser รับ keyboard: `this.input.keyboard` (CursorKeys + WASD) → `engine.setPendingDirection(dir)`; Enter/P ⟷ pause (ผ่าน event ไป React)
- `window blur` → auto-pause (กันเล่นต่อตอนไม่จดจ่อ)
- React ไม่รับปุ่มเกม; React รับเฉพาะ click ปุ่ม HUD/menu

## 5. Asset loading / Scaling / Resize / Focus / Cleanup

- **Loading**: ไม่มีไฟล์ภายนอก — `BootScene.preload` ว่าง; `create()` สร้าง textures ด้วย `this.textures.generate` จาก Graphics (manifest keys: `pacman`, `ghost-red`, `pellet`, ...)
- **Scaling**: internal 608×480 (19×15 × 32px <!-- ASSUMPTION tileSize=32 -->), `scale: { mode: Phaser.Scale.FIT, autoCenter: CENTER_BOTH, pixelArt: true }` — canvas ย่อ/ขยายตาม container อัตโนมัติ, maze ไม่เบลอ (pixelArt)
- **Resize**: `Scale.FIT` จัดการเอง; HUD DOM ใช้ CSS (responsive อยู่แล้ว)
- **Keyboard focus**: container `tabIndex=0` + autofocus; blur → pause
- **Cleanup**:
  - React unmount → `game.destroy(true)` + ยกเลิก event listeners + clear ref (เหตุผล: ป้องกัน StrictMode สร้างเกมซ้ำ 2 instance)
  - Scene `shutdown` → `events.off(...)` ล้าง listener ภายนอก (ตาม scenes skill gotcha #14)
  - `init()` รีเซ็ต state เกมทุกครั้ง (gotcha #13) — ห้าม reset ใน constructor

## 6. ไฟล์ที่ได้รับผลกระทบใน Phase 2

**สร้างใหม่**
| ไฟล์ | หน้าที่ |
|---|---|
| `apps/web/src/game/phaser/config.ts` | Phaser.Game config (scale, scene list, pixelArt) |
| `apps/web/src/game/phaser/textures.ts` | สร้าง procedural textures (manifest keys) |
| `apps/web/src/game/phaser/bootScene.ts` | BootScene |
| `apps/web/src/game/phaser/gameScene.ts` | GameScene: maze render, engine, input, update loop, events |
| `apps/web/src/game/phaser/bridge.ts` | ตัวกลาง React↔Phaser (commands + events) |
| `apps/web/src/components/GameCanvas.tsx` | React component: mount/destroy Phaser.Game + StrictMode guard |

**แก้**
| ไฟล์ | การแก้ |
|---|---|
| `apps/web/package.json` | เพิ่ม `phaser@^4.2.1` (**เฉพาะเมื่อได้รับอนุญาต**) |
| `apps/web/src/components/GameScreen.tsx` | เปลี่ยน RAF+Canvas เดิม → `GameCanvas` + HUD จาก events (เก็บ RAF loop ไว้ดูเทียบ, ย้าย HUD refs → state จาก events) |

**ไม่แตะ (นำกลับมาใช้ 100%)**
- `engine.ts`, `movement.ts`, `ghostAI.ts`, `maze.ts`, `validateMaze.ts`, `types.ts`
- `apps/web/src/api/client.ts`, `Leaderboard.tsx`, `ScoreSubmit.tsx`
- `apps/api/**`, `packages/shared/**`

**ค้าง/ไม่ลบ**
- `renderer.ts`: เก็บไว้ช่วง migration (rollback) — **ไม่ลบ**; หลัง Phase ยืนยันแล้วค่อยลบใน Phase ที่แยกต่างหาก
- `apps/web/test/**`: 75 tests เดิม ไม่แก้ (ลอจิกไม่เปลี่ยน — ใช้เป็น regression gate)

## 7. Rollback Strategy

- Feature branch / เก็บ `renderer.ts` + `GameScreen.tsx` เวอร์ชันเดิมไว้
- เกณฑ์ rollback: test < 75 ผ่าน หรือ typecheck พัง หรือ canvas ออกจาก maze
- กลับมาใช้ Canvas เดิมได้โดย revert `GameScreen.tsx` + ลบโฟลเดอร์ `phaser/`