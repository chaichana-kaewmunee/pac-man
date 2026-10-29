import Phaser from "phaser";
import { GameEngine } from "../game/engine";
import { MAZE_DEFINITION, parseMaze } from "../game/maze";
import type { MazeGrid } from "../game/types";
import { SCENE_KEYS } from "./sceneKeys";
import { GAME_EVENTS } from "./events";
import { TEXTURES } from "./textures";
import { TILE, mazePixelSize, pixelToTile, tileToPixel } from "./coords";

/** ขนาด tile ใน pixel (internal resolution) — คงที่อ้างอิงทุกการวาด */
// (TILE ถูก import จาก coords — จุดเดียวที่นิยาม)

/**
 * GameScene — ใช้ Phaser เป็น presentation เท่านั้น:
 * - สร้าง maze/player/ghost/pellets จาก snapshot ของ GameEngine
 * - รับ keyboard input → เรียก engine.setPendingDirection (logic อยู่ใน engine)
 * - ส่ง HUD (score/lives/status) ผ่าน GAME_EVENTS.SNAPSHOT ไปให้ React (ไม่แตะ React ทุก frame
 *   โดยตรง — React อ่านจาก event stream เพื่อแสดงผล)
 *
 * ไม่มี logic เกมอยู่ใน scene นี้ — engine.ts ยังเป็นเจ้าของ state ทั้งหมด
 */
export class GameScene extends Phaser.Scene {
  private engine!: GameEngine;
  private maze!: MazeGrid;

  // display lists (ป้องกัน leak → เก็บ ref เพื่อ destroy ตอน shutdown)
  private readonly walls: Phaser.GameObjects.Image[] = [];
  private readonly pellets: Phaser.GameObjects.Image[] = [];
  private readonly powerPellets: Phaser.GameObjects.Image[] = [];
  private pacman!: Phaser.GameObjects.Image;
  private readonly ghosts: Phaser.GameObjects.Image[] = [];
  /** offset มุมซ้ายบนของ maze (คำนวณตอน create; resize ใช้ Scale.FIT) */
  private mazeOrigin = { x: 0, y: 0 };
  /** ค่า STATUS ล่าสุดที่ส่งไปแล้ว (diff-emit — React ไม่ถูกสแปมทุก frame) */
  private lastStatus: { status: string; score: number; lives: number } | null = null;

  constructor() {
    super(SCENE_KEYS.GAME);
  }

  /** ตัวเริ่ม — สร้าง engine ใหม่ทุกครั้งที่ scene start (restart ไม่ค้าง state) */
  init(): void {
    this.engine = new GameEngine(parseMaze(MAZE_DEFINITION));
    this.maze = this.engine.maze;
  }

  create(): void {
    const { width, height } = this.scale.gameSize;
    const { w, h } = mazePixelSize(this.maze.cols, this.maze.rows);

    // จุดเริ่มวาด (ซ้ายบน) — center ภายใน canvas
    this.mazeOrigin = {
      x: Math.floor((width - w) / 2),
      y: Math.floor((height - h) / 2),
    };

    // background ดำทั้งจอ
    this.cameras.main.setBackgroundColor("#000000");

    this.buildWalls();
    this.buildPellets();
    this.buildPacman();
    this.buildGhosts();

    // ฟัง input — เรียก engine.setPendingDirection (engine รับ/ไม่รับตามสถานะเอง)
    this.input.keyboard?.on("keydown", this.handleKey, this);

    // (Game loop = Phaser `update()` — เรียกทุก frame ด้วย delta จริง)

    // ฟังคำสั่ง start/resume/reset จาก React (registry) — engine.start() ถูกเรียกจากเมนู
    this.registry.events.on(GAME_EVENTS.START, this.onStart, this);
    this.registry.events.on(GAME_EVENTS.PAUSE, this.onPause, this);
    this.registry.events.on(GAME_EVENTS.RESUME, this.onResume, this);
    this.registry.events.on(GAME_EVENTS.READY, this.onReset, this);

    // แจ้ง React ว่าคำสั่ง start จะถูกรับได้แล้ว
    this.registry.set("game:scene-ready", true);

    // ยิงสถานะครั้งแรก (ready)
    this.emitStatus();
  }

  /** React กด Play → เริ่มเกมจริง */
  private onStart(): void {
    this.engine.start();
    this.emitStatus();
  }

  /** React กด Pause → หยุด (เฉพาะตอน playing) */
  private onPause(): void {
    if (this.engine.status === "playing") {
      this.engine.pause();
      this.emitStatus();
    }
  }

  /** React กด Resume → เล่นต่อจาก pause */
  private onResume(): void {
    if (this.engine.status === "paused") {
      this.engine.start();
      this.emitStatus();
    }
  }

