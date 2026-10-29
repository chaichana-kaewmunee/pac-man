import { afterEach, describe, expect, test } from "bun:test";
import {
  ApiClientError,
  fetchLeaderboard,
  request,
  submitScore,
} from "../src/api/client";

/**
 * test ของ API client layer (apps/web/src/api/client.ts)
 * mock global.fetch — ไม่ต้องรัน Backend จริง
 * ครอบคลุม: success path, error mapping, network error, timeout, malformed response
 */

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  // @ts-expect-error — เราแทนที่ fetch ทั้งหมดใน test
  globalThis.fetch = impl;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("fetchLeaderboard", () => {
  test("returns entries on 200", async () => {
    mockFetch(async (input) => {
      const url = String(input);
      expect(url).toContain("/api/leaderboard?limit=10");
      return jsonResponse({
        entries: [
          { id: 1, playerName: "Alice", score: 100, createdAt: "2026-01-01T00:00:00Z" },
        ],
      });
    });
    const entries = await fetchLeaderboard(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].playerName).toBe("Alice");
  });

  test("throws ApiClientError with backend error body on 400", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "invalid_limit", message: "limit must be an integer" }, 400),
    );
    try {
      await fetchLeaderboard(10);
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const e = err as ApiClientError;
      expect(e.status).toBe(400);
      expect(e.code).toBe("invalid_limit");
    }
  });

  test("throws network_error when fetch rejects", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    try {
      await fetchLeaderboard(10);
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).code).toBe("network_error");
      expect((err as ApiClientError).status).toBe(0);
    }
  });

  test("throws invalid_response on malformed body", async () => {
    mockFetch(async () => jsonResponse({ entries: [{ id: "not-a-number" }] }));
    try {
      await fetchLeaderboard(10);
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).code).toBe("invalid_response");
    }
  });

  test("throws network_error (timeout) when request never resolves and aborts", async () => {
    let aborted = false;
    mockFetch(async (_input, init) => {
      // ทำเหมือน fetch ที่ค้างจน abort (DOMException AbortError)
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });
    // ใช้ request โดยตรงกับ timeout 50ms — จำลอง "backend ไม่ตอบจนครบ timeout"
    try {
      await request("/api/leaderboard?limit=10", undefined, 50);
      expect.unreachable("should throw");
    } catch (err) {
      expect(aborted).toBe(true);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).code).toBe("network_error");
    }
  });
});

describe("submitScore", () => {
  test("posts body (with clientRequestId) and returns entry", async () => {
    mockFetch(async (_input, init) => {
      expect(init?.method).toBe("POST");
      const sent = JSON.parse(String(init?.body));
      expect(sent.playerName).toBe("Bob");
      expect(sent.clientRequestId).toBe("game-123");
      return jsonResponse(
        { id: 7, playerName: "Bob", score: 999, createdAt: "2026-01-01T00:00:00Z" },
        201,
      );
    });
    const entry = await submitScore({ playerName: "Bob", score: 999, clientRequestId: "game-123" });
    expect(entry.id).toBe(7);
    expect(entry.score).toBe(999);
  });

  test("maps 429 rate-limit to ApiClientError", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "rate_limited", message: "Too many requests" }, 429),
    );
    try {
      await submitScore({ playerName: "A", score: 1 });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const e = err as ApiClientError;
      expect(e.status).toBe(429);
      expect(e.code).toBe("rate_limited");
    }
  });
});
