import type { Direction, GridCoord, MazeGrid } from "./types";

/** ความเร็วของ Pac-Man ในหน่วย tile ต่อวินาที */
export const PACMAN_SPEED = 6; // tiles/second

/** เวกเตอร์ (dx, dy) ของแต่ละทิศทาง — บน grid ที่ y เพิ่มลงล่าง */
export const DIRECTION_VECTORS: Record<Direction, GridCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * ตรวจว่า tile (col, row) เดินเข้าได้หรือไม่ (ไม่ใช่กำแพง และอยู่ในขอบ)
 * ใช้กับพิกัด integer เท่านั้น — collision ก่อนขยับทุกครั้ง
 */
export function isWalkable(maze: MazeGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= maze.cols || y >= maze.rows) return false;
  return maze.tiles[y][x] !== "wall";
}

/**
 * true ถ้าพิกัด float ปัจจุบันอยู่ตรงกลาง tile พอดี (ภายใน tolerance)
 * ใช้ตัดสินใจว่าเลี้ยวได้ที่จุดตัดหรือยัง (กันติดมุม)
 */
export function isAtTileCenter(
  x: number,
  y: number,
  tolerance = 1e-3,
): boolean {
  return Math.abs(x - Math.round(x)) <= tolerance &&
    Math.abs(y - Math.round(y)) <= tolerance;
}

/**
 * หา tile ที่ Pac-Man จะเข้าเมื่อเดินจาก (x, y) ไปทิศ dir ครบ 1 tile
 */
export function tileAhead(
  x: number,
  y: number,
  dir: Direction,
): GridCoord {
  const v = DIRECTION_VECTORS[dir];
  return { x: Math.round(x + v.x), y: Math.round(y + v.y) };
}

/**
 * ตรวจว่าการเลี้ยวจากตำแหน่งปัจจุบันไปทิศ dir เป็นไปได้หรือไม่:
 * ต้องอยู่ตรงกลาง tile (จุดตัด) และ tile ปลายทางเดินได้
 * ใช้ guard การเลี้ยวใน engine — ป้องกันตัวละครติดมุม/ทะลุกำแพง
 */
export function canTurn(
  maze: MazeGrid,
  x: number,
  y: number,
  dir: Direction,
): boolean {
  if (!isAtTileCenter(x, y)) return false;
  const ahead = tileAhead(x, y, dir);
  return isWalkable(maze, ahead.x, ahead.y);
}

/**
 * ดึงพิกัด float กลับเข้าศูนย์กลาง tile (จำนวนเต็ม) เฉพาะแกนที่ "เสร็จการเดิน"
 * - ถ้าเดินตามแกน X: snap เฉพาะ y ให้เป็นจำนวนเต็ม (ยังเดิน x ต่อไปได้)
 * - ถ้าเดินตามแกน Y: snap เฉพาะ x
 * ใช้หลังชนกำแพง/ถึงทางตัน เพื่อให้ Pac-Man กลับมาอยู่บน "ราง" พอดี
 * → พอผู้เล่นกดเลี้ยว 90° ที่มุม ระบบจะเห็นตำแหน่ง center จริงและเลี้ยวได้ทันที
 */
export function snapToLane(x: number, y: number, dir: Direction): GridCoord {
  const snapped = { x, y };
  if (dir === "left" || dir === "right") {
    snapped.y = Math.round(y); // แกนเดินคือ X → ให้ y เข้าร่อง
  } else {
    snapped.x = Math.round(x); // แกนเดินคือ Y → ให้ x เข้าร่อง
  }
  return snapped;
}
