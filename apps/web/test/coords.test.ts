import { describe, expect, it } from "bun:test";
import { TILE, mazePixelSize, pixelToTile, tileToPixel } from "../src/phaser/coords";

describe("grid ↔ world conversion (Phaser)", () => {
  it("tileToPixel อยู่ที่ศูนย์กลาง tile (origin 0.5)", () => {
    const p = tileToPixel(3, 5, 0, 0);
    expect(p.x).toBe(3 * TILE + TILE / 2);
    expect(p.y).toBe(5 * TILE + TILE / 2);
  });

  it("pixelToTile คืน tile เดิมหลังแปลงกลับ (รวม offset maze)", () => {
    const ox = 40;
    const oy = 24;
    const p = tileToPixel(7, 2, ox, oy);
    const t = pixelToTile(p.x, p.y, ox, oy);
    expect(t).toEqual({ col: 7, row: 2 });
  });

  it("pixelToTile ปัดหาศูนย์กลางใกล้สุด แม้ตำแหน่งจะเบี่ยงเล็กน้อย", () => {
    const t = pixelToTile(3 * TILE + TILE / 2 + 0.4, 5 * TILE + TILE / 2 - 0.3, 0, 0);
    expect(t).toEqual({ col: 3, row: 5 });
  });

  it("mazePixelSize คูณ tile ตามจำนวนช่อง", () => {
    expect(mazePixelSize(19, 15)).toEqual({ w: 19 * TILE, h: 15 * TILE });
  });
});