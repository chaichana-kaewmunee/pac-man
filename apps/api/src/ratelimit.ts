/**
 * Rate limiter แบบ in-memory sliding window — พอเพียงสำหรับโปรเจกต์ขนาดเล็ก
 * (ระยะเวลา/จำนวนจำกัดต่อ key ที่กำหนด เช่น IP)
 *
 * หมายเหตุ: ข้อมูลอยู่ใน memory ของ process นี้เท่านั้น — reset เมื่อ restart server
 * (สำหรับหลาย instance ต้องใช้ store กลาง เช่น Redis ซึ่งเกินขอบเขตนี้)
 */

export interface RateLimitOptions {
  /** ความยาวของ window (ms) */
  windowMs: number;
  /** จำนวน request สูงสุดต่อ window ต่อ key */
  max: number;
}

export interface RateLimiter {
  /** true = อนุญาต, false = เกิน limit (ถูกบล็อกใน window นี้) */
  allow(key: string): boolean;
}

export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  const { windowMs, max } = opts;
  if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isInteger(max) || max <= 0) {
    throw new Error("Invalid rate limit options");
  }
  const hits = new Map<string, number[]>();

  return {
    allow(key: string): boolean {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}