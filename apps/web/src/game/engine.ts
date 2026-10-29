import {
  type Direction,
  type GameSnapshot,
  type GameStatus,
  type Ghost,
  type GhostColor,
  type GridCoord,
  type MazeGrid,
  type PacMan,
} from "./types";
import { GHOST_COLORS } from "./maze";
import {
  OPPOSITE_DIR,
  decideDirection,
  decideFleeDirection,
  getTarget,
} from "./ghostAI";
import {
  DIRECTION_VECTORS,
  PACMAN_SPEED,
  canTurn,
  isAtTileCenter,
  isWalkable,
  snapToLane,
} from "./movement";

export const INITIAL_LIVES = 3;

/** Fixed timestep: จำนวน step ต่อวินาที — ผลคงที่ ไม่ผูกกับ FPS ของเครื่อง */
export const STEPS_PER_SECOND = 60;

const STEP_DT = 1 / STEPS_PER_SECOND;

/** ระยะที่ Pac-Man เดินต่อ 1 step (tile) */
const DIST_PER_STEP = PACMAN_SPEED / STEPS_PER_SECOND;

/** คะแนนต่อเม็ดเล็ก และเม็ดใหญ่ (power pellet) */
export const PELLET_SCORE = 10;
export const POWER_PELLET_SCORE = 50;

/** ระยะกันชน (วินาที) หลัง Pac-Man ตายใหม่ — ghost ชนซ้ำทันทีไม่ได้ */
export const RESPAWN_INVULN_SECONDS = 2;

/** Power pellet makes ghosts edible and evasive for this duration. */
export const FRIGHTENED_SECONDS = 8;
export const GHOST_EAT_SCORE = 200;

/** ความเร็ว Ghost เป็นสัดส่วนของ Pac-Man (ช้ากว่าเล็กน้อย) */
export const GHOST_SPEED_RATIO = 0.85;

/** โหมดสลับ scatter/chase ตามเวลาเกม (วินาที): เริ่ม scatter 7s, chase 20s */
export const SCATTER_SECONDS = 7;
export const CHASE_SECONDS = 20;

/** มุม scatter ของ ghost แต่ละสี (ในกรณีที่ maze ไม่มี ghost house) */
const SCATTER_CORNERS: Record<GhostColor, GridCoord> = {
  red: { x: 0, y: 0 },
  pink: { x: 0, y: 24 },
  cyan: { x: 27, y: 0 },
  orange: { x: 27, y: 24 },
};

function isOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

/**
 * Game Engine — เก็บ state ของเกม และ operation ที่เปลี่ยน state
 * (start/pause/reset/tick) แยกจาก UI และ Canvas โดยสิ้นเชิง (ทดสอบได้ไม่ต้องเปิด browser)
 *
 * การเคลื่อนที่แบบ tile-based + fixed timestep:
 * - พิกัด Pac-Man เป็น float ในหน่วย tile (ศูนย์กลาง tile คือจำนวนเต็ม)
 * - ตรวจกำแพงก่อนขยับทุกครั้ง (grid collision) → ไม่ทะลุกำแพง/ออกนอก maze
 * - เลี้ยว (90°) ได้เฉพาะเมื่ออยู่ตรงศูนย์กลาง tile (จุดตัด) และ tile ปลายทางเดินได้ → ไม่ติดมุม
 * - กลับหลัง (180°) ได้ทันทีแม้กลาง tile
 * - input เป็น single-slot buffer (pendingDirection) → key repeat ไม่ทำให้ตำแหน่งพัง
 *
 * สถานะเกม: ready → playing → (paused ⇄) → won | lost — หลังจบจะเปลี่ยน state ไม่ได้อีก
 */
export class GameEngine {
  readonly maze: MazeGrid;

  /** tiles[y][x] — เม็ดที่ยังไม่ถูกกิน (true = ยังอยู่) ห้ามเก็บซ้ำ */
  private _pellets: boolean[][];
  private _totalPellets: number;

  private _pacman: PacMan;
  private _ghosts: Ghost[];
  private _score = 0;
  private _lives = INITIAL_LIVES;
  private _status: GameStatus = "ready";
  private _pendingDirection: Direction | null = null;
  private _elapsedSeconds = 0;
  private _accumulator = 0;

  /** เวลา (ขั้น step) นับถอยหลังหลัง Pac-Man โดน ghost — ระหว่างนี้ invulnerable */
  private _respawnTimer = 0;
  private _frightenedTimer = 0;

