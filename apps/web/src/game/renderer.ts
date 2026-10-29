import type {
  Direction,
  GameSnapshot,
  Ghost,
  GhostColor,
  MazeGrid,
  Tile,
} from "./types";

const COLORS: Record<GhostColor, string> = {
  red: "#ff3b3b",
  pink: "#ffb8de",
  cyan: "#4de3ff",
  orange: "#ffb852",
};

const WALL_COLOR = "#2333ff";
const PELLET_COLOR = "#ffd9a0";
const POWER_PELLET_COLOR = "#ffd9a0";
const PACMAN_COLOR = "#ffe600";

/**
 * Canvas renderer — รับ snapshot จาก engine แล้ววาด 1 เฟรม
 * รู้จักเฉพาะการวาด; ไม่เก็บ state ของเกม
 */
export class BoardRenderer {
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private tile = 16;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /**
   * จัดการขนาด canvas + device pixel ratio:
   * canvas buffer = css size × dpr เพื่อให้ภาพคมชัดบนจอ HiDPI
   * พิกัดในโค้ดยังเป็น css pixel เสมอ (ผ่าน setTransform)
   */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = Math.max(1, dpr);
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.canvas.width = Math.floor(this.cssWidth * this.dpr);
    this.canvas.height = Math.floor(this.cssHeight * this.dpr);
  }

  draw(maze: MazeGrid, snapshot: GameSnapshot): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    this.tile = Math.max(
      4,
      Math.floor(
        Math.min(this.cssWidth / maze.cols, this.cssHeight / maze.rows),
      ),
    );
    const offsetX = Math.floor((this.cssWidth - this.tile * maze.cols) / 2);
    const offsetY = Math.floor((this.cssHeight - this.tile * maze.rows) / 2);

    this.drawTiles(maze, offsetX, offsetY, snapshot.eatenPellets);
    this.drawPacMan(
      snapshot.pacman.x,
      snapshot.pacman.y,
      snapshot.pacman.dir,
      offsetX,
      offsetY,
      snapshot.elapsedSeconds,
    );
    for (const ghost of snapshot.ghosts) {
      this.drawGhost(ghost, offsetX, offsetY);
    }
  }

  /** วาดเฉพาะจุดที่ (x, y) เปลี่ยน — ใช้ได้กับ pixel-scaled tile */
  private tileCenter(
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
  ): { cx: number; cy: number; size: number } {
    return {
      cx: offsetX + x * this.tile + this.tile / 2,
      cy: offsetY + y * this.tile + this.tile / 2,
      size: this.tile,
    };
  }

  private drawTiles(
    maze: MazeGrid,
    offsetX: number,
    offsetY: number,
    eatenPellets: boolean[][],
  ): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        const tile = maze.tiles[y][x];
        if (tile === "wall") {
          ctx.fillStyle = WALL_COLOR;
          ctx.fillRect(
            offsetX + x * this.tile,
            offsetY + y * this.tile,
            this.tile,
            this.tile,
          );
          continue;
        }
        this.drawEdible({
          tile,
          x,
          y,
          offsetX,
          offsetY,
          alive: eatenPellets[y]?.[x] ?? true,
        });
      }
    }
  }

  private drawEdible(args: {
    tile: Tile;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    alive: boolean;
  }): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    if (!args.alive) return; // เม็ดถูกกินแล้ว ไม่วาด
    const { cx, cy, size } = this.tileCenter(
      args.x,
      args.y,
      args.offsetX,
      args.offsetY,
    );

    if (args.tile === "pellet") {
      ctx.fillStyle = PELLET_COLOR;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.13, 0, Math.PI * 2);
      ctx.fill();
    } else if (args.tile === "powerPellet") {
      ctx.fillStyle = POWER_PELLET_COLOR;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // path / spawn ไม่วาดอะไร
  }

  private drawPacMan(
    x: number,
    y: number,
    dir: Direction | null,
    offsetX: number,
    offsetY: number,
    elapsedSeconds: number,
  ): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { cx, cy, size } = this.tileCenter(x, y, offsetX, offsetY);
    const r = size * 0.45;
    // ปากเปิด/ปิด ตามเวลา (เฟส 0.35s) — ค้างให้มองเห็นว่ายังมีชีวิต
    const mouth = 0.35 + Math.abs(Math.sin(elapsedSeconds * Math.PI * 2.2)) * 0.55;

    ctx.save();
    ctx.translate(cx, cy);
    // หมุนให้ปากชี้ตามทิศทาง (ปากเริ่มที่หันขวา = ทิศ right)
    const ROTATION: Record<Direction, number> = {
      right: 0,
      down: Math.PI / 2,
      left: Math.PI,
      up: -Math.PI / 2,
    };
    ctx.rotate(dir ? ROTATION[dir] : 0);

    ctx.fillStyle = PACMAN_COLOR;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawGhost(ghost: Ghost, offsetX: number, offsetY: number): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { cx, cy, size } = this.tileCenter(ghost.x, ghost.y, offsetX, offsetY);
    const r = size * 0.42;

    // ตัว ghost: ครึ่งวงกลมบน + สี่เหลี่ยมล่าง (ส่วนบนเป็นเส้นหยักปล่อยให้ bg)
    ctx.fillStyle = COLORS[ghost.color];
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.25, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r * 0.45);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.25);
    ctx.lineTo(cx, cy + r * 0.45);
    ctx.lineTo(cx - r * 0.5, cy + r * 0.25);
    ctx.lineTo(cx - r, cy + r * 0.45);
    ctx.closePath();
    ctx.fill();

    // ตา
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1a1aff";
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.3, r * 0.12, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy - r * 0.3, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}