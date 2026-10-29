/**
 * Types ที่ใช้ร่วมกันระหว่าง Frontend (apps/web) และ Backend (apps/api)
 * เก็บเฉพาะ types/schema ที่ทั้งสองฝั่งต้องเห็นตรงกันเท่านั้น
 */

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
}

/** รายการคะแนนใน leaderboard (หนึ่งแถวในตาราง) */
export interface LeaderboardEntry {
  id: number;
  playerName: string;
  score: number;
  createdAt: string;
}

/** Response ของ GET /api/leaderboard */
export interface LeaderboardListResponse {
  entries: LeaderboardEntry[];
}

/**
 * Body ของ POST /api/leaderboard
 * หมายเหตุ: เป็น "trusted-client" mode — คะแนนนี้ส่งจาก Browser ซึ่งผู้เล่นแก้ไขได้
 * Backend รับและบันทึกตามค่าที่ส่งมาเท่านั้น ยังไม่มีการตรวจสอบความถูกต้องของเกมฝั่ง Server
 *
 * clientRequestId: id ที่ client สร้างครั้งเดียวต่อรอบเกม (เช่น crypto.randomUUID())
 * ใช้ป้องกันคะแนนซ้ำเมื่อ client ต้อง retry (timeout/network error) — backend จะไม่ insert ซ้ำ
 * ถ้าไม่ส่ง (request เก่า) backend จะไม่ dedupe
 */
export interface CreateScoreRequest {
  playerName: string;
  score: number;
  clientRequestId?: string;
}