  /** เก็บโอเดิมของ ghost ก่อน respawn (เพื่อกลับ spawn เดิม) */
  private _ghostSpawnPos: Map<GhostColor, GridCoord> = new Map();

  constructor(maze: MazeGrid) {
    this.maze = maze;
    this._pellets = this.initPellets();
    this._totalPellets = this.countPellets();
    this._pacman = this.makePacman();
    this._ghosts = this.makeGhosts();
  }

  /** เก็บเฉพาะเม็ดที่ยังอยู่ (pellet/powerPellet) เป็น boolean grid — แก้ได้โดยไม่แตะ maze */
  private initPellets(): boolean[][] {
    return this.maze.tiles.map((row) =>
      row.map(
        (tile) => tile === "pellet" || tile === "powerPellet",
      ),
    );
  }

  private countPellets(): number {
    let count = 0;
    for (const row of this._pellets) {
      for (const hasPellet of row) {
        if (hasPellet) count++;
      }
    }
    return count;
  }

  private makePacman(): PacMan {
    return { ...this.maze.spawn.pacman, dir: null };
  }

  private makeGhosts(): Ghost[] {
    const spawnPos = new Map<GhostColor, GridCoord>();
    const gs = this.maze.spawn.ghosts.map((g, i) => {
      const color = GHOST_COLORS[i];
      spawnPos.set(color, { x: g.x, y: g.y });
      return {
        ...g,
        color,
        dir: "left" as const,
        mode: "scatter" as const,
      };
    });
    this._ghostSpawnPos = spawnPos;
    return gs;
  }

  get status(): GameStatus {
    return this._status;
  }

  get score(): number {
    return this._score;
  }

  get lives(): number {
    return this._lives;
  }

  get elapsedSeconds(): number {
    return this._elapsedSeconds;
  }

  get pendingDirection(): Direction | null {
    return this._pendingDirection;
  }

  get pacman(): PacMan {
    return this._pacman;
  }

  get ghosts(): Ghost[] {
    return this._ghosts;
  }

  get totalPellets(): number {
    return this._totalPellets;
  }

  /** ช่วง invulnerable หลัง respawn เหลืออีกกี่วินาที (0 = ปกติ) — ใช้แสดง/ทดสอบ */
  get respawnInvulnRemaining(): number {
    return Math.max(0, this._respawnTimer);
  }

  /** reset เกมทั้งหมด — ใช้ได้ทุกสถานะ (ready/playing/paused/won/lost) */
  reset(): void {
    this._pellets = this.initPellets();
    this._totalPellets = this.countPellets();
    this._pacman = this.makePacman();
    this._ghosts = this.makeGhosts();
    this._score = 0;
    this._lives = INITIAL_LIVES;
    this._status = "ready";
    this._pendingDirection = null;
    this._elapsedSeconds = 0;
    this._accumulator = 0;
    this._respawnTimer = 0;
    this._frightenedTimer = 0;
  }

  /** เริ่ม/เล่นต่อ (จาก ready หรือ paused) */
  start(): void {
    if (this._status === "ready" || this._status === "paused") {
      this._status = "playing";
    }
  }

  pause(): void {
    if (this._status === "playing") {
      this._status = "paused";
      this._accumulator = 0; // หยุด simulation จริง — เวลาที่ pause ไม่ถูกนับ
    }
  }

  /**
   * Input: บันทึกทิศทางที่ผู้เล่นกด (single-slot buffer)
   * รับเฉพาะสถานะ playing — ready ยังไม่เริ่ม, paused/จบแล้วไม่รับ input
   */
  setPendingDirection(dir: Direction): void {
    if (this._status !== "playing") return;

    this._pendingDirection = dir;
    if (this.canStartMoving(dir)) {
      this._pacman.dir = dir;
      this._pendingDirection = null; // ใช้แล้ว
    }
  }

  /**
   * เลี้ยวได้ทันทีไหม:
   * - ยังไม่เดิน (dir=null): ต้องตรวจ tile หน้าว่าเดินได้ก่อน — ป้องกันเริ่มเดินทะลุกำแพง
   * - กลับหลัง (180°): ได้ทันทีแม้กลาง tile
   * - เลี้ยว (90°): ต้องอยู่จุดตัด (center tile) แล้ว tile ใหม่เดินได้
   */
  private canStartMoving(dir: Direction): boolean {
    const p = this._pacman;
    if (p.dir === null) {
      const ahead = DIRECTION_VECTORS[dir];
      return isWalkable(
        this.maze,
        Math.round(p.x + ahead.x),
        Math.round(p.y + ahead.y),
      );
    }
    if (isOpposite(p.dir, dir)) return true;
    return canTurn(this.maze, p.x, p.y, dir);
  }

