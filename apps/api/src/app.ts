import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import type { Database } from "bun:sqlite";
import type { HealthResponse } from "@pac-man/shared";
import type { RateLimiter } from "./ratelimit";
import { leaderboardRoutes } from "./leaderboard";

const SERVICE_NAME = "pac-man-api";
const SERVICE_VERSION = "0.1.0";

function buildHealthResponse(): HealthResponse {
  return {
    status: "ok",
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

/**
 * สร้าง Elysia app — รับ db + rateLimiter เพื่อให้ test ใช้ database/limiter ที่ควบคุมได้
 * (production ใช้ openDb() + createRateLimiter() จาก index.ts)
 */
export function createApp(db: Database, rateLimiter: RateLimiter, corsOrigin: string) {
  return new Elysia()
    .use(
      cors({
        // จำกัด origin เฉพาะที่กำหนดใน env — ไม่เปิด * (open) เกินจำเป็น
        origin: corsOrigin,
        methods: ["GET", "POST"],
      }),
    )
    .get("/api/health", buildHealthResponse)
    .use(leaderboardRoutes(db, rateLimiter));
}
