import type {
  CreateScoreRequest,
  HealthResponse,
  LeaderboardEntry,
  LeaderboardListResponse,
} from "@pac-man/shared";

/**
 * API client ชั้นเดียวกับที่ Frontend ใช้คุยกับ Backend (แยกจาก UI และ Game Engine)
 *
 * - ใช้ฐาน URL จาก VITE_API_URL (ดู .env.example) — default http://localhost:3000
 * - ทุก call มี timeout (AbortController) — ถ้า backend ไม่ตอบจะ reject ไม่ค้างคา
 * - error ที่โยนให้ UI คือ ApiClientError พร้อม status + code จาก response body
 * - ตรวจ shape ของ response กับ type ที่ backend ประกาศ (ข้อมูลไม่น่าเชื่อถือ → validate)
 */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL === undefined
    ? "http://localhost:3000"
    : trimTrailingSlashes(import.meta.env.VITE_API_URL);

/** error มาตรฐานที่ client โยน — UI ใช้ status/code แสดงข้อความได้ */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

/** timeout — ถ้า fetch ค้างเกินนี้ให้ abort (ค่าเริ่มต้น 5s) */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * core request helper
 * @param timeoutMs ตัวเลือก — ใช้ทดสอบ timeout สั้นๆ ได้ (ไม่ต้องรอ 5s)
 */
export async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      // backend ตอบ error format {error, message} เสมอ (Phase 6) — parse ก่อน
      let code = "unknown";
      let message = `Request failed with status ${res.status}`;
      try {
        const body = (await res.json()) as Partial<ApiErrorBody>;
        if (typeof body?.error === "string") code = body.error;
        if (typeof body?.message === "string") message = body.message;
      } catch {
        // body ไม่ใช่ JSON ที่คาด — ใช้ default
      }
      throw new ApiClientError(res.status, code, message);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    // network error / timeout / abort — แยกข้อความให้ UI เห็นว่าควร retry ได้
    const aborted = err instanceof DOMException && err.name === "AbortError";
    throw new ApiClientError(0, "network_error", aborted ? "Request timed out" : "Network error");
  } finally {
    clearTimeout(timer);
  }
}

interface ApiErrorBody {
  error: string;
  message: string;
}

/** validate shape ของ entry ที่ backend คืน — ข้อมูลจาก network ตรวจก่อนใช้ */
function isLeaderboardEntry(v: unknown): v is LeaderboardEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "number" &&
    typeof o.playerName === "string" &&
    typeof o.score === "number" &&
    typeof o.createdAt === "string"
  );
}

/** GET /api/health */
export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

/** GET /api/leaderboard?limit= — คืนรายการ top scores เรียง score มาก→น้อย */
export async function fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const data = await request<LeaderboardListResponse>(`/api/leaderboard?limit=${limit}`);
  if (!data || !Array.isArray(data.entries) || !data.entries.every(isLeaderboardEntry)) {
    throw new ApiClientError(0, "invalid_response", "Malformed leaderboard response");
  }
  // กันข้อมูลเหลื่อมขอบเขตจาก backend จริง (defense in depth — backend ก็ตรวจแล้ว)
  return data.entries.slice(0, limit);
}

/** POST /api/leaderboard — ส่งคะแนนรอบจบเกม (clientRequestId กันซ้ำตอน retry) */
export async function submitScore(input: CreateScoreRequest): Promise<LeaderboardEntry> {
  const data = await request<LeaderboardEntry>("/api/leaderboard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!isLeaderboardEntry(data)) {
    throw new ApiClientError(0, "invalid_response", "Malformed submit response");
  }
  return data;
}
