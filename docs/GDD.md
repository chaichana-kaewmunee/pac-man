# Game Design Document: Pac-Man (Phaser Migration)

| | |
|---|---|
| **Status** | Draft v0.1 (Phase 1 — ก่อน Refactor) |
| **Target framework** | Phaser 4.2.1 (ยังไม่ได้ติดตั้ง — ขออนุญาตก่อน Phase 2) |
| **อ้างอิง** | `.agent/skills/phaser-2d-game/skill.md`, `.agent/skills/phaser-gdd/skill.md` (v0.7.0), `.agent/skills/scenes/skill.md`, source จริงของโปรเจกต์ |

<!-- ASSUMPTION --> ตัวเลขทั้งหมดในเอกสารนี้มาจากโค้ดจริง (`engine.ts`, `movement.ts`, `ghostAI.ts`, `maze.ts`) ยกเว้นที่ระบุ `<!-- ASSUMPTION -->` เท่านั้น

---

## Section 1 — Game Overview

- **Title:** Pac-Man (ชื่อทำงาน — ใช้ของเดิม)
- **Tagline:** วิ่งหนี ไล่เก็บ คะแนนติดอันดับ
- **Genre:** Arcade / Maze-chase (single-screen)
- **Target Audience:** ทุกวัย; casual; ผู้เล่นที่อยากท้าทายบน Leaderboard
- **Elevator Pitch:** ผู้เล่นควบคุม Pac-Man กินเม็ดทุกอันในเขาวงกต หลบการไล่ล่าของผี 4 ตัวเพื่อชนะด่านและเก็บคะแนนท้าชิง Leaderboard บนเว็บ ด้วยระบบลอจิก deterministic แบบ fixed timestep ที่รู้สึกแม่นยำทุกกดปุ่ม
- **Unique Selling Points:**
  1. ลอจิกเกมแยกจาก presentation 100% — engine เป็น pure TypeScript ทดสอบได้โดยไม่ต้องเปิด browser
  2. Fixed timestep 60 steps/วินาที — ผลเกมเหมือนกันทุกเครื่อง ทุก frame rate
  3. Ghost AI เป็นระบบ (BFS pathfinding + scatter/chase cycle) ไม่เดินสุ่ม
  4. Leaderboard ผ่าน Backend จริง (SQLite + idempotency) แยกจากตัวเกม
- **Comparable Titles:** Pac-Man ดั้งเดิม (borrowed: maze-chase loop, scatter/chase; different: single-screen MVP + Leaderboard ออนไลน์), Pac-Man Championship Edition (borrowed: ความเร็ว/ท่าทางแน่น; different: ไม่มี frightened/ผลงานพิเศษใน MVP)

## Section 2 — Core Game Loop

**30-Second Loop**
```
[เลื่อนทิศทาง] --> [กินเม็ด/หลบผี] --> [Score+10/50, ผีรุกใกล้] --> [ตัดสินใจเลี้ยว/หลบ] --+
       ^                                                                             |
       +-----------------------------------------------------------------------------+
```

**5-Minute Loop (1 รอบเกม)**
```
[เริ่มเกม (3 ชีวิต)] --> [เก็บเม็ดให้ครบ maze] --> [ชนะ (won)] --> [ส่งคะแนน Leaderboard] --> [เริ่มใหม่]
        |                                                                    |
        +--> [โดนผีจับ: -1 ชีวิต, respawn 2s invuln] ---> [ชีวิตหมด: แพ้ (lost)] ---> [ส่งคะแนน]
```

**Session Loop:** เปิดเกม → เล่นหลายรอบ (รอบละ ~1–3 นาที) → ดู/ท้าชิง Leaderboard → ปิด

- **Win Condition:** กินเม็ดครบทุกอันใน maze (`pelletsRemaining === 0` → `status = "won"`)
- **Lose Condition:** ชีวิตหมด (`lives === 0` → `status = "lost"`) — แพ้แล้วเปลี่ยนสถานะซ้ำไม่ได้ (engine กันจบซ้ำ)

## Section 3 — Mechanics Deep Dive

### Primary Mechanics

