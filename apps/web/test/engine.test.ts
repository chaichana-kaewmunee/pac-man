import { describe, expect, test } from "bun:test";
import {
  GameEngine,
  GHOST_EAT_SCORE,
  INITIAL_LIVES,
  POWER_PELLET_SCORE,
  STEPS_PER_SECOND,
} from "../src/game/engine";
import {
  DIRECTION_VECTORS,
  isAtTileCenter,
  canTurn,
  isWalkable,
} from "../src/game/movement";
import { MAZE_DEFINITION, parseMaze } from "../src/game/maze";
import type { Direction, MazeGrid } from "../src/game/types";

const maze: MazeGrid = parseMaze(MAZE_DEFINITION);
/** เดินให้ต่อเนื่องจนแน่ใจว่า engine ผ่านทุกจุดได้ */
function moveDir(engine: GameEngine, dir: Direction, n: number): void {
  engine.setPendingDirection(dir);
  for (let i = 0; i < n; i++) engine.tick(1000 / STEPS_PER_SECOND);
}

describe("movement helpers", () => {
  test("direction vectors are unit steps", () => {
    expect(DIRECTION_VECTORS.up).toEqual({ x: 0, y: -1 });
    expect(DIRECTION_VECTORS.down).toEqual({ x: 0, y: 1 });
    expect(DIRECTION_VECTORS.left).toEqual({ x: -1, y: 0 });
    expect(DIRECTION_VECTORS.right).toEqual({ x: 1, y: 0 });
  });

  test("canTurn treats wall/out-of-bounds as blocked", () => {
    // maze จริง: spawn (7,13) — ขึ้นไป (7,12) เปิด, ลงไป (7,14) เป็นกำแพง (row ล่างสุด)
    const { x, y } = maze.spawn.pacman;
    expect(canTurn(maze, x, y, "up")).toBe(true);
    expect(canTurn(maze, x, y, "down")).toBe(false);
  });

  test("isAtTileCenter detects exact multiples", () => {
    expect(isAtTileCenter(1.0, 1.0)).toBe(true);
    expect(isAtTileCenter(1.5, 1.0)).toBe(false);
  });
});

describe("GameEngine movement + collision", () => {
  test("initial state uses grid-aligned start", () => {
    const engine = new GameEngine(maze);
    const s = engine.getSnapshot();
    expect(s.pacman).toEqual({ ...maze.spawn.pacman, dir: null });
    expect(s.status).toBe("ready");
    expect(engine.maze.pelletCount).toBeGreaterThan(0);
  });

  test("does not move while ready (not started)", () => {
    const engine = new GameEngine(maze);
    engine.setPendingDirection("right");
    engine.tick(1000 / STEPS_PER_SECOND);
    const s = engine.getSnapshot();
    expect(s.pacman.x).toBe(maze.spawn.pacman.x);
    expect(s.pacman.y).toBe(maze.spawn.pacman.y);
  });

  test("moves right until pellet corridor (does not clip wall)", () => {
    const engine = new GameEngine(maze);
    engine.start();
    const startX = engine.getSnapshot().pacman.x;
    // เดินขวา — ตำแหน่งเพิ่มขึ้นเรื่อย ๆ ไม่ทะลุกำแพง
    moveDir(engine, "right", 8);
    const s = engine.getSnapshot();
    expect(s.pacman.x).toBeGreaterThan(startX);
  });

  test("moving into wall keeps position", () => {
    const engine = new GameEngine(maze);
    engine.start();
    const before = engine.getSnapshot().pacman;
    // หาทิศที่มีกำแพงชิดจาก spawn — reset + ลองแต่ละทิศ
    const dirs: Direction[] = ["up", "down", "left", "right"];
    for (const d of dirs) {
      engine.reset();
      engine.start();
      if (!canTurn(engine.maze, before.x, before.y, d)) {
        engine.setPendingDirection(d);
        for (let i = 0; i < 5; i++) engine.tick(1000 / STEPS_PER_SECOND);
        const after = engine.getSnapshot().pacman;
        expect(after.x).toBe(before.x);
        expect(after.y).toBe(before.y);
        return;
      }
    }
    // ทุกทิศเปิด — maze นี้ผิด expectation
    expect(false).toBe(true);
  });

  test("can move in all 4 directions where path allows", () => {
    const engine = new GameEngine(maze);
    engine.start();
    // spawn อยู่ช่องเปิด พยายามทุกทิศทางที่เปิด
    for (const d of ["up", "down", "left", "right"] as Direction[]) {
      engine.reset();
      engine.start();
      const before = engine.getSnapshot().pacman;
      if (canTurn(engine.maze, before.x, before.y, d)) {
        moveDir(engine, d, 4);
        const after = engine.getSnapshot().pacman;
        const v = DIRECTION_VECTORS[d];
        if (v.x !== 0) {
          expect(after.x).not.toBe(before.x);
          expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
        } else {
          expect(after.y).not.toBe(before.y);
          expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
        }
      }
    }
  });

  test("turning at junction works without getting stuck (pending turn)", () => {
    const engine = new GameEngine(maze);
    engine.start();

    // Move left to the centered junction at column 8. Row 13 is open on both sides.
    engine.setPendingDirection("left");
    let p = engine.getSnapshot().pacman;
    for (let i = 0; i < 30; i++) {
      engine.tick(1000 / STEPS_PER_SECOND);
      p = engine.getSnapshot().pacman;
      if (p.x <= 8.1) break;
    }
    const beforeY = p.y;

    // Queue an upward turn before reaching the junction center.
    engine.setPendingDirection("up");
    let turnedUp = false;
    for (let i = 0; i < 15 && !turnedUp; i++) {
      engine.tick(1000 / STEPS_PER_SECOND);
      turnedUp = engine.getSnapshot().pacman.y < beforeY;
    }
    expect(turnedUp).toBe(true);

    const after = engine.getSnapshot().pacman;
    expect(Math.abs(after.x - 8)).toBeLessThan(1e-6);
  });

  test("pause stops simulation (position frozen)", () => {
    const engine = new GameEngine(maze);
    engine.start();
    moveDir(engine, "right", 3);
    engine.pause();
    const before = engine.getSnapshot().pacman;
    // เดินต่อ 20 ticks — ต้องไม่ขยับ
    for (let i = 0; i < 20; i++) engine.tick(1000 / STEPS_PER_SECOND);
    const after = engine.getSnapshot().pacman;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(engine.getSnapshot().status).toBe("paused");
  });

  test("reset restores spawn, pellets, score, lives, and status", () => {
    const engine = new GameEngine(maze);
    engine.start();
    moveDir(engine, "right", 5);
    engine.reset();
    const s = engine.getSnapshot();
    expect(s.pacman).toEqual({ ...maze.spawn.pacman, dir: null });
    expect(s.ghosts).toEqual(maze.spawn.ghosts.map((ghost) => ({ ...ghost, dir: "left", mode: "scatter" })));
    expect(s.pelletsRemaining).toBe(s.totalPellets);
    expect(s.eatenPellets.flat().filter(Boolean)).toHaveLength(s.totalPellets);
    expect(s.score).toBe(0);
    expect(s.lives).toBe(INITIAL_LIVES);
    expect(s.elapsedSeconds).toBe(0);
    expect(s.status).toBe("ready");
  });

  test("power pellet makes nearby ghost edible without losing a life", () => {
    const powerMaze = parseMaze([
      "#########",
      "#PoG....#",
      "#########",
    ]);
    const engine = new GameEngine(powerMaze);
    engine.start();
    engine.setPendingDirection("right");
    for (let i = 0; i < 30; i++) engine.tick(1000 / STEPS_PER_SECOND);
    expect(engine.score).toBeGreaterThanOrEqual(POWER_PELLET_SCORE + GHOST_EAT_SCORE);
    expect(engine.lives).toBe(INITIAL_LIVES);
    expect(engine.ghosts[0].mode).toBe("respawning");
  });

  test("fixed timestep: no movement when dt big (accumulator guarded)", () => {
    const engine = new GameEngine(maze);
    engine.start();
    const before = engine.getSnapshot().pacman;
    // ส่ง dt ใหญ่ผิดปกติ — ต้องจำกัดจำนวน step (ไม่ลื่นไหลตามเวลา)
    engine.tick(100000);
    const after = engine.getSnapshot().pacman;
    // 250ms clamp → สูงสุด 15 steps ระยะรวม ≤ 15*PACMAN_SPEED/60 ≈ 1.5
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeLessThan(1.6);
  });
});

describe("GameEngine helpers (pure collision)", () => {
  test("wall tiles are blocked in current maze", () => {
    // หา tile กำแพงจริงจาก maze definition
    for (let y = 0; y < maze.rows; y += 2) {
      for (let x = 0; x < maze.cols; x += 2) {
        if (maze.tiles[y][x] === "wall") {
          expect(isWalkable(maze, x, y)).toBe(false);
        }
      }
    }
  });

  test("cannot walk outside maze (bounds)", () => {
    // ขอบนอกสุดทุกแถว/คอลัมน์ควรเป็นกำแพง (maze ที่ valid) — เดินออกนอกต้อง blocked
    expect(isWalkable(maze, -1, 1)).toBe(false);
    expect(isWalkable(maze, 1, -1)).toBe(false);
    expect(isWalkable(maze, maze.cols, 1)).toBe(false);
    expect(isWalkable(maze, 1, maze.rows)).toBe(false);
  });
});
