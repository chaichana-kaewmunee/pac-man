import Phaser from "phaser";
import { BootScene } from "./BootScene";
import { GameScene } from "./GameScene";
import { setGameRegistry } from "./registryAccess";

/**
 * สร้าง Phaser.Game ตัวเดียวต่อ container — ใช้จาก GameCanvas เท่านั้น
 * (React lifecycle เป็นเจ้าของ instance: mount → สร้าง, unmount → destroy)
 */
export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 608,
    height: 480,
    backgroundColor: "#000000",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: true,
      antialias: false,
    },
    scene: [BootScene, GameScene],
  });

  // ลงทะเบียน registry ให้ React อ่าน event ได้ (scene ยังไม่เกิด — DataManager อยู่บน game)
  setGameRegistry(game.registry);

  return game;
}

/** ตัวช่วย destroy — เรียกจาก React กัน resource leak */
export function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true);
    setGameRegistry(null); // กัน React ฟัง registry ที่ตายแล้ว
  }
}