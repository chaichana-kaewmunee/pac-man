export type { GameStatus } from "../game/types";

/**
 * เหตุการณ์ที่ GameScene ส่งออกไปยัง React (ผ่าน Phaser registry events)
 * — React ไม่แตะ game objects โดยตรง ฟังแค่ event ที่มี payload เป็น primitive
 */
export const GAME_EVENTS = {
  /** (snapshot) ทุก frame ระหว่างเล่น — สำหรับ legacy/เพื่อ debug */
  SNAPSHOT: "game:snapshot",
  /** (status, score, lives) เมื่อสถานะเกมเปลี่ยน — React ใช้แสดง HUD/overlay */
  STATUS: "game:status",
  /** (score) ยิงเมื่อเก็บ pellet (คะแนนเพิ่ม) — React ใช้ feedback สั้นๆ */
  PELLET_EATEN: "game:pellet-eaten",
  /** () ยิงเมื่อ Pac-Man ตาย (ชีวิตลด) — React ใช้ feedback ตาย */
  PLAYER_DIED: "game:player-died",
  /** () เริ่มเล่นจริง (กด Play ในเมนู) */
  START: "game:start",
  /** () pause เกม (กด Pause ใน HUD / ปุ่ม) */
  PAUSE: "game:pause",
  /** () resume เกมต่อ (กด Resume ใน pause) */
  RESUME: "game:resume",
  /** () reset เกมแล้ว (อยู่ใน ready) */
  READY: "game:ready",
} as const;