  /**
   * Fixed timestep — เรียกจาก RAF ทุก frame ด้วย dt จริง (ms)
   * สะสมเวลาแล้วเดินทีละ STEP_DT คงที่ → ผลเท่ากันทุกเครื่อง
   * เฉพาะสถานะ playing เท่านั้นที่เดิน simulation; paused/ready/won/lost หยุดสนิท
   */
  tick(dtMs: number): void {
    if (this._status !== "playing") return;

    const dtSeconds = Math.min(dtMs, 250) / 1000; // ตัด spike ที่ใหญ่เกิน
    this._accumulator += dtSeconds;
    while (this._accumulator >= STEP_DT) {
      this.step();
      this._accumulator -= STEP_DT;
    }
  }

  /** หนึ่ง step ของ simulation (1/60 วินาทีของเกม) */
  private step(): void {
    if (this._status !== "playing") return;
    this._elapsedSeconds += STEP_DT;

    // นับถอยหลังสถานะชั่วคราวก่อนอัปเดตโหมด Ghost
    if (this._respawnTimer > 0) {
      this._respawnTimer = Math.max(0, this._respawnTimer - STEP_DT);
    }
    if (this._frightenedTimer > 0) {
      this._frightenedTimer = Math.max(0, this._frightenedTimer - STEP_DT);
    }
    this.updateGhostModes();

    this.movePacman();
    this.moveGhosts();

    // เก็บเม็ดที่อยู่ใต้ Pac-Man (กินทีละครั้ง เก็บซ้ำไม่ได้)
    this.eatPellet();

    // ชน ghost → เสียชีวิต (ถ้า invulnerable จะไม่โดนซ้ำ)
    this.checkGhostCollision();

    // ชนะเมื่อกินเม็ดครบ
    if (this.countPellets() === 0) {
      this._status = "won";
    }
  }

  /** สลับโหมด ghost ตามรอบเวลา: scatter 7s → chase 20s → ทำซ้ำ */
  private updateGhostModes(): void {
    const t = this._elapsedSeconds;
    const cycle = SCATTER_SECONDS + CHASE_SECONDS;
    const phase = t % cycle;
    const mode = phase < SCATTER_SECONDS ? "scatter" : "chase";
    for (const g of this._ghosts) {
      if (g.mode !== "respawning") {
        g.mode = this._frightenedTimer > 0 ? "frightened" : mode;
      }
    }
  }

  /**
   * เคลื่อน ghost ตาม AI — deterministic:
   * - ตัดสินใจทิศที่ "จุดตัด" (center tile) เท่านั้น — ไม่ส่ายกลางทาง
   * - เดินตรงระหว่างจุดตัดด้วยความเร็วคงที่
   * - respawning: มุ่งกลับไป spawn แล้วกลับเป็นโหมดปกติเมื่อถึง
   */
  private moveGhosts(): void {
    for (const ghost of this._ghosts) this.moveGhost(ghost);
  }

  private moveGhost(ghost: Ghost): void {
    const speed = PACMAN_SPEED * GHOST_SPEED_RATIO *
      (ghost.mode === "frightened" ? 0.65 : 1) * STEP_DT;
    const home = this._ghostSpawnPos.get(ghost.color) ?? { x: ghost.x, y: ghost.y };

    if (ghost.mode === "respawning") {
      ghost.dir = decideDirection(
        this.maze,
        Math.round(ghost.x),
        Math.round(ghost.y),
        ghost.dir,
        home,
      );
      this.advanceGhost(ghost, speed);
      if (Math.round(ghost.x) === home.x && Math.round(ghost.y) === home.y) {
        ghost.mode = "scatter";
      }
      return;
    }

    const previousX = ghost.x;
    const previousY = ghost.y;
    this.advanceGhost(ghost, speed);
    if (ghost.x === previousX && ghost.y === previousY) {
      ghost.dir = OPPOSITE_DIR[ghost.dir];
      return;
    }
    if (!isAtTileCenter(ghost.x, ghost.y)) return;

    const next = ghost.mode === "frightened"
      ? decideFleeDirection(
        this.maze,
        Math.round(ghost.x),
        Math.round(ghost.y),
        ghost.dir,
        this._pacman,
      )
      : decideDirection(
        this.maze,
        Math.round(ghost.x),
        Math.round(ghost.y),
        ghost.dir,
        this.ghostTarget(ghost),
      );
    if (next !== OPPOSITE_DIR[ghost.dir]) ghost.dir = next;
  }

