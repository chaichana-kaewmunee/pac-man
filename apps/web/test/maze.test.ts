import { describe, expect, test } from "bun:test";
import { MAZE_DEFINITION, parseMaze } from "../src/game/maze";
import { validateMaze } from "../src/game/validateMaze";
import { canTurn, isWalkable } from "../src/game/movement";
import type { MazeGrid } from "../src/game/types";

const DEFINITION = [
  "#######",
  "#.P.G.#",
  "#.....#",
  "#######",
] as const;

describe("real maze layout", () => {
  test("is a rectangular left-right reflection across the center column", () => {
    expect(MAZE_DEFINITION).toHaveLength(15);
    const cols = MAZE_DEFINITION[0].length;
    expect(cols).toBe(19);

    const canonical = (cell: string) => cell === "g" ? "G" : cell;
    for (const row of MAZE_DEFINITION) {
      expect(row).toHaveLength(cols);
      for (let x = 0; x < cols; x++) {
        expect(canonical(row[x])).toBe(canonical(row[cols - 1 - x]));
      }
    }
  });

  test("keeps the Pac-Man spawn centered and the four ghost spawns mirrored", () => {
    const maze = parseMaze(MAZE_DEFINITION);
    expect(maze.spawn.pacman).toEqual({ x: 9, y: 13 });
    expect(maze.spawn.ghosts).toHaveLength(4);
    const ghostColumns = maze.spawn.ghosts.map(({ x }) => x).sort((a, b) => a - b);
    expect(ghostColumns).toEqual([6, 7, 11, 12]);
    expect(ghostColumns[0] + ghostColumns[3]).toBe(maze.cols - 1);
    expect(ghostColumns[1] + ghostColumns[2]).toBe(maze.cols - 1);
    expect(validateMaze(maze)).toEqual([]);
  });

  test("connects both side corridors into loop routes with no walkable dead ends", () => {
    const maze = parseMaze(MAZE_DEFINITION);

    // The opened side junctions connect the upper and lower corridors on both sides.
    for (const x of [1, maze.cols - 2]) {
      expect(isWalkable(maze, x, 9)).toBe(true);
      expect(canTurn(maze, x, 9, "up")).toBe(true);
      expect(canTurn(maze, x, 9, "down")).toBe(true);
    }

    // Every walkable tile has at least two exits, so the playable corridors have no dead ends.
    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        if (!isWalkable(maze, x, y)) continue;
        const exits = [
          isWalkable(maze, x + 1, y),
          isWalkable(maze, x - 1, y),
          isWalkable(maze, x, y + 1),
          isWalkable(maze, x, y - 1),
        ].filter(Boolean).length;
        expect(exits).toBeGreaterThanOrEqual(2);
      }
    }
    expect(validateMaze(maze)).toEqual([]);
  });

  test("mirrors pellet and power-pellet tile types", () => {
    const maze = parseMaze(MAZE_DEFINITION);
    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        expect(maze.tiles[y][x]).toBe(maze.tiles[y][maze.cols - 1 - x]);
      }
    }
    expect(maze.powerPelletCount).toBe(2);
    expect(maze.pelletCount).toBeGreaterThan(0);
  });
});

describe("parseMaze", () => {
  test("reads grid size, tiles and spawns from definition", () => {
    const maze = parseMaze(DEFINITION);
    expect(maze.rows).toBe(4);
    expect(maze.cols).toBe(7);
    expect(maze.tiles[0][0]).toBe("wall");
    expect(maze.tiles[1][1]).toBe("pellet");
    expect(maze.tiles[1][2]).toBe("pacmanSpawn"); // "P"
    expect(maze.tiles[1][4]).toBe("ghostSpawn"); // "G"
    expect(maze.tiles[2][1]).toBe("pellet");
    expect(maze.tiles[2][5]).toBe("pellet");
    expect(maze.spawn.pacman).toEqual({ x: 2, y: 1 });
    expect(maze.spawn.ghosts).toHaveLength(1);
    expect(maze.spawn.ghosts[0]).toEqual({
      x: 4,
      y: 1,
      color: "red",
      dir: "left",
      mode: "scatter",
    });
  });

  test("counts pellets and power pellets", () => {
    const maze = parseMaze([
      "#######",
      "#Poo#G#",
      "#..o..#",
      "#######",
    ]);
    expect(maze.pelletCount).toBe(4);
    expect(maze.powerPelletCount).toBe(3);
  });

  test("rejects rows of unequal length", () => {
    expect(() => parseMaze(["####", "###"])).toThrow(/columns/);
  });

  test("rejects an unknown character", () => {
    expect(() => parseMaze(["####", "#X##", "####"])).toThrow(/character/);
  });

  test("rejects maze with missing Pac-Man spawn", () => {
    expect(() => parseMaze(["###", "#.#", "###"])).toThrow(/Pac-Man spawn/);
  });

  test("rejects maze with no ghost spawn", () => {
    expect(() => parseMaze(["###", "#P#", "###"])).toThrow(/ghost spawn/);
  });
});

describe("validateMaze", () => {
  test("returns no errors for a connected maze with wall borders", () => {
    const maze = parseMaze(DEFINITION);
    expect(validateMaze(maze)).toEqual([]);
  });

  test("flags missing wall borders", () => {
    // ขอบบนเปิด (มี "." แทน "#" ที่ (3,0)) — validator ต้องเจอ
    const maze = parseMaze([
      "###.###",
      "#.P#G.#",
      "#..#..#",
      "#######",
    ]);
    const errors = validateMaze(maze);
    expect(errors.some((e) => e.startsWith("Top border"))).toBe(true);
  });

  test("flags walkable tiles isolated from Pac-Man spawn", () => {
    // กำแพงแนวตั้งกั้น P (ซ้าย) ออกจาก G + ทางเดิน (ขวา) — ทั้งฝั่งขวาไม่ connect
    const maze = parseMaze([
      "#######",
      "#P#..G#",
      "#.#...#",
      "##..###",
      "#######",
    ]);
    const errors = validateMaze(maze);
    expect(errors.some((e) => e.includes("not connected"))).toBe(true);
  });

  test("real maze definition is valid", () => {
    const maze: MazeGrid = parseMaze(MAZE_DEFINITION);
    expect(validateMaze(maze)).toEqual([]);
  });
});