  /** React กด Restart/Reset → reset engine กลับ ready แล้วเริ่มใหม่ */
  private onReset(): void {
    this.engine.reset();
    this.lastStatus = null;
    for (const pellet of this.pellets) pellet.setAlpha(1);
    for (const pellet of this.powerPellets) {
      this.tweens.killTweensOf(pellet);
      pellet.setAlpha(1);
      if (!this.game.device.os.desktop || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.tweens.add({ targets: pellet, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
      }
    }
    this.renderFromSnapshot();
    this.emitStatus();
  }

  /**
   * Phaser game loop — เรียกทุก frame ด้วย delta จริง (เวลา-based ไม่ใช่ FPS)
   * engine.tick(delta) มี fixed timestep + accumulator ข้างในอยู่แล้ว
   * → ความเร็วคงที่แม้ FPS ผันผวน และ prevent เฟรมตก (clamp 250ms)
   */
  update(_time: number, delta: number): void {
    // เล่นจริงเท่านั้น — paused/ready/won/lost ไม่เดิน simulation
    if (this.engine.status === "playing" && delta > 0) {
      this.engine.tick(delta);
    }

    // วาดจาก snapshot ทุก frame (แม้ pause — ตัว static ยังอยู่)
    this.renderFromSnapshot();
    this.emitStatus();
  }

  private readonly handleKey = (e: KeyboardEvent): void => {
    // กัน input รั่วจากฟอร์ม/UI (เช่น พิมพ์ชื่อใน ScoreSubmit) — เฉพาะ focus อยู่ที่ body
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    const key = e.key.toLowerCase();
    const dirMap: Record<string, "up" | "down" | "left" | "right"> = {
      arrowup: "up",
      arrowdown: "down",
      arrowleft: "left",
      arrowright: "right",
      w: "up",
      s: "down",
      a: "left",
      d: "right",
    };
    const dir = dirMap[key];
    if (dir) {
      // preventDefault เฉพาะ arrow keys (กันหน้าเว็บเลื่อน) — WASD ปล่อยผ่าน
      if (key.startsWith("arrow")) e.preventDefault?.();
      this.engine.setPendingDirection(dir);
    }
    if (key === "p" || key === "escape" || key === " ") {
      e.preventDefault?.();
      this.togglePause();
    }
  };

  /** Pause/Resume — ผ่าน engine (state อยู่ที่นั่น) + ส่ง event ไป React */
  private togglePause(): void {
    if (this.engine.status === "playing") {
      this.engine.pause();
      this.emitStatus();
    } else if (this.engine.status === "paused") {
      this.engine.start(); // resume
      this.emitStatus();
    }
  }

  /** วางกำแพงทุก tile (origin 0,0 → มุมซ้ายบนของ tile) */
  private buildWalls(): void {
    const rows = this.maze.rows;
    const cols = this.maze.cols;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (this.maze.tiles[y][x] === "wall") {
          const img = this.add.image(
            this.mazeOrigin.x + x * TILE,
            this.mazeOrigin.y + y * TILE,
            TEXTURES.WALL,
          );
          img.setOrigin(0, 0);
          this.walls.push(img);
        }
      }
    }
  }

