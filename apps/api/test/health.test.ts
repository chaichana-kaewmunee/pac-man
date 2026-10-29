import { describe, expect, test } from "bun:test";
import type { HealthResponse } from "@pac-man/shared";
import { createApp } from "../src/app";
import { openDb } from "../src/db";
import { env } from "../src/env";
import { createRateLimiter } from "../src/ratelimit";

function makeApp() {
  return createApp(openDb(":memory:"), createRateLimiter({ windowMs: 60_000, max: 100 }), env.corsOrigin);
}

describe("GET /api/health", () => {
  test("returns 200 with the documented shape", async () => {
    const res = await makeApp().handle(new Request("http://localhost/api/health"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = (await res.json()) as HealthResponse;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("pac-man-api");
    expect(typeof body.version).toBe("string");
    expect(Number.isFinite(Date.parse(body.timestamp))).toBe(true);
    expect(Number.isFinite(body.uptimeSeconds)).toBe(true);
  });

  test("CORS preflight allows the configured dev origin", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/health", {
        method: "OPTIONS",
        headers: {
          Origin: env.corsOrigin,
          "Access-Control-Request-Method": "GET",
        },
      }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(env.corsOrigin);
  });

  test("CORS preflight rejects an unknown origin", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/health", {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil.example.com",
          "Access-Control-Request-Method": "GET",
        },
      }),
    );

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});