  /**
   * เลื่อน ghost ไปข้างหน้า ตรวจกำแพง — ไม่ขยับถ้า tile หน้าติดกำแพง
   * สำคัญ: เมื่อเดิน "ใกล้" integer center (ห่าง < tolerance) ให้ snap ไปที่จำนวนเต็ม
   * พอดี → isAtTileCenter เป็นจริง → เลือกทิศที่ junction ได้ทันที (ไม่ส่ายกลางทาง)
   * แต่ snap เข้า tile ที่เป็นกำแพงไม่ได้ (กันผีติดกำแพงค้าง) — ถ้า snap -> กำแพง
   * ให้ค้างไว้ที่ตำแหน่ง float ใกล้ center ซึ่ง isAtTileCenter(tolerance=1e-3) ยังมองเป็น
   * center → ตัดสินใจทิศใหม่ได้ (หันกลับ) ในรอบถัดไป
   */
  private advanceGhost(g: Ghost, dist: number): void {
    const next = this.nextGhostPosition(g, dist);
    if (isWalkable(this.maze, Math.round(next.x), Math.round(next.y))) {
      g.x = next.x;
      g.y = next.y;
    }
    // Blocked next tile leaves the ghost in place, ready to choose another direction.
  }

  private nextGhostPosition(g: Ghost, dist: number): GridCoord {
    const vector = DIRECTION_VECTORS[g.dir];
    const previousX = g.x;
    const previousY = g.y;
    let x = previousX + vector.x * dist;
    let y = previousY + vector.y * dist;

    if (vector.x !== 0) {
      x = this.snapAcrossTileCenter(previousX, x, vector.x) ?? x;
      y = Math.round(previousY);
    } else {
      y = this.snapAcrossTileCenter(previousY, y, vector.y) ?? y;
      x = Math.round(previousX);
    }

    return { x, y };
  }

  private snapAcrossTileCenter(previous: number, next: number, direction: number): number | null {
    const center = direction > 0 ? Math.ceil(previous) : Math.floor(previous);
    const crossed = direction > 0 ? center <= next : center >= next;
    return crossed && center !== previous ? center : null;
  }

  /** เป้าหมาย ghost ตามโหมด (scatter=มุมประจำตัว, chase=ไล่ Pac-Man, respawning=spawn) */
  private ghostTarget(g: Ghost): GridCoord {
    if (g.mode === "respawning") {
      return this._ghostSpawnPos.get(g.color) ?? { x: g.x, y: g.y };
    }
    const corner = SCATTER_CORNERS[g.color] ?? { x: 0, y: 0 };
    return getTarget(g.mode as "scatter" | "chase", this._pacman, corner);
  }

  private movePacman(): void {
    const p = this._pacman;
    if (!p.dir) return;

    // 1) ประมวลผลทิศที่ค้างไว้ (ถ้ายังไม่ได้ใช้) — เลี้ยวได้เมื่ออยู่ center tile
    if (this._pendingDirection && this._pendingDirection !== p.dir) {
      if (
        isOpposite(p.dir, this._pendingDirection) ||
        canTurn(this.maze, p.x, p.y, this._pendingDirection)
      ) {
        p.dir = this._pendingDirection;
        this._pendingDirection = null;
      }
      // ถ้ายังเลี้ยวไม่ได้ → ค้างไว้ รอจุดตัดถัดไป
    }

    // 2) เดินหน้า — ตรวจกำแพงก่อนขยับ
    const v = DIRECTION_VECTORS[p.dir];
    const nextX = p.x + v.x * DIST_PER_STEP;
    const nextY = p.y + v.y * DIST_PER_STEP;

    if (isWalkable(this.maze, Math.round(nextX), Math.round(nextY))) {
      // เดินปกติ — snap ตำแหน่งให้อยู่บน "ราง" เสมอ (กัน drift ออกจาก center)
      const snapped = snapToLane(nextX, nextY, p.dir);
      p.x = snapped.x;
      p.y = snapped.y;
    } else {
      // ชนกำแพง: snap เข้า center ของ tile ปัจจุบัน (ทั้ง 2 แกน)
      // → ตำแหน่งค้างที่จุดตัดพอดี ไม่ติดที่ 12.9 → กดเลี้ยวได้ทันที
      p.x = Math.round(p.x);
      p.y = Math.round(p.y);
      // snap ให้เป็น integer แท้ๆ (กัน floating drift อย่าง 8.000000000000002
      // ที่ทำให้ canTurn มองไม่เห็น center)
      if (Math.abs(p.x - Math.round(p.x)) < 1e-9) p.x = Math.round(p.x);
      if (Math.abs(p.y - Math.round(p.y)) < 1e-9) p.y = Math.round(p.y);
    }
    // ชนกำแพง: ไม่ขยับ (snap แล้ว) รอทิศทางใหม่
  }