**1. การเคลื่อนที่ (tile-based, fixed timestep)** — ตัวเลขจาก `movement.ts` / `engine.ts` (ตรวจแล้ว):
- `PACMAN_SPEED = 6` tiles/วินาที, `STEPS_PER_SECOND = 60` (step ขนาดคงที่ 1/60s)
- พิกัดเป็น float หน่วย tile (ศูนย์กลาง tile = จำนวนเต็ม) — collision ตรวจกำแพงก่อนขยับทุก step
- **เลี้ยว 90°** เฉพาะเมื่ออยู่ที่ศูนย์กลาง tile (tolerance `1e-3`) และ tile ปลายทางเดินได้
- **กลับหลัง 180°** ได้ทันทีแม้กลาง tile
- **Turn buffering**: `pendingDirection` (single-slot) — กดค้างไว้ รอเลี้ยวที่ทางแยกถัดไป
- ชนกำแพง → snap เข้าศูนย์กลาง tile (ไม่ติดที่ 12.9) → กดเลี้ยวได้ทันที
- Edge case: `dir === null` (นิ่ง) ต้องตรวจ tile หน้า walkable ก่อนเริ่มเดินกันทะลุกำแพง

**2. การกินเม็ด**: ตรวจ tile ใต้ Pac-Man 1 ครั้งต่อ step (`eatPellet`); กินแล้วห้ามกินซ้ำ (`_pellets[y][x]` boolean grid)

**3. การชนผี**: ตรวจ grid collision ต่อ step (`checkGhostCollision`); ถ้า invulnerable (หลัง respawn) ไม่โดนซ้ำ

### Secondary Mechanics
- **Scoring**: pellet `+10`, power pellet `+50`; ไม่มี combo
- **Lives/Respawn**: `INITIAL_LIVES = 3`; โดนจับ → Pac-Man กลับ spawn + `RESPAWN_INVULN_SECONDS = 2`s; ผีทั้งหมดกลับ spawn (mode `respawning`)
- **Leaderboard**: จบเกม (won/lost) → React `ScoreSubmit` ส่ง `POST /api/leaderboard` พร้อม `clientRequestId` (idempotency) — **ไม่เรียก Backend ทุก frame**

### Control Scheme

| Action | Keyboard | Touch | Gamepad |
|--------|----------|-------|---------|
| เลื่อน | Arrow keys / WASD | Virtual d-pad <!-- ASSUMPTION: ยังไม่ implement --> | Left stick <!-- ASSUMPTION: ยังไม่ implement --> |
| เริ่มเกม / Restart | Enter | ปุ่มบนหน้าจอ | Start <!-- ASSUMPTION --> |
| Pause / Resume | P หรือ Esc | ปุ่ม Pause | Select <!-- ASSUMPTION --> |

## Section 4 — Progression System

- **Difficulty Curve**: MVP คงที่ 1 ด่าน; ความกดดันเกิดจากการสลับโหมดผี scatter 7s → chase 20s → ซ้ำ (จาก `SCATTER_SECONDS`/`CHASE_SECONDS`)
- **Unlock Sequence**: ไม่มี (MVP — ไม่มี level/ability unlock)
- **Scoring System**: pellet 10, power pellet 50 (`PELLET_SCORE`/`POWER_PELLET_SCORE`); ส่ง Leaderboard ตอนจบเกม; GET `?limit=` แสดง top scores
- **Replayability Hooks**: ท้าทายคะแนนตัวเอง/คนอื่นบน Leaderboard
- **Estimated Play Time**: รอบละ ~1–3 นาที (maze 19×15); session 15–30 นาที

## Section 5 — Level / World Design

- **Level Count**: 1 maze (MVP) — `MAZE_DEFINITION` ใน `maze.ts` (19 คอลัมน์ × 15 แถว)
- **Themes**: arcade สีดำ-เหลือง (สีจาก renderer เดิม) — ไม่มีโลก/ธีมหลายแบบ
- **Flow Map**:
```
[Level 1 (maze เดียว)] --> [Won] --> [ส่งคะแนน] --> [เล่นซ้ำ Level 1]
```

- **Difficulty Scaling**: MVP ไม่ scaling; <!-- ASSUMPTION --> Phase ถัดไปอาจเพิ่ม maze ใหม่ / ปรับความเร็วผี

## Section 6 — Characters & Entities

**Player — Pac-Man**
| Stat | ค่า |
|---|---|
| Speed | 6 tiles/s |
| ชีวิต | 3 (สูงสุด) |
| Invuln หลัง respawn | 2 s |
| State machine | `idle (dir=null)` → `moving` → `caught` (respawn) → `dead` (lives=0, game over) |

**Enemies — 4 Ghosts** (จาก `GHOST_COLORS` + `SCATTER_CORNERS` ใน `engine.ts`):
| Ghost | Color (hex จาก renderer.ts) | Speed | Scatter target | Mode sequence |
|---|---|---|---|---|
| Red | `#ff3b3b` | 85% ของ Pac-Man | (0,0) | scatter 7s → chase 20s → ซ้ำ |
| Pink | `#ffb8de` | 85% | (0,24) | เหมือนกัน |
| Cyan | `#4de3ff` | 85% | (27,0) | เหมือนกัน |
| Orange | `#ffb852` | 85% | (27,24) | เหมือนกัน |

