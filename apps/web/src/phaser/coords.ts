/**
 * การแปลง grid (tile) ↔ world (pixel) — จุดเดียวที่นิยามค่า TILE
 * ใช้ใน GameScene ทุกที่ (กำแพง/เม็ด/Pac-Man/ผี) เพื่อกันค่า hardcode
 * หลงเหลือคนละที่ แล้วเกิด mismatch กัน
 *
 * หมายเหตุ: ภาพทุกชิ้นตั้ง origin (0.5, 0.5) → ตำแหน่งของ image = ศูนย์กลาง tile
 * (ox, oy) คือพิกัดมุมซ้ายบนของ maze ใน world
 */
export const TILE = 16;
/** ศูนย์กลางของ tile (px, py) */
export function tileToPixel(
  col: number,
  row: number,
  ox: number,
  oy: number,
): { x: number; y: number } {
  return { x: ox + col * TILE + TILE / 2, y: oy + row * TILE + TILE / 2 };
}

/** แปลง pixel → tile ใกล้สุดปัด (ใช้หา tile ที่ object อยู่ / กินเม็ด) */
export function pixelToTile(
  px: number,
  py: number,
  ox: number,
  oy: number,
): { col: number; row: number } {
  return {
    col: Math.round((px - ox - TILE / 2) / TILE),
    row: Math.round((py - oy - TILE / 2) / TILE),
  };
}

/** ความกว้าง/สูง (px) ของ maze ทั้งก้อน */
export function mazePixelSize(cols: number, rows: number): { w: number; h: number } {
  return { w: cols * TILE, h: rows * TILE };
}