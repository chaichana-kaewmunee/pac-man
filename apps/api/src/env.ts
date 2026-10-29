/**
 * การอ่านและ validate environment variables
 * Bun โหลด .env จาก working directory ให้อัตโนมัติเมื่อรัน (ดู apps/api/.env.example)
 * ค่าที่ไม่มี default จะ throw ทันที แทนที่จะปล่อยให้ server รันด้วยค่าผิดพลาดเงียบ ๆ
 */

function readPort(raw: string | undefined): number {
  const value = Number(raw ?? "3000");
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(
      `Invalid PORT: "${raw ?? "(unset)"}". Expected an integer between 1 and 65535.`,
    );
  }
  return value;
}

function readCorsOrigin(raw = "http://localhost:5173"): string {
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    throw new Error(
      `Invalid CORS_ORIGIN: "${raw}". Expected an absolute http(s) URL.`
    );
  }
  // ตัด trailing slash เพื่อให้ตรงกับ Origin header ที่ browser ส่งมา
  let end = raw.length;
  while (end > 0 && raw[end - 1] === "/") end--;
  return raw.slice(0, end);
}

export const env = {
  port: readPort(process.env.PORT),
  corsOrigin: readCorsOrigin(process.env.CORS_ORIGIN),
  databasePath: process.env.DATABASE_PATH ?? "data/pac-man.db",
} as const;