- **โหมด**: `scatter` (มุ่งมุม) / `chase` (ไล่ Pac-Man) / `respawning` (กลับ spawn) — ตัดสินใจทิศที่ทางแยก (junction) เท่านั้น, ห้ามกลับ 180° เว้นทางตัน, ใช้ BFS pathfinding (`ghostAI.ts`)
- <!-- ASSUMPTION --> scatter corners เป็นจุด "ไกล" นอก grid (0,24 / 27,0 / 27,24) — เพราะ maze MVP ไม่มี ghost house; ค่าจาก `SCATTER_CORNERS` ในโค้ดจริง

**Collectibles**
| Item | Effect | Duration | Visual |
|---|---|---|---|
| Pellet | +10 คะแนน | - | จุดกลมเล็ก |
| Power Pellet | +50 คะแนน | - | วงกลมใหญ่กะพริบ |

> **หมายเหตุสำคัญ (ตามโค้ดจริง):** Power pellet ใน MVP ให้คะแนน 50 เท่านั้น — **ไม่มีโหมด frightened/กินผีได้** (ถูกรีเวิร์ทออกนอกขอบเขตไปแล้วในรอบก่อนหน้า) อย่าเพิ่มโดยไม่ได้รับมอบหมาย

## Section 7 — UI/UX Wireframes

**HUD Layout** (React DOM overlay บน Phaser canvas — ตาม skill phaser-2d-game: HUD เป็น DOM)
```
+---------------------------------------------------+
|  SCORE  01230        LIVES  ♥♥♥   STATUS [READY]  |
|                                                   |
|         +-----------------------------------+     |
|         |          PHASER CANVAS            |     |
|         |   (maze, pacman, ghosts, pellets) |     |
|         +-----------------------------------+     |
|                                                   |
|  [Leaderboard]                    [Pause]         |
+---------------------------------------------------+
```
- **Status text**: READY / PLAYING / PAUSED / WON / LOST (จาก `GameSnapshot.status`)
- HUD อัปเดต **event-driven** (เมื่อ score/lives/status เปลี่ยน) — **ไม่ re-render ทุก frame**

**Menu Flow Diagram** (React = DOM screens; Phaser = gameplay scenes)
```
[React: Title/MainMenu] --> [React: Play] --> [Phaser: GameScene] --> [React: GameOver/Win overlay]
       |                                              ^                          |
       +--> [React: Leaderboard]                      |                          |
       +--> [React: Settings(--)]                     +--> [React: Pause overlay]
```
- Pause: `this.scene.pause('GameScene')` + React overlay (scene ยังวาด, หยุด update — ตาม scenes skill: pause หยุด update แต่ยัง render) <!-- ASSUMPTION: ใช้ pause จริง -->
- Game over: scene หยุด simulation; React แสดงผลลัพธ์ + `ScoreSubmit`

**Screens** (ทั้งหมดเป็น React ยกเว้น GameScene):
1. Title/Main Menu — ชื่อเกม + ปุ่ม Play/Leaderboard
2. Game (Phaser canvas + HUD DOM)
3. Pause overlay — Resume / Restart / Quit
4. Game Over / Win overlay — สรุปผล + Submit Score + Play again
5. Leaderboard — ตารางคะแนน + Retry (มีอยู่แล้ว `Leaderboard.tsx`)

**Accessibility**: คีย์บอร์ด focus ชัดเจนบนปุ่ม, contrast สูง (ดำ/เหลือง), ไม่พึ่งสีเพียงอย่างเดียว <!-- ASSUMPTION: beta checklist -->, รองรับการ remap ไม่มีใน MVP

## Section 8 — Art Direction

- **Visual Style**: arcade-retro สะอาด; 1–2 sentence: "เส้นกำแพงเรียบง่าย สีเหลือง/ดำ ตัวละครทรงกลมมีปาก" — สร้าง procedural ด้วย Phaser Graphics (ไม่มีไฟล์ภาพใน MVP)
- **Color Palette**:
| Role | Hex | Usage |
|---|---|---|
| Background | `#000000` | พื้น maze (37, 0.5, 0, 0 จาก renderer เดิม) |
| Walls | `#2333ff` | กำแพง (ค่าจริงจาก renderer.ts `WALL_COLOR`) |
| Pac-Man | `#ffe600` | ผู้เล่น (ค่าจริงจาก `PACMAN_COLOR`) |
| Danger | `#ff3b3b` | ผีแดง (ค่าจริงจาก `COLORS.red`) |
| Pellets | `#ffd9a0` | เม็ดเล็ก + power pellet (ค่าเดียวจาก renderer.ts) |

