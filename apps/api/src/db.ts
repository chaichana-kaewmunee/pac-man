import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * เปิด database (SQLite ผ่าน bun:sqlite — built-in ของ Bun ไม่ต้องติดตั้งเพิ่ม)
 * และรัน migration ที่ทำซ้ำได้ (idempotent) ทุกครั้งที่เริ่ม
 *
 * - ":memory:" ใช้สำหรับ test
 * - path ไฟล์จริงใช้สำหรับ dev/production — ข้อมูลอยู่หลัง restart
 */
export function openDb(path: string): Database {
  const isMemory = path === ":memory:";
  if (!isMemory) {
    // bun:sqlite สร้างไฟล์ได้ แต่ต้องมี parent directory อยู่ก่อน
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  migrate(db);
  return db;
}

/** migration เริ่มต้น — สร้างตาราง leaderboard และ index (idempotent) */
export function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leaderboard_score
      ON leaderboard(score DESC, id ASC);
  `);

  // Phase 7: เพิ่ม idempotency key (client_request_id) — สำหรับตารางที่สร้างใน Phase 6
  // ตรวจ column ก่อน ALTER เพื่อให้ migration ยังรันซ้ำได้ (idempotent)
  const cols = db.query(`PRAGMA table_info(leaderboard)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "client_request_id")) {
    db.exec(`ALTER TABLE leaderboard ADD COLUMN client_request_id TEXT`);
  }
  // unique index (partial: เฉพาะที่มีค่า) — ใช้ ON CONFLICT dedupe คะแนนซ้ำจาก retry
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_client_request_id
      ON leaderboard(client_request_id)
      WHERE client_request_id IS NOT NULL;
  `);
}