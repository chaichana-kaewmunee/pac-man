# Pac-Man Phaser Migration — Acceptance Criteria (Phase 1)

อ้างอิง: `docs/GDD.md` Sections 3/4/6 + อาร์คิเทคเจอร์ `docs/architecture.md`
ตามข้อกำหนด skill `phaser-gdd` Section 13 — เขียนให้ observable, numeric, false-when-wrong; หัวข้อ subjective แยกไว้ที่ "Human review"

## Vertical Slice (Phase 2 — GameScene แสดงผล + input)

- [ ] `bun run test` ผ่านครบ 75 tests (regression — ห้ามแตะลอจิก)
- [ ] `bun run typecheck` ผ่าน web/api/shared (หลังเพิ่ม phaser)
- [ ] Phaser.Game สร้างเพียง 1 instance ต่อ React mount (StrictMode เปิด) — code review + ไม่มี error console
- [ ] Maze แสดงครบ 19×15 tile จาก `MazeGrid` จริง (จำนวน sprite = tile ที่วาดได้)
- [ ] Pac-Man เริ่มที่ `maze.spawn.pacman` (พิกัดตรง tile)
- [ ] ผี 4 ตัวเริ่มที่ `maze.spawn.ghosts` (สีตรง `GHOST_COLORS` ลำดับ)
- [ ] กด Arrow/WASD → `engine.setPendingDirection(dir)` ถูกเรียก (ทิศตรง)
- [ ] `engine.tick(dt)` ถูกเรียกทุก frame ด้วย dt จริง; fixed timestep 60 steps/s ยังคงเดิม (ตรรกะใน engine ไม่เปลี่ยน)
- [ ] เม็ดที่ถูกกินแล้วไม่วาด (วาดจาก `snapshot.eatenPellets`) — กิน 1 เม็ด → หาย 1 อันบนจอ
- [ ] HUD: score/lives/status อัปเดตเมื่อ event เปลี่ยน (ไม่ re-render ทุก frame) — สังเกตจาก React render count
- [ ] Pause: กด P/Esc → `scene.pause` + overlay; `engine.tick` ไม่ advance (simulation หยุด)
- [ ] Unmount component → `game.destroy(true)` ถูกเรียก (ไม่มี instance ค้าง)
- [ ] ไม่มีการเรียก `fetch*` / Backend ใน game loop (search: ไม่มี `fetch` ใน `phaser/`)

## Alpha (Phase 3+ — ระบบเกมครบบน Phaser)

- [ ] Win: กินเม็ดครบ → `status='won'` → React แสดง overlay + `ScoreSubmit` เปิด
- [ ] Lose: lives หมด → `status='lost'` → overlay
- [ ] Restart จาก overlay → `engine.reset()` → สภาพเริ่มต้น 100% (score 0, lives 3, maze ครบ)
- [ ] Respawn: โดนผีจับ → Pac-Man กลับ spawn, invuln 2s (ค่าเดียวกับ engine)
- [ ] Window blur → auto-pause (ทดสอบ manual)
- [ ] เก็บ `renderer.ts` เดิมไว้ — ยังไม่ลบ ณ สิ้น Phase 2

## Migration Integrity (ทุก Phase)

- [ ] `apps/api/data/pac-man.db` ไม่ถูกสร้าง/เขียนทับ/ลบโดย code ที่เปลี่ยน (ตรวจก่อน/หลัง)
- [ ] API contract/`packages/shared` types ไม่เปลี่ยน (ไม่มี diff ใน `packages/shared`, `apps/api` จาก baseline)
- [ ] `dist/` และ `node_modules/` ไม่ถูกแก้โดยตรง

## Human review required (not automatable)

- เลย์เอาต์ HUD DOM บน canvas อ่านง่าย ไม่บังเกม
- ตำแหน่ง/สัดส่วน sprite กลมกลืนกับ maze (32px)
- ขนาดเมื่อย่อจอ (FIT) ยังเล่นได้ชัดเจน
- Animation ปาก Pac-Man รู้สึกลื่น (~10fps 2 frame)