import { describe, expect, test } from "bun:test";
import {
  bfsPath,
  decideDirection,
  decideFleeDirection,
  getTarget,
  getWalkableNeighbors,
} from "../src/game/ghostAI";
import { GameEngine } from "../src/game/engine";
import { parseMaze } from "../src/game/maze";
import type { MazeGrid } from "../src/game/types";

/** maze ขนาดเล็ก deterministic: ทางเดินตรงเชื่อม P กับ G */
const CORRIDOR = [
  "########",
  "#P....G#",
  "########",
] as const;

/** ทางแยก (cross) กลางห้อง — ghost หันจากซ้ายไปขวา, target อยู่ขวา */
// ทางแยก (cross) กลางห้อง — มี P/G ครบเพื่อให้ parseMaze รับ
const CROSS = [
  "#########",
  "#...#...#",
  "#.#...#.#",
  "#P.#.#.G#",
  "#...#...#",
  "#########",
] as const;

function makeMaze(def: readonly string[]): MazeGrid {
  return parseMaze(def);
}

// --- pathfinding (BFS) ---

describe("bfsPath", () => {
  const maze = makeMaze(CORRIDOR);

  test("finds a path from start to goal", () => {
    const path = bfsPath(maze, 1, 1, 6, 1);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 6, y: 1 });
  });

  test("path length is minimal (no detours)", () => {
    const path = bfsPath(maze, 1, 1, 6, 1)!;
    // corridor ตรง 1 แถว → ระยะ = 6 (ขยับ x 5 ครั้ง + จุดตั้งต้น)
    expect(path).toHaveLength(6);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1); // เดินช่องต่อช่อง
    }
  });

  test("start equals goal returns single node", () => {
    const path = bfsPath(maze, 1, 1, 1, 1);
    expect(path).toEqual([{ x: 1, y: 1 }]);
  });

  test("returns null when goal is a wall", () => {
    expect(bfsPath(maze, 1, 1, 0, 1)).toBeNull();
  });

  test("returns null when no path exists (enclosed area)", () => {
    // ห้องขวาบนปิด: (6,0) เป็นกำแพงโดยรอบ — เข้าไม่ถึงจาก (1,1)
    const BLOCKED = [
      "#########",
      "#P....#.#",
      "#######G#",
      "#.......#",
      "#########",
    ] as const;
    const m = makeMaze(BLOCKED);
    // (7,3) อยู่คนละห้องกับ P — ต้องไม่มี path
    const path = bfsPath(m, 1, 1, 7, 3);
    expect(path).toBeNull();
    expect(m.tiles[3][7]).not.toBe("wall");
  });

  test("never crosses walls (every step walkable)", () => {
    const m = makeMaze(CROSS);
    const path = bfsPath(m, 1, 1, 7, 3)!;
    expect(path).not.toBeNull();
    for (const n of path) {
      // ใช้ tile โดยตรง — ต้องไม่ใช่ wall
      expect(m.tiles[n.y][n.x]).not.toBe("wall");
    }
  });
});

// --- การตัดสินใจที่ทางแยก / ทางตัน ---

describe("decideDirection", () => {
  test("continues forward when target is straight ahead", () => {
    const maze = makeMaze(CORRIDOR);
    // ที่ (3,1) target อยู่ขวา → เดิน right ต่อ
    const dir = decideDirection(maze, 3, 1, "right", { x: 7, y: 1 });
    expect(dir).toBe("right");
  });

  test("turns toward target at a junction", () => {
    const maze = makeMaze(CROSS);
    // ทางแยกกลาง: ghost ที่ (3,3) เดิน right, target อยู่บน (3,1) → เลือก up
    const dir = decideDirection(maze, 3, 3, "right", { x: 3, y: 1 });
    expect(dir).toBe("up"); // ใกล้ target มากกว่า left/right
  });

  test("chooses forward at a junction over reversing", () => {
    // ทางแยก 3 ทาง: ghost มาตามแกน x จากซ้าย, target อยู่บน
    // → เลือก up แทนที่จะกลับซ้าย
    const T_JUNCTION = [
      "#########",
      "#...#...#",
      "#.#.#.#.#",
      "#P...#..G",
      "#########",
    ] as const;
    const maze = makeMaze(T_JUNCTION);
    // ที่ (3,3) เดิน right, target อยู่บน (3,1)
    const dir = decideDirection(maze, 3, 3, "right", { x: 3, y: 1 });
    expect(dir).toBe("up");
  });

  test("reverses when cornered (dead end)", () => {
    // ทางตัน: corridor ยาว 1 ช่อง แล้วกำแพง — เดินขวาไปสุด แล้วต้องกลับ
    const DEADEND = [
      "#########",
      "#P......#",
      "######G##",
      "#########",
    ] as const;
    const maze = makeMaze(DEADEND);
    // ที่ (7,1) target อยู่ซ้าย — ทางเดียวที่เดินได้คือ left (กลับ)
    const dir = decideDirection(maze, 7, 1, "right", { x: 1, y: 1 });
    expect(dir).toBe("left");
  });

  test("returns a walkable direction even if target far", () => {
    const maze = makeMaze(CORRIDOR);
    const dir = decideDirection(maze, 2, 1, "right", { x: 7, y: 1 });
    expect(["up", "down", "left", "right"]).toContain(dir);
  });
});