  /** กินเม็ดใต้ตำแหน่ง Pac-Man ถ้ายังมี — เก็บซ้ำไม่ได้ และเพิ่มคะแนน */
  private eatPellet(): void {
    const p = this._pacman;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x < 0 || y < 0 || x >= this.maze.cols || y >= this.maze.rows) return;
    if (!this._pellets[y][x]) return; // กินแล้ว หรือไม่มีเม็ด

    this._pellets[y][x] = false;
    const tile = this.maze.tiles[y][x];
    this._score += tile === "powerPellet" ? POWER_PELLET_SCORE : PELLET_SCORE;
    if (tile === "powerPellet") {
      this._frightenedTimer = FRIGHTENED_SECONDS;
      for (const ghost of this._ghosts) {
        if (ghost.mode !== "respawning") {
          ghost.mode = "frightened";
          // Reverse immediately so a ghost already heading toward Pac-Man flees too.
          ghost.dir = OPPOSITE_DIR[ghost.dir];
        }
      }
    }
  }

  /** ชน ghost (ห่างเป็นพิกัด grid) → เสียชีวิต 1 ครั้ง ห้ามลดซ้ำใน respawn invuln */
  private checkGhostCollision(): void {
    if (this._respawnTimer > 0) return; // ระหว่าง respawn — ไม่โดนซ้ำ
    const p = this._pacman;
    const nearbyGhosts = this._ghosts.filter((ghost) =>
      ghost.mode !== "respawning" &&
      // Collision is checked per fixed step; account for relative motion within both sprites.
      Math.hypot(ghost.x - p.x, ghost.y - p.y) <= DIST_PER_STEP + PACMAN_SPEED * GHOST_SPEED_RATIO / STEPS_PER_SECOND
    );

    // Resolve edible ghosts first; an eaten ghost must not also cause damage.
    for (const ghost of nearbyGhosts) {
      if (ghost.mode !== "frightened") continue;
      this._score += GHOST_EAT_SCORE;
      ghost.mode = "respawning";
    }
    if (nearbyGhosts.some((ghost) => ghost.mode !== "frightened" && ghost.mode !== "respawning")) {
      this.onPacmanCaught();
    }
  }

  /** โดน ghost จับ: ลดชีวิต 1, ถ้าเหลือ 0 → lost, ไม่ก็ respawn + invulnerable */
  private onPacmanCaught(): void {
    this._lives -= 1;

    if (this._lives <= 0) {
      this._status = "lost";
      this._pendingDirection = null;
      return;
    }

    // respawn กลับจุดเริ่มต้น + invulnerable ชั่วคราว (กันชนซ้ำทันที)
    // ghost กลับไปที่ spawn ของตัวเอง (mode respawning → อาศัย path กลับบ้าน)
    this._pacman = this.makePacman();
    this._pendingDirection = null;
    this._respawnTimer = RESPAWN_INVULN_SECONDS;
    this._frightenedTimer = 0;

    for (const g of this._ghosts) {
      const home = this._ghostSpawnPos.get(g.color);
      if (home) {
        g.x = home.x;
        g.y = home.y;
        g.dir = "left";
        g.mode = "respawning";
      }
    }
  }

  getSnapshot(): GameSnapshot {
    // คืน copy เสมอ — caller เก็บค่าไว้ได้โดยไม่โดน mutate ตาม engine
    return {
      pacman: { ...this._pacman },
      ghosts: this._ghosts.map((g) => ({
        ...g,
      })),
      score: this._score,
      lives: this._lives,
      status: this._status,
      elapsedSeconds: this._elapsedSeconds,
      pelletsRemaining: this.countPellets(),
      totalPellets: this._totalPellets,
      eatenPellets: this._pellets.map((row) => [...row]),
    };
  }
}
