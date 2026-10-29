import Phaser from "phaser";
import { SCENE_KEYS } from "./sceneKeys";
import { TEXTURES } from "./textures";

/**
 * สร้าง texture ทั้งหมดแบบ procedural (Graphics API) — ไม่โหลดไฟล์ภายนอก
 * เขียวกำแพง/ผี/เม็ดถูกสร้างเป็น texture ขนาด section ขึ้นต้นที่ (0,0) จากนั้น
 * scene วางด้วย .setOrigin(0,0) ที่ pixel → เรียงเป็น tile map ได้ตรง
 *
 * รันครั้งเดียวตอน boot — texture อยู่ใน TextureManager ใช้ได้ทุก scene
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.BOOT);
  }

  create(): void {
    this.createWallTexture();
    this.createWallEdgeTexture();
    this.createPelletTexture();
    this.createPowerPelletTexture();
    this.createPacmanTexture();
    this.createGhostTextures();

    // พร้อมแล้ว → เข้า GameScene
    this.scene.start(SCENE_KEYS.GAME);
  }

  /** กำแพง: ตัวเติมสีฟ้า-เข้ม + ขอบกรอบสว่าง ให้ชัดว่าเดินไม่ได้ */
  private createWallTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // เติมตัวกำแพง
    g.fillStyle(0x2333ff, 1);
    g.fillRect(0, 0, 16, 16);
    // ขอบด้านนอกสว่าง (เหมือน arcade) — ตัดกับพื้นดำ
    g.lineStyle(2, 0x5f7bff, 1);
    g.strokeRect(1, 1, 14, 14);
    g.generateTexture(TEXTURES.WALL, 16, 16);
    g.destroy();
  }

  /** ขอบกำแพง (สำหรับใช้เป็นของตกแต่ง) — วาดจาก texture หลักได้ ไม่จำเป็นแยก */
  private createWallEdgeTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x2333ff, 1);
    g.fillRect(0, 0, 4, 16);
    g.generateTexture(TEXTURES.WALL_EDGE, 4, 16);
    g.destroy();
  }

  /** เม็ดเล็ก: จุดกลมเล็กๆ กึ่งกลาง tile */
  private createPelletTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffd9a0, 1);
    g.fillCircle(8, 8, 2.5);
    g.generateTexture(TEXTURES.PELLET, 16, 16);
    g.destroy();
  }

  /** power pellet: วงกลมใหญ่ + สั่นวูบไหวโดย tween (ทำใน GameScene) */
  private createPowerPelletTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffd9a0, 1);
    g.fillCircle(8, 8, 6);
    g.generateTexture(TEXTURES.POWER_PELLET, 16, 16);
    g.destroy();
  }

  /** ปาก Pac-Man: สไลซ์วงกลม (โค้ดสั้น ใช้ path arc) */
  private createPacmanTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffe600, 1);
    // วงกลม + ลิ่มปาก (จุดเริ่ม/จบของ arc ควบคุมมุมอ้า)
    g.slice(8, 8, 7, 0.2, Math.PI * 2 - 0.2, false);
    g.fillPath();
    g.generateTexture(TEXTURES.PACMAN, 16, 16);
    g.destroy();
  }

  /** ผีทั้ง 4 สี + โหมด frightened */
  private createGhostTextures(): void {
    const colors: Record<string, number> = {
      [TEXTURES.GHOST_RED]: 0xff3b3b,
      [TEXTURES.GHOST_PINK]: 0xffb8de,
      [TEXTURES.GHOST_CYAN]: 0x4de3ff,
      [TEXTURES.GHOST_ORANGE]: 0xffb852,
      [TEXTURES.GHOST_FRIGHTENED]: 0x2233aa,
    };
    for (const [key, color] of Object.entries(colors)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(color, 1);
      // ตัวผี: ครึ่งวงกลมบน + สี่เหลี่ยมล่าง + ขาหยัก (ฟันเลื่อย)
      g.fillCircle(8, 6, 6);
      g.fillRect(2, 6, 12, 4);
      // ขาหยัก 3 ซี่
      g.fillRect(2, 9, 4, 2);
      g.fillRect(6, 9, 4, 2);
      g.fillRect(10, 9, 4, 2);
      // ตา
      g.fillStyle(0xffffff, 1);
      g.fillCircle(5, 5, 2);
      g.fillCircle(11, 5, 2);
      g.fillStyle(0x0000ff, 1);
      g.fillCircle(5, 5, 1);
      g.fillCircle(11, 5, 1);
      g.generateTexture(key, 16, 16);
      g.destroy();
    }
  }
}