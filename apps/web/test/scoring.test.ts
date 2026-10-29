import { describe, expect, test } from "bun:test";
import {
  GameEngine,
  INITIAL_LIVES,
  PELLET_SCORE,
  POWER_PELLET_SCORE,
  RESPAWN_INVULN_SECONDS,
} from "../src/game/engine";
import { parseMaze } from "../src/game/maze";
import { validateMaze } from "../src/game/validateMaze";
import type { MazeGrid } from "../src/game/types";

/**
 * fixtures: ผ่าน validator เสมอ — row1 ทางเดิน 5 เม็ด (P ซ้ายสุด)
 * ช่องขึ้น row3→row2 อยู่ col7 (ใกล้ ghost), row2→row1 อยู่ col1 (ไกลสุด) → ghost
 * ต้องอ้อม: (7,3)→(7,2)→(1,2)→(1,1) = 1+6+2 = 9 tile @ 85% ≈ 10.6 tile-time
 * แต่ Pac-Man เก็บ 5 เม็ดเสร็จใน ~6 tile-time → ชนะก่อน ghost ไล่ถึงเสมอ
 * (collision tests บังคับให้ ghost ทับ Pac-Man เอง ไม่พึ่ง pathing)
 */
const WIN_DEFINITION = [
  "#########",
  "#P.....##",
  "# ##### #",
  "#      G#",
  "#########",
] as const;

const POWER_DEFINITION = [
  "#########",
  "#P.o...##",
  "# ##### #",
  "#      G#",
  "#########",
] as const;

function makeMaze(def: readonly string[]): MazeGrid {
  const maze = parseMaze(def);
  const errors = validateMaze(maze);
  expect(errors).toEqual([]); // fixture ต้อง valid เอง
  return maze;
}

/** tick ไปเรื่อย ๆ จนกว่า condition เป็นจริง (หรือครบ maxSteps) */
function walkUntil(
  engine: GameEngine,
  condition: () => boolean,
  maxSteps = 600,
): boolean {
  for (let i = 0; i < maxSteps; i++) {
    if (condition()) return true;
    engine.tick(1000 / 60);
  }
  return condition();
}

/** วาง ghost ตัวแรกให้ทับ Pac-Man (บังคับชน) */
function placeGhostOnPacman(engine: GameEngine): void {
  const p = engine.getSnapshot().pacman;
  engine.ghosts[0].x = p.x;
  engine.ghosts[0].y = p.y;
}

/** ย้าย ghost กลับ spawn (กันชนระหว่างรอ respawn) */
function moveGhostAway(engine: GameEngine): void {
  const s = engine.maze.spawn.ghosts[0];
  engine.ghosts[0].x = s.x;
  engine.ghosts[0].y = s.y;
}

/** รอจนกว่า respawn invulnerability หมด (+ buffer) */
function waitInvuln(engine: GameEngine): void {
  for (let i = 0; i < Math.ceil(RESPAWN_INVULN_SECONDS * 60) + 2; i++) {
    engine.tick(1000 / 60);
  }
}