- **Resolution & Scaling**: internal 608×480 = 19×15 tile × 32px (**ค่าใหม่ที่ออกแบบสำหรับ Phaser**; ของเดิม renderer คำนวณ tile แบบไดนามิกจาก container — base 16, `Math.min(cssWidth/cols, cssHeight/rows)` — จึงยืดหยุ่นแต่คืนขนาดจอ; สถาปัตยกรรม Phaser เลือก internal fix + `Scale.FIT` + `autoCenter` + `pixelArt: true` ให้ Phaser จัดการ scale แทน loop ของเรา)
- **Animation Guidelines**: ปาก Pac-Man 2 frame @ ~10fps (ขยับตาม `elapsedSeconds` — logic เดิมใน `renderer.drawPacMan` พร้อม port)
- **Asset List**: ไม่มีไฟล์ asset — สร้าง texture จาก `Graphics.generateTexture` ใน `BootScene` (ตาม skill: manifest keys เป็นตัวกลาง, ไม่ hardcode path)

| Asset | Type | วิธีสร้าง |
|---|---|---|
| pacman_chomp | Procedural texture | Graphics (2 frames) |
| ghost_red/pink/cyan/orange | Procedural texture | Graphics |
| pellet / power_pellet | Procedural texture | Graphics |
| wall | Procedural texture | Graphics |

## Section 9 — Audio Design Plan

- **MVP: ไม่มีเสียง** <!-- ASSUMPTION: โปรเจกต์ปัจจุบันไม่มีไฟล์เสียง/audio manager -->
- **Planned SFX** (Phase หลัง):
| Action | Sound | Priority |
|---|---|---|
| กินเม็ด | Chomp สั้น | High |
| กิน power pellet | Chime | High |
| ตาย / ชนะ / คลิก UI | Effect สั้น | Medium |

- **Format**: MP3 + OGG (ตาม skill) — ยังไม่ implement

## Section 10 — Technical Requirements

- **Phaser Version**: `4.2.1` (stable — ตรงกับ skill `phaser-gdd` ว่า "v4.2.1 stable" และ npm registry ล่าสุด, license MIT) — **ยังไม่ได้ติดตั้ง**; ติดตั้งใน Phase 2 เมื่อได้รับอนุญาต (`bun add` ใน `apps/web`)
- **Physics Engine**: **ไม่มี (None)** — justification: การเคลื่อนที่/ชนถูกจัดการทั้งหมดใน `engine.ts` (tile-based, ตรวจกำแพงก่อนขยับ) ใส่ Arcade จะซ้ำซ้อนและเสี่ยงแตะลอจิกที่ทดสอบ 75 tests ไว้แล้ว
- **Performance Budget**: 60 FPS; fixed timestep 60 steps/s คงเดิม; draw call น้อย (object หลัก ~30: 1 maze + 4 ผี + pacman); ไม่มี particle ใน MVP
- **Browser/Device Targets**: เบราว์เซอร์ modern (evergreen); desktop เป็นหลัก <!-- ASSUMPTION: mobile เป็น secondary -->

## Section 11 — Platform Targets & Device Profiles

- **Primary**: Desktop browser (keyboard) — Vite static hosting
- **Secondary**: Mobile browser — ยังไม่มี touch controls ใน MVP <!-- ASSUMPTION -->
- **Deployment**: static (build `apps/web/dist`) + API แยก (`apps/api`) — ตามโครงสร้างปัจจุบัน
- **ไม่เปลี่ยน** Backend/schema/API contract/shared types โดยไม่วิเคราะห์ผลก่อน (Global Instruction)

## Section 12 — Monetization & Release Plan (Optional)

- **Out of scope** สำหรับโปรเจกต์นี้ — ข้ามโดยเจตนา (โปรเจกต์ศึกษา/private)

## Section 13 — Acceptance Criteria

ดู `docs/acceptance-criteria.md` — แยกเป็น criteria ที่เครื่องตรวจได้ (จาก Sections 3/4/6) และหัวข้อที่ต้องมนุษย์ตรวจ (Human review) ตามข้อกำหนดของ skill `phaser-gdd`

---

*GDD เป็น living document — อัปเดตเมื่อเกมพัฒนา (ตาม skill)*