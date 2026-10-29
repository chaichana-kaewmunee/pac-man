# Pac-Man

Monorepo สำหรับเกม Pac-Man ใช้ **Bun** เป็น runtime และ package manager

## โครงสร้าง

```
apps/
  api/       Backend — Elysia + TypeScript (Bun)
  web/       Frontend — React + TypeScript + Vite
packages/
  shared/    Types ที่ใช้ร่วมกันระหว่าง Frontend/Backend
```

## การติดตั้ง

ต้องมี [Bun](https://bun.sh) ≥ 1.4 ก่อน

```bash
bun install   # จาก root ของโปรเจกต์
```

## การรัน (แยก Frontend/Backend)

เปิดเทอร์มินัล 2 อันจาก root:

```bash
# Terminal 1 — Backend API บน http://localhost:3000
bun run dev:api

# Terminal 2 — Frontend บน http://localhost:5173
bun run dev:web
```

เปิด <http://localhost:5173/> หน้าแรกจะโหลด `/api/health` จาก Backend มาแสดง
สถานะ (ถ้า Backend ไม่เปิด จะแสดงข้อความ error อย่างชัดเจนแทน)

### env

- `apps/api/.env.example` → คัดลอกเป็น `apps/api/.env` (หรือตั้งใน shell)
  - `PORT` — port ของ API (default `3000`)
  - `CORS_ORIGIN` — origin ที่อนุญาตข้าม CORS (default `http://localhost:5173`)
  - `DATABASE_PATH` — path ไฟล์ SQLite (default `data/pac-man.db`; ใช้ `:memory:` เมื่อไม่ต้องการเก็บข้อมูล เช่น test)
- `apps/web/.env.example` → คัดลอกเป็น `apps/web/.env`
  - `VITE_API_URL` — URL ของ API (default `http://localhost:3000`)
- **ห้าม**ใส่ secret ลงใน source code หรือ `.env.example` (`.env*` ถูก ignore แล้ว)

## Scripts (รันจาก root)

| คำสั่ง | ความหมาย |
|---|---|
| `bun run dev:api` | รัน API แบบ hot-reload (`bun --hot`) |
| `bun run dev:web` | รัน Vite dev server |
| `bun run build` | build web + api ลง `dist/` |
| `bun run typecheck` | typecheck ทั้ง web, api และ shared |
| `bun run test` | `bun test` (ค้นทั้ง repo) |

รัน script ของแต่ละแอปได้ด้วย `bun run <script>` ใน `apps/web` / `apps/api`

## ฐานข้อมูล (SQLite)

เลือก **SQLite** เพราะโปรเจกต์ขนาดเล็ก + `bun:sqlite` เป็น built-in ของ Bun → ไม่เพิ่ม dependency ภายนอก

- ฐานข้อมูลคือไฟล์เดียวตาม `DATABASE_PATH` (default `data/pac-man.db`) — `.gitignore` ครอบ `data/` ไว้แล้ว
- เริ่ม Backend แล้ว `openDb()` จะรัน migration (`CREATE TABLE IF NOT EXISTS leaderboard …`) ให้อัตโนมัติ — ทำซ้ำได้ (idempotent) ทุกครั้งที่เริ่ม ไม่ต้องตั้งค่าด้วยมือ
- ข้อมูลถูกเก็บในไฟล์ → **อยู่หลัง restart Backend** (ลบไฟล์ `data/pac-man.db` เพื่อเริ่มใหม่)
- การเขียนข้อมูลใช้ parameterized queries (`?`) ป้องกัน SQL injection

## API

| Method | Path | ความหมาย |
|---|---|---|
| `GET` | `/api/health` | สถานะ Backend (พร้อม CORS สำหรับ dev origin) |
| `GET` | `/api/leaderboard?limit=N` | คะแนนสูงสุด `N` รายการ (`1..50`, default `10`) เรียง score มาก→น้อย |
| `POST` | `/api/leaderboard` | ส่งคะแนน `{"playerName": string (1–20 ตัว), "score": integer 0–1,000,000, "clientRequestId": uuid (optional)}` → `201`; validation ผิด → `400`; เกิน rate limit → `429` |

- Error ทั้งหมดตอบรูปแบบเดียวกัน `{"error": "...", "message": "..."}` โดยไม่เปิดเผย stack trace หรือรายละเอียดภายใน
- `POST` ถูกจำกัดอัตราด้วย in-memory rate limiter (default window/จำนวนตาม `apps/api/src/index.ts`)
- `clientRequestId` (uuid) เป็น **idempotency key** — ส่งคะแนนซ้ำด้วย id เดียวกัน (เช่น retry หลัง network error) Backend จะไม่ insert ซ้ำ มี unique index บนคอลัมน์ และ `ON CONFLICT DO NOTHING`

## Frontend ↔ Backend (Phase 7)

- **API client แยกจาก UI** ที่ `apps/web/src/api/client.ts` (`fetchHealth`, `fetchLeaderboard`, `submitScore`) — ใช้ types จาก `@pac-man/shared` ร่วมกับ Backend โดยตรง ไม่มี mock
- ฐาน URL มาจาก `VITE_API_URL` (default `http://localhost:3000`) และทุก request มี **timeout 5s** (AbortController) — network error/timeout จะแสดงเป็น state error ให้ retry ได้
- หน้า Leaderboard (`Leaderboard.tsx`) โหลดจาก API จริงตอนเปิดหน้า มี state `loading / empty / error / loaded` ครบ + ปุ่ม Retry; **ถ้า API ล่ม เกมยังเล่นได้** — error แสดงแค่ในส่วน Leaderboard แยกจากสถานะเกม
- เมื่อจบเกม (ชนะ/แพ้) ฟอร์ม `ScoreSubmit.tsx` เสนอบันทึกคะแนน — แสดงผลลัพธ์**จริง**เท่านั้น (success/failure) ไม่อวด success ล่วงหน้า
- **กันคะแนนซ้ำ** 3 ชั้น: (1) ปุ่ม/ฟอร์ม disable ระหว่าง submit + ref guard กัน double-click/re-render, (2) trigger จบเกมครั้งเดียวต่อรอบเกม via `submittedIdRef`, (3) retry ใช้ `clientRequestId` เดียวกัน → Backend dedupe ไม่ insert ซ้ำ
- ข้อมูลจาก network ไม่เชื่อถือ → client ตรวจ shape (`isLeaderboardEntry`) ก่อนใช้ และ slice ตาม `limit` อีกชั้น

## หมายเหตุ

- Phase 6: leaderboard เป็นแบบ **local/trusted-client** — คะแนนที่ส่งจาก Browser แก้ไขได้ จึงยังไม่มีการตรวจสอบเกมฝั่ง Server และ**ไม่สามารถป้องกันการโกงได้สมบูรณ์** (เป็นขอบเขตที่ระบุไว้)
- CORS จำกัด origin แค่ `CORS_ORIGIN` ใน env — ไม่เปิด `*`

## QA (Phase 8)

ตรวจสอบแล้วด้วยคำสั่งจริง (Bun 1.4.3, Windows):

| หมวด | ผล |
|---|---|
| `bun run typecheck` | ✅ ผ่านทั้ง web / api / shared |
| `bun run test` | ✅ 75 tests ผ่าน (295 expect) |
| `bun run build` | ✅ web → `apps/web/dist/`, api → `apps/api/dist/index.js` |
| `bun audit` | ✅ ไม่พบช่องโหว่ (134 packages) |
| Smoke test (HTTP จริง) | ✅ health / leaderboard POST+GET / validation 400 / rate limit 429 / dedupe id ซ้ำ / persistence หลัง restart |

ข้อจำกัดที่รับทราบ (ยังไม่ได้แก้ไข):

- **การป้องกันการโกงคะแนนไม่สมบูรณ์** — backend เชื่อถือ `score` ที่ client ส่ง ตามขอบเขต local/trusted-client (Phase 6)
- **Rate limit เป็น in-memory ต่อ instance** — ไม่กระจายข้าม instance; window เดียวต่อ process
- **ไม่มี lint script** ใน `package.json` (ไม่มี ESLint/Prettier ในโปรเจกต์) — ใช้ typecheck เป็นตัวตรวจ static หลัก
- Rate limiting พิสูจน์ด้วยการยิงเกิน 20 ครั้ง/นาที ได้ `429` ครบ (50+ POST ใน window เดียว)
