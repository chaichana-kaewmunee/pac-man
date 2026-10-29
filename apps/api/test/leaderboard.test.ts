import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import type { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CreateScoreRequest,
  LeaderboardEntry,
  LeaderboardListResponse,
} from "@pac-man/shared";
import { createApp } from "../src/app";
import { openDb } from "../src/db";
import { createRateLimiter, type RateLimiter } from "../src/ratelimit";

describe("leaderboard API", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  // rate limiter ที่ไม่จำกัด (test ผ่านเสมอ ยกเว้น test ที่ตั้งใจ trigger 429)
  let limiter: RateLimiter;

  beforeAll(() => {
    db = openDb(":memory:");
    limiter = createRateLimiter({ max: 1000, windowMs: 60_000 });
    app = createApp(db, limiter, "http://localhost:5173");
  });

  afterAll(() => {
    db.close();
  });

  async function getLeaderboard(limit?: number): Promise<Response> {
    const url = limit !== undefined
      ? `http://localhost:3000/api/leaderboard?limit=${limit}`
      : "http://localhost:3000/api/leaderboard";
    return app.handle(new Request(url));
  }

  async function postScore(
    body: unknown,
    opts: { raw?: boolean } = {},
  ): Promise<Response> {
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: opts.raw ? (body as string) : JSON.stringify(body),
    };
    return app.handle(new Request("http://localhost:3000/api/leaderboard", init));
  }

  test("returns empty list initially", async () => {
    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    const data = (await res.json()) as LeaderboardListResponse;
    expect(data.entries).toEqual([]);
  });

  test("POST saves a score and returns 201 with the row", async () => {
    const res = await postScore({ playerName: "Alice", score: 1500 });
    expect(res.status).toBe(201);
    const data = (await res.json()) as LeaderboardEntry;
    expect(data.id).toBeTypeOf("number");
    expect(data.playerName).toBe("Alice");
    expect(data.score).toBe(1500);
    expect(typeof data.createdAt).toBe("string");
  });

  test("GET returns scores ordered by score desc, with limit", async () => {
    await postScore({ playerName: "Bob", score: 2500 });
    await postScore({ playerName: "Carol", score: 900 });
    const res = await getLeaderboard(2);
    expect(res.status).toBe(200);
    const data = (await res.json()) as LeaderboardListResponse;
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0].playerName).toBe("Bob"); // 2500
    expect(data.entries[1].playerName).toBe("Alice"); // 1500
  });

  test("trims player name and enforces limits", async () => {
    const res = await postScore({ playerName: "  Dave  ", score: 100 });
    expect(res.status).toBe(201);
    const data = (await res.json()) as LeaderboardEntry;
    expect(data.playerName).toBe("Dave");
  });

  test("rejects invalid playerName (too long / empty / missing)", async () => {
    const tooLong = await postScore({ playerName: "x".repeat(21), score: 5 });
    expect(tooLong.status).toBe(400);
    const empty = await postScore({ playerName: "   ", score: 5 });
    expect(empty.status).toBe(400);
  });

  test("rejects invalid score (negative / too large / non-integer / missing)", async () => {
    expect((await postScore({ playerName: "A", score: -1 })).status).toBe(400);
    expect((await postScore({ playerName: "A", score: 1_000_001 })).status).toBe(400);
    expect((await postScore({ playerName: "A", score: 12.5 })).status).toBe(400);
    expect((await postScore({ playerName: "A" })).status).toBe(400);
  });

  test("rejects malformed JSON body", async () => {
    const res = await postScore("{ not valid json", { raw: true });
    expect(res.status).toBe(400);
  });

  test("rejects invalid limit query", async () => {
    expect((await getLeaderboard(0)).status).toBe(400);
    expect((await getLeaderboard(51)).status).toBe(400);
    expect((await getLeaderboard(1.5)).status).toBe(400);
  });

  test("error responses have a consistent shape (no stack trace)", async () => {
    const res = await postScore({ playerName: "x".repeat(90), score: 5 });
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBeTypeOf("string");
    expect(body.message).toBeTypeOf("string");
    expect(JSON.stringify(body)).not.toContain("at ");
    expect(JSON.stringify(body)).not.toContain("Error:");
  });

  test("rate limiter returns 429 when exceeded", async () => {
    // limiter ใหม่ที่ให้ได้ 2 ครั้ง — ครั้งที่ 3 ต้อง 429
    const limiter2 = createRateLimiter({ max: 2, windowMs: 60_000 });
    const app2 = createApp(db, limiter2, "http://localhost:5173");
    const post = () =>
      app2.handle(
        new Request("http://localhost:3000/api/leaderboard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playerName: "Eve", score: 7 }),
        }),
      );
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
  });

  test("data persists across app instances when using a file database", async () => {
    // ใช้ database จริง (temp file ใน OS tmp) — สร้าง app ใหม่ (เหมือน restart) แล้วต้องเห็นข้อมูลเดิม
    const tmpPath = join(tmpdir(), `pac-man-leaderboard-${Date.now()}.db`);
    try {
      const dbFile = openDb(tmpPath);
      const appFile = createApp(
        dbFile,
        createRateLimiter({ max: 1000, windowMs: 60_000 }),
        "http://localhost:5173",
      );
      await appFile.handle(
        new Request("http://localhost:3000/api/leaderboard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playerName: "Persist", score: 42 }),
        }),
      );
      dbFile.close();

      // "restart" — เปิด db เดิมอีกครั้ง
      const dbReopen = openDb(tmpPath);
      const appReopen = createApp(
        dbReopen,
        createRateLimiter({ max: 1000, windowMs: 60_000 }),
        "http://localhost:5173",
      );
      const res = await appReopen.handle(
        new Request("http://localhost:3000/api/leaderboard"),
      );
      const data = (await res.json()) as LeaderboardListResponse;
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].playerName).toBe("Persist");
      expect(data.entries[0].score).toBe(42);
      dbReopen.close();
    } finally {
      // Windows: bun:sqlite อาจยัง lock ไฟล์อยู่ช่วงสั้นๆ หลัง close — รอแล้วค่อยลบ
      await Bun.sleep(100);
      rmSync(tmpPath, { force: true });
    }
  });

  test("retry with the same clientRequestId does not insert a duplicate", async () => {
    const body = { playerName: "Retry", score: 555, clientRequestId: "game-run-0001" };
    // ครั้งแรก — insert จริง
    const first = await postScore(body);
    expect(first.status).toBe(201);
    // retry (เช่น timeout แล้ว client ส่งซ้ำ) — ต้องไม่ insert ซ้ำ
    const retry = await postScore(body);
    expect(retry.status).toBe(201);
    const retryData = (await retry.json()) as LeaderboardEntry;
    expect(retryData.id).toBe((await first.json() as LeaderboardEntry).id); // แถวเดิม

    const list = await getLeaderboard();
    const data = (await list.json()) as LeaderboardListResponse;
    const matching = data.entries.filter((e) => e.playerName === "Retry");
    expect(matching).toHaveLength(1); // dedupe สำเร็จ — มีแค่แถวเดียว
  });

  test("different clientRequestId creates separate entries", async () => {
    await postScore({ playerName: "Once", score: 10, clientRequestId: "game-aaa" });
    await postScore({ playerName: "Once", score: 20, clientRequestId: "game-bbb" });
    const list = await getLeaderboard();
    const data = (await list.json()) as LeaderboardListResponse;
    const matching = data.entries.filter((e) => e.playerName === "Once");
    expect(matching).toHaveLength(2);
  });

  test("rejects invalid clientRequestId shape", async () => {
    expect(
      (await postScore({ playerName: "A", score: 1, clientRequestId: "ab" })).status,
    ).toBe(400); // สั้นเกิน (min 8)
    expect(
      (await postScore({ playerName: "A", score: 1, clientRequestId: "has space!" })).status,
    ).toBe(400); // มี space + ! — ไม่อยู่ในชุดที่อนุญาต
  });

  test("SQL injection attempts are stored as plain data (parameterized queries)", async () => {
    // payload ทั้งหมดอยู่ภายใน maxLength 20 → ผ่าน validation เข้าถึง query
    // ถ้า query ไม่ parameterized ค่าเหล่านี้จะถูกตีความเป็นคำสั่ง SQL — ต้องถูกเก็บเป็นชื่อปกติเท่านั้น
    const attempts = [
      { playerName: "'); DROP TABLE l;--", score: 1 },
      { playerName: "B'); DROP TABLE l;--", score: 2 },
      { playerName: "a' OR '1'='1", score: 3 },
      { playerName: 'x" OR 1=1 --', score: 4 },
      { playerName: "1; SELECT * FROM x;", score: 5 },
    ];
    for (const body of attempts) {
      const res = await postScore(body);
      expect(res.status).toBe(201);
    }
    // ตารางยังอยู่ + list ยังทำงาน + ค่าถูกเก็บเป็นชื่อตามที่ส่ง (ไม่ถูกตีความเป็น SQL)
    const list = await getLeaderboard(50);
    expect(list.status).toBe(200);
    const data = (await list.json()) as LeaderboardListResponse;
    const names = data.entries.map((e) => e.playerName);
    for (const a of attempts) {
      expect(names).toContain(a.playerName);
    }
  });
});
