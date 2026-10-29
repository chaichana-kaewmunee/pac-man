import Phaser from "phaser";

/**
 * ช่องทางเดียวที่ React อ่าน/เขียน registry ของ Phaser
 * - ตั้งค่าเมื่อ createGame สร้าง instance (ครั้งเดียว ต่อ container)
 * - ล้างเมื่อ destroy (กัน leak / ใช้ instance เก่า)
 *
 * ไม่เก็บ game objects — React ได้แค่ primitives (status/score/lives)
 */
let registry: Phaser.Data.DataManager | null = null;

export function setGameRegistry(r: Phaser.Data.DataManager | null): void {
  registry = r;
}

export function getGameRegistry(): Phaser.Data.DataManager | null {
  return registry;
}