// --- getWalkableNeighbors ---

describe("decideFleeDirection", () => {
  test("chooses an available direction that increases path distance from Pac-Man", () => {
    const maze = makeMaze(CROSS);
    const direction = decideFleeDirection(maze, 3, 3, "right", { x: 3, y: 1 });
    expect(direction).toBe("down");
  });

  test("handles Pac-Man's fractional position while fleeing", () => {
    const maze = makeMaze(CROSS);
    const direction = decideFleeDirection(maze, 3, 3, "right", { x: 3.2, y: 1.1 });
    expect(direction).toBe("down");
  });
});

describe("getWalkableNeighbors", () => {
  test("returns only walkable neighbors (no walls)", () => {
    const maze = makeMaze(CORRIDOR);
    const n = getWalkableNeighbors(maze, 3, 1);
    // corridor: ข้างบน/ล่างเป็นกำแพง → เหลือ left/right
    expect(n.map((p) => `${p.x},${p.y}`).sort()).toEqual(["2,1", "4,1"]);
  });
});

// --- getTarget ---

describe("getTarget", () => {
  test("scatter targets the corner, chase targets pacman", () => {
    const pac = { x: 5, y: 5 };
    const corner = { x: 0, y: 0 };
    expect(getTarget("scatter", pac, corner)).toEqual(corner);
    expect(getTarget("chase", pac, corner)).toEqual(pac);
  });
});

// --- Engine: ghost movement + interaction ---

describe("GameEngine ghost AI integration", () => {
  test("ghost moves through the corridor without leaving path", () => {
    const engine = new GameEngine(makeMaze(CORRIDOR));
    engine.start();
    engine.setPendingDirection("right");
    // เดินไประยะหนึ่ง — ghost ต้องไม่ออกนอก maze (อยู่ใน corridor 1 แถวเท่านั้น)
    for (let i = 0; i < 240; i++) engine.tick(1000 / 60);
    for (const g of engine.ghosts) {
      expect(g.y).toBe(1); // อยู่แถวเดียวกับ corridor
      expect(g.x).toBeGreaterThanOrEqual(1);
      expect(g.x).toBeLessThanOrEqual(6);
    }
  });

  test("ghost gets closer to pacman over time (chase)", () => {
    const engine = new GameEngine(makeMaze(CORRIDOR));
    engine.start();
    const g0 = engine.ghosts[0];
    const startDist = Math.abs(g0.x - engine.pacman.x);
    for (let i = 0; i < 360; i++) engine.tick(1000 / 60); // ~6s → chase
    const g1 = engine.ghosts[0];
    expect(Math.abs(g1.x - engine.pacman.x)).toBeLessThan(startDist);
  });

  test("pause stops ghost movement", () => {
    const engine = new GameEngine(makeMaze(CORRIDOR));
    engine.start();
    for (let i = 0; i < 120; i++) engine.tick(1000 / 60);
    engine.pause();
    const frozen = engine.ghosts.map((g) => ({ x: g.x, y: g.y }));
    for (let i = 0; i < 120; i++) engine.tick(1000 / 60);
    expect(engine.ghosts.map((g) => ({ x: g.x, y: g.y }))).toEqual(frozen);
  });

  test("game-over stops ghost simulation", () => {
    const engine = new GameEngine(makeMaze(CORRIDOR));
    engine.start();
    // ghost เดินเป็นระบบ: ไปมาใน corridor ชน Pac-Man ทุกรอบ
    // lives=3 → ต้องชน 3 ครั้ง (+ invuln 2s ระหว่าง) → จบ "lost" ประมาณ 600–1200 ticks
    for (let i = 0; i < 2000; i++) engine.tick(1000 / 60);
    expect(["won", "lost"]).toContain(engine.status);
    if (engine.status === "lost") {
      const frozen = engine.ghosts.map((g) => ({ x: g.x, y: g.y }));
      engine.tick(1000 / 60);
      engine.tick(1000 / 60);
      expect(engine.ghosts.map((g) => ({ x: g.x, y: g.y }))).toEqual(frozen);
    }
  });

  test("scatter/chase mode switches on schedule (wide maze, no early collision)", () => {
    // maze กว้าง: ghost อยู่ไกลจาก Pac-Man มาก ใช้เวลาเดินข้าม > 10s
    // → โหมดถูกสลับตามเวลาโดยยังไม่ชน Pac-Man
    const WIDE = [
      "##################",
      "#P...............#",
      "#................#",
      "#................#",
      "#...............G#",
      "##################",
    ] as const;
    // ระยะ P→G ประมาณ 19 tiles ด้วยความเร็ว ghost 0.85*1/60 → ~19/(0.85/60)=1341 step ≈ 22s
    const engine = new GameEngine(makeMaze(WIDE));
    engine.start();
    for (let i = 0; i < 360; i++) engine.tick(1000 / 60); // 6s
    expect(engine.ghosts.every((g) => g.mode === "scatter")).toBe(true);
    expect(engine.lives).toBeGreaterThan(0); // ยังไม่ชน
    for (let i = 0; i < 180; i++) engine.tick(1000 / 60); // +3s = 9s
    expect(engine.ghosts.every((g) => g.mode === "chase")).toBe(true);
  });
});