describe("scoring and game state", () => {
  test("eats pellets, score increases 10 each, eaten exactly once", () => {
    const engine = new GameEngine(makeMaze(WIN_DEFINITION));
    expect(engine.totalPellets).toBe(5);
    engine.start();

    // เดินขวาจาก spawn (x=1) ไปจนสุด corridor (x=6 = 5 เม็ด) แล้วต้องถึงกำแพง
    engine.setPendingDirection("right");
    const done = walkUntil(engine, () => engine.status === "won");
    expect(done).toBe(true);
    expect(engine.score).toBe(PELLET_SCORE * 5);
    expect(engine.getSnapshot().pelletsRemaining).toBe(0);
    expect(engine.status).toBe("won");
  });

  test("does not re-collect an already eaten pellet", () => {
    const engine = new GameEngine(makeMaze(WIN_DEFINITION));
    engine.start();

    // เดินขวากินเม็ดที่ x=2
    engine.setPendingDirection("right");
    walkUntil(engine, () => engine.score >= PELLET_SCORE);
    expect(engine.score).toBe(PELLET_SCORE);
    const eaten = engine.getSnapshot().eatenPellets;
    expect(eaten[1][2]).toBe(false); // tile (2,1) กินแล้ว

    // เดินกลับมาที่ spawn (ข้าม tile (2,1) อีกครั้งผ่านทิศทางเดิม)
    engine.setPendingDirection("left");
    walkUntil(engine, () => engine.getSnapshot().pacman.x <= 1.2);

    // กลับไปขวาให้ผ่าน tile (2,1) อีกครั้ง — ต้องไม่เก็บซ้ำ (score เท่าเดิม)
    engine.setPendingDirection("right");
    walkUntil(engine, () => engine.getSnapshot().pacman.x >= 2.2);

    expect(engine.score).toBe(PELLET_SCORE);
    expect(engine.getSnapshot().eatenPellets[1][2]).toBe(false);
  });

  test("power pellet awards 50 and winning condition stops play", () => {
    const engine = new GameEngine(makeMaze(POWER_DEFINITION));
    expect(engine.totalPellets).toBe(5); // 1 power + 4 normal
    engine.start();

    engine.setPendingDirection("right");
    walkUntil(engine, () => engine.score >= PELLET_SCORE);
    expect(engine.score).toBe(PELLET_SCORE); // "."

    walkUntil(
      engine,
      () => engine.score >= PELLET_SCORE + POWER_PELLET_SCORE,
    );
    expect(engine.score).toBe(PELLET_SCORE + POWER_PELLET_SCORE); // "o"

    walkUntil(engine, () => engine.status === "won");
    expect(engine.score).toBe(PELLET_SCORE * 4 + POWER_PELLET_SCORE);
    expect(engine.getSnapshot().pelletsRemaining).toBe(0);
  });

  test("ghost collision: life lost once, respawn invulnerable, then lost", () => {
    const engine = new GameEngine(makeMaze(WIN_DEFINITION));
    engine.start();
    const spawn = engine.maze.spawn.pacman;

    // 1) ชนครั้งแรก → ลด 1 ชีวิต + respawn กลับ spawn + invulnerable
    placeGhostOnPacman(engine);
    engine.tick(1000 / 60);
    expect(engine.lives).toBe(INITIAL_LIVES - 1);
    expect(engine.respawnInvulnRemaining).toBeGreaterThan(0);
    expect(engine.status).toBe("playing");
    {
      const snap = engine.getSnapshot();
      expect(Math.round(snap.pacman.x)).toBe(spawn.x);
      expect(Math.round(snap.pacman.y)).toBe(spawn.y);
    }

    // 2) ชนซ้ำทันทีระหว่าง invulnerable → ไม่ลดซ้ำ
    placeGhostOnPacman(engine);
    engine.tick(1000 / 60);
    expect(engine.lives).toBe(INITIAL_LIVES - 1);

    // 3) รอ invulnerable หมด → ชนได้อีก (ลดที่ 2)
    moveGhostAway(engine);
    waitInvuln(engine);
    placeGhostOnPacman(engine);
    engine.tick(1000 / 60);
    expect(engine.lives).toBe(INITIAL_LIVES - 2);

    // 4) ตายครั้งที่ 3 → lost (ไม่มีชีวิตเหลือ)
    moveGhostAway(engine);
    waitInvuln(engine);
    placeGhostOnPacman(engine);
    engine.tick(1000 / 60);
    expect(engine.lives).toBe(0);
    expect(engine.status).toBe("lost");
  });

  test("paused stops simulation and ignores input", () => {
    const engine = new GameEngine(makeMaze(WIN_DEFINITION));
    engine.start();
    engine.setPendingDirection("right");
    walkUntil(engine, () => engine.score >= PELLET_SCORE);

    engine.pause();
    const before = engine.getSnapshot().pacman;
    const scoreBefore = engine.score;

    engine.setPendingDirection("left"); // ต้องถูก ignore (ไม่เล่น)
    engine.tick(10000); // dt ใหญ่ — ถ้าเดินจะไกลมาก

    const after = engine.getSnapshot().pacman;
    expect(engine.status).toBe("paused");
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(engine.score).toBe(scoreBefore);
    expect(engine.pendingDirection).toBeNull(); // input ถูก ignore
  });

  test("lost freezes simulation and ignores input", () => {
    const engine = new GameEngine(makeMaze(WIN_DEFINITION));
    engine.start();

    for (let hit = 0; hit < INITIAL_LIVES; hit++) {
      moveGhostAway(engine);
      waitInvuln(engine);
      placeGhostOnPacman(engine);
      engine.tick(1000 / 60);
    }
    expect(engine.status).toBe("lost");

    const before = engine.getSnapshot();
    engine.setPendingDirection("right");
    engine.tick(10000);

    const after = engine.getSnapshot();
    expect(engine.status).toBe("lost");
    expect(after.pacman.x).toBe(before.pacman.x);
    expect(after.pacman.y).toBe(before.pacman.y);
    expect(engine.score).toBe(before.score);
    expect(engine.pendingDirection).toBeNull();
  });

  test("won does not allow further scoring or movement", () => {
    const engine = new GameEngine(makeMaze(POWER_DEFINITION));
    engine.start();

    // เดินไปจนชนะ (เก็บครบทุกเม็ด)
    engine.setPendingDirection("right");
    const won = walkUntil(engine, () => engine.status === "won");
    expect(won).toBe(true);
    expect(engine.status).toBe("won");

    const score = engine.score;
    const x = engine.getSnapshot().pacman.x;

    engine.setPendingDirection("left");
    engine.tick(10000);

    expect(engine.status).toBe("won");
    expect(engine.score).toBe(score);
    expect(engine.getSnapshot().pacman.x).toBe(x);
  });

  test("reset restores the full ready state", () => {
    const engine = new GameEngine(makeMaze(WIN_DEFINITION));
    engine.start();
    walkUntil(engine, () => engine.score >= PELLET_SCORE);
    engine.pause();
    engine.reset();

    const snap = engine.getSnapshot();
    expect(snap.status).toBe("ready");
    expect(snap.lives).toBe(INITIAL_LIVES);
    expect(snap.score).toBe(0);
    expect(snap.pelletsRemaining).toBe(snap.totalPellets);
    expect(snap.elapsedSeconds).toBe(0);
    expect(Math.round(snap.pacman.x)).toBe(engine.maze.spawn.pacman.x);
    expect(Math.round(snap.pacman.y)).toBe(engine.maze.spawn.pacman.y);
    expect(engine.pendingDirection).toBeNull();
    expect(engine.respawnInvulnRemaining).toBe(0);
  });
});