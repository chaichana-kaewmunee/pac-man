import { Elysia, t } from "elysia";
import type { Database } from "bun:sqlite";
import type {
  CreateScoreRequest,
  LeaderboardEntry,
  LeaderboardListResponse,
} from "@pac-man/shared";
import type { RateLimiter } from "./ratelimit";

/** ขีดจำกัดที่ยอมรับ (เป็นนโยบายเดียวกับที่ UI ใช้ด้วย) */
export const MAX_NAME_LENGTH = 20;
export const MAX_SCORE = 1_000_000;
export const MIN_SCORE = 0;
export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 10;

/** Error format สม่ำเสมอที่ Client เห็น — ไม่เปิดเผย stack trace หรือรายละเอียดภายใน */
export interface ApiErrorBody {
  error: string;
  message: string;
}

function errorBody(error: string, message: string): ApiErrorBody {
  return { error, message };
}

/** โหลดคะแนนสูงสุด `limit` รายการ เรียง score จากมากไปน้อย (break tie ด้วย id ล่าสุดก่อน) */
export function listTopScores(db: Database, limit: number): LeaderboardEntry[] {
  const stmt = db.query(
    `SELECT id, player_name AS playerName, score, created_at AS createdAt
     FROM leaderboard
     ORDER BY score DESC, id ASC
     LIMIT ?`,
  );
  return stmt.all(limit) as unknown as LeaderboardEntry[];
}
// (parameterized: `?` — Bun sqlite รองรับ)

/** บันทึกคะแนน — insert แล้วคืน row ที่สร้าง (พร้อม id)
 *  ถ้า request มี clientRequestId ซ้ำกับแถวเดิม (เช่น retry จาก client) → ไม่ insert ซ้ำ
 *  คืนแถวเดิม (result.changes === 0 เมื่อ ON CONFLICT ไม่ได้ insert) */
export function insertScore(db: Database, input: CreateScoreRequest): LeaderboardEntry {
  const createdAt = new Date().toISOString();
  const result = db
    .query(
      `INSERT INTO leaderboard (player_name, score, created_at, client_request_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING`,
    )
    .run(input.playerName, input.score, createdAt, input.clientRequestId ?? null);

  if (result.changes === 0 && input.clientRequestId) {
    // conflict → คืนแถวเดิม (dedupe) — client เห็นว่า "บันทึกแล้ว" ไม่ผิดพลาด
    const existing = db
      .query(
        `SELECT id, player_name AS playerName, score, created_at AS createdAt
         FROM leaderboard WHERE client_request_id = ?`,
      )
      .get(input.clientRequestId) as LeaderboardEntry | null;
    if (existing) return existing;
  }

  return {
    id: Number(result.lastInsertRowid),
    playerName: input.playerName,
    score: input.score,
    createdAt,
  };
}
// (created_at เป็น ISO string — เรียงตาม score ไม่ใช่เวลา)

/**
 * Elysia plugin: creates `/api/leaderboard` routes
 * rateLimiter ต้อง inject เพื่อให้ test ใช้ limiter ที่ knowable
 */
export function leaderboardRoutes(db: Database, rateLimiter: RateLimiter) {
  return new Elysia({ prefix: "/api/leaderboard" })
    .onError(({ code, set }) => {
      if (code === "VALIDATION" || code === "PARSE") {
        // Elysia schema validation / JSON parse error (body/query ผิดรูปแบบ หรือ JSON ไม่ valid)
        // — ตอบเป็น error format เดียวกัน โดยไม่เปิดรายละเอียดภายในของสิ่งที่ client ส่งผิด
        set.status = 400;
        return errorBody("invalid_request", "Invalid request payload");
      }
      // error อื่น (เช่น จาก database) — ไม่เปิดเผย stack trace หรือข้อความภายใน
      set.status = 500;
      return errorBody("internal_error", "Internal server error");
    })
    .guard({
      response: {
        400: t.Object({ error: t.String(), message: t.String() }),
        429: t.Object({ error: t.String(), message: t.String() }),
        500: t.Object({ error: t.String(), message: t.String() }),
      },
    })
    .get(
      "/",
      ({ query, set }): LeaderboardListResponse | ApiErrorBody => {
        const raw = query?.limit;
        const limit =
          raw !== undefined && raw !== ""
            ? Number(raw)
            : DEFAULT_LIMIT;
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
          set.status = 400;
          return errorBody("invalid_limit", `limit must be an integer between 1 and ${MAX_LIMIT}`);
        }
        return { entries: listTopScores(db, limit) };
      },
      {
        query: t.Optional(
          t.Object({
            limit: t.Optional(t.Union([t.String(), t.Number()])),
          }),
        ),
        detail: { summary: "Get top scores" },
      },
    )
    .post(
      "/",
      ({ body, set }) => {
        if (!rateLimiter.allow("leaderboard")) {
          set.status = 429;
          return errorBody("rate_limited", "Too many requests. Please try again later.");
        }
        const entry = insertScore(db, {
          playerName: body.playerName.trim(),
          score: body.score,
          clientRequestId: body.clientRequestId,
        });
        set.status = 201;
        return entry;
      },
      {
        body: t.Object({
          // pattern: ต้องมีอักขระที่ไม่ใช่ whitespace อย่างน้อย 1 ตัว (ชื่อ "   " ไม่ผ่าน)
          playerName: t.String({
            minLength: 1,
            maxLength: MAX_NAME_LENGTH,
            pattern: String.raw`\S`,
          }),
          score: t.Integer({ minimum: MIN_SCORE, maximum: MAX_SCORE }),
          // UUID ที่ client สร้างครั้งเดียวต่อรอบเกม — กันคะแนนซ้ำจาก retry
          clientRequestId: t.Optional(
            t.String({
              minLength: 8,
              maxLength: 64,
              pattern: "^[A-Za-z0-9_-]+$",
            }),
          ),
        }),
        detail: { summary: "Submit a score" },
      },
    );
}