  /** วางเม็ดเล็ก + power pellet (เฉพาะที่ยังอยู่ตอนเริ่ม) */
  private buildPellets(): void {
    const rows = this.maze.rows;
    const cols = this.maze.cols;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = this.maze.tiles[y][x];
        if (t === "pellet") {
          const pos = tileToPixel(x, y, this.mazeOrigin.x, this.mazeOrigin.y);
          const p = this.add.image(pos.x, pos.y, TEXTURES.PELLET);
          p.setOrigin(0.5, 0.5);
          this.pellets.push(p);
        } else if (t === "powerPellet") {
          const pos = tileToPixel(x, y, this.mazeOrigin.x, this.mazeOrigin.y);
          const p = this.add.image(pos.x, pos.y, TEXTURES.POWER_PELLET);
          p.setOrigin(0.5, 0.5);
          // วูบไหว (blink) ให้เห็นชัดว่าเป็นของพลัง — ปิดถ้า user ลด motion
          if (!this.game.device.os.desktop || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            this.tweens.add({
              targets: p,
              alpha: 0.35,
              duration: 500,
              yoyo: true,
              repeat: -1,
            });
          }
          this.powerPellets.push(p);
        }
      }
    }
  }

  private ghostTexture(color: string): string {
    switch (color) {
      case "red": return TEXTURES.GHOST_RED;
      case "pink": return TEXTURES.GHOST_PINK;
      case "cyan": return TEXTURES.GHOST_CYAN;
      default: return TEXTURES.GHOST_ORANGE;
    }
  }

  /** Pac-Man เริ่มที่ spawn */
  private buildPacman(): void {
    const s = this.maze.spawn.pacman;
    const pos = tileToPixel(s.x, s.y, this.mazeOrigin.x, this.mazeOrigin.y);
    this.pacman = this.add.image(pos.x, pos.y, TEXTURES.PACMAN);
    this.pacman.setOrigin(0.5, 0.5);
  }

  /** ผี 4 ตัว เริ่มที่ spawn */
  private buildGhosts(): void {
    for (const g of this.maze.spawn.ghosts) {
      const tex = this.ghostTexture(g.color);
      const pos = tileToPixel(g.x, g.y, this.mazeOrigin.x, this.mazeOrigin.y);
      const img = this.add.image(pos.x, pos.y, tex);
      img.setOrigin(0.5, 0.5);
      this.ghosts.push(img);
    }
  }

  /** วาดจาก snapshot — เก็บเฉพาะ pixel ที่เปลี่ยน (แต่ snapshot ใหม่ง่ายสุด ค่อย optimize) */
  private renderFromSnapshot(): void {
    const snap = this.engine.getSnapshot();
    const { x: ox, y: oy } = this.mazeOrigin;

    // Pac-Man ตำแหน่ง + หมุนตามทิศ
    const pacPos = tileToPixel(snap.pacman.x, snap.pacman.y, ox, oy);
    this.pacman.setPosition(pacPos.x, pacPos.y);
    const facing: Record<string, number> = {
      right: 0,
      down: Math.PI / 2,
      left: Math.PI,
      up: -Math.PI / 2,
    };
    this.pacman.setRotation(facing[snap.pacman.dir ?? "right"] ?? 0);

    // ผี ตำแหน่ง + texture ตามโหมด (frightened ถ้าอยู่ในโหมดนั้น ยังไม่มีใน engine → ใช้ scatter/chase)
    snap.ghosts.forEach((g, i) => {
      const img = this.ghosts[i];
      if (!img) return;
      const gPos = tileToPixel(g.x, g.y, ox, oy);
      img.setPosition(gPos.x, gPos.y);
      const texture = g.mode === "frightened" ? TEXTURES.GHOST_FRIGHTENED : this.ghostTexture(g.color);
      img.setTexture(texture);
    });

    // pellet: ซ่อนตัวที่กินแล้ว (จาก eatenPellets false → เอาออกจากจอ)
    const eaten = snap.eatenPellets;
    for (const p of this.pellets) {
      // เปิด/ซ่อนใหม่ทุก frame เพื่อให้ reset คืนเม็ดที่กินไปแล้วได้
      const { col, row } = pixelToTile(p.x, p.y, ox, oy);
      const remaining = row >= 0 && row < eaten.length && col >= 0 && col < eaten[0].length && eaten[row][col];
      p.setActive(remaining).setVisible(remaining);
    }
    // power pellet แบบเดียว (ซ่อนตัวที่กิน)
    for (const p of this.powerPellets) {
      const { col, row } = pixelToTile(p.x, p.y, ox, oy);
      const remaining = row >= 0 && row < eaten.length && col >= 0 && col < eaten[0].length && eaten[row][col];
      p.setActive(remaining).setVisible(remaining);
    }
  }

  /** ส่งสถานะเกมไป React ผ่าน registry events (payload primitive เท่านั้น)
   *  diff-emit: ส่งครั้งแรกเสมอ + เฉพาะเมื่อ status/score/lives เปลี่ยน
   *  → React ไม่ถูก setState สแปมทุก frame (แม้ค่าเดิม) */
  private emitStatus(): void {
    const snap = this.engine.getSnapshot();
    const cur = { status: snap.status, score: snap.score, lives: snap.lives };
    const prev = this.lastStatus;
    this.lastStatus = cur;
    if (prev?.status !== cur.status || prev?.score !== cur.score || prev?.lives !== cur.lives) {
      this.registry.events.emit(GAME_EVENTS.STATUS, cur.status, cur.score, cur.lives);
      // snapshot เต็มส่งเฉพาะเมื่อเปลี่ยน — แยกจาก status (debug/legacy)
      this.registry.events.emit(GAME_EVENTS.SNAPSHOT, snap);
    }
    // feedback แยก: pellet eaten (score เพิ่ม) / player died (lives ลด) — ครั้งละ 1 event
    if (prev?.score != null && cur.score > prev.score) {
      this.registry.events.emit(GAME_EVENTS.PELLET_EATEN, cur.score);
    }
    if (prev?.lives != null && cur.lives < prev.lives) {
      this.registry.events.emit(GAME_EVENTS.PLAYER_DIED);
    }
  }

  /** เมื่อ scene หยุด (กลับเมนู/ย้าย) — ล้าง listener & objects กัน leak */
  shutdown(): void {
    this.input.keyboard?.off("keydown", this.handleKey, this);
    this.registry.events.off(GAME_EVENTS.START, this.onStart, this);
    this.registry.events.off(GAME_EVENTS.PAUSE, this.onPause, this);
    this.registry.events.off(GAME_EVENTS.RESUME, this.onResume, this);
    this.registry.events.off(GAME_EVENTS.READY, this.onReset, this);
    this.tweens.killAll();
    this.walls.length = 0;
    this.pellets.length = 0;
    this.powerPellets.length = 0;
    this.ghosts.length = 0;
  }
}