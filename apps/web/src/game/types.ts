/** ประเภทของช่องในตาราง Maze — แยกข้อมูลออกจากโค้ด rendering */

export type Tile =
  | "wall"
  | "path"
  | "pellet"
  | "powerPellet"
  | "pacmanSpawn"
  | "ghostSpawn";

/** พิกัดแบบ integer บน grid เดียวกันที่ใช้ทั้ง maze, Pac-Man และ Ghosts */
export interface GridCoord {
  x: number;
  y: number;
}

export interface MazeGrid {
  rows: number;
  cols: number;
  /** tiles[y][x] — แถวบนสุดคือ y=0, แถวซ้ายสุดคือ x=0 */
  tiles: Tile[][];
  spawn: {
    pacman: GridCoord;
    ghosts: Ghost[];
  };
  /** จำนวนเม็ดที่เหลือ (ใช้คิดชัยชนะ/คะแนนใน Phase ถัดไป) */
  pelletCount: number;
  powerPelletCount: number;
}

export interface PacMan extends GridCoord {
  /** ทิศที่กำลังหันหน้า / เคลื่อนที่ (null = นิ่ง) */
  dir: Direction | null;
}

export type GhostColor = "red" | "pink" | "cyan" | "orange";

export interface Ghost extends GridCoord {
  color: GhostColor;
  /** ทิศที่กำลังเคลื่อนที่ */
  dir: Direction;
  /** โหมด AI ปัจจุบัน — ใช้ตัดสินใจเป้าหมาย/พฤติกรรมที่ทางแยก */
  mode: GhostMode;
}

export type GhostMode = "scatter" | "chase" | "frightened" | "respawning";

export type GameStatus = "ready" | "playing" | "paused" | "won" | "lost";

/** ภาพรวม state ที่ renderer ใช้ — engine ส่ง snapshot ให้ UI/renderer วาด */
export interface GameSnapshot {
  pacman: PacMan;
  ghosts: Ghost[];
  score: number;
  lives: number;
  status: GameStatus;
  /** เวลา real ที่ผ่านไปตั้งแต่เกมเริ่ม (วินาที, หยุดเมื่อ pause) */
  elapsedSeconds: number;
  /** จำนวนเม็ด (pellet + power) ที่ยังเหลือ — 0 = ชนะ */
  pelletsRemaining: number;
  /** จำนวนเม็ดทั้งหมดตอนเริ่มเกม */
  totalPellets: number;
  /** tiles[y][x] = true ถ้าเม็ดยังอยู่ (false = กินแล้ว) — ใช้ renderer ไม่วาดเม็ดที่กิน */
  eatenPellets: boolean[][];
}

export type Direction = "up" | "down" | "left" | "right";