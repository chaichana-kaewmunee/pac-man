import type { GhostColor, MazeGrid, Tile } from "./types";

/**
 * คำนิยามของเขาวงกต — แยกจากโค้ด rendering เพื่อให้แก้แผนที่และทดสอบได้ง่าย
 *
 * สัญลักษณ์:
 *   #  กำแพง
 *   .  ช่องเดิน + เม็ดคะแนน
 *   o  ช่องเดิน + power pellet
 *   P  ตำแหน่งเริ่มต้นของ Pac-Man (เดินได้ ไม่มีเม็ด)
 *   G/g ตำแหน่งเริ่มต้นของ Ghost (เดินได้ ไม่มีเม็ด; แยกตัวอักษรเพื่อจัด 4 จุดให้สมมาตร)
 *   (ช่องว่าง) ช่องเดินเปล่าไม่มีเม็ด
 *
 * ทุกแถวต้องยาว 19 ตัวอักษร — validateMaze เป็นตัวรับประกันตอน parse
 */
export const MAZE_DEFINITION = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.......#.##.#",
  "#....#.......#....#",
  "####.###.#.###.####",
  "####.#.......#.####",
  "#.....GG...gg.....#",
  "#.##.#.......#.##.#",
  "#.##.#.......#.##.#",
  "#.#.............#.#",
  "#.#.#.........#.#.#",
  "#........P........#",
  "###################",
] as const;

export const GHOST_COLORS: readonly GhostColor[] = [
  "red",
  "pink",
  "cyan",
  "orange",
];

function charToTile(char: string): Tile | null {
  switch (char) {
    case "#":
      return "wall";
    case ".":
      return "pellet";
    case "o":
      return "powerPellet";
    case "P":
      return "pacmanSpawn";
    case "G":
    case "g":
      return "ghostSpawn";
    case " ":
      return "path";
    default:
      return null;
  }
}

interface ParsedMazeRow {
  tiles: Tile[];
  pacmanSpawns: Array<{ x: number; y: number }>;
  ghostSpawns: Array<{ x: number; y: number }>;
  pelletCount: number;
  powerPelletCount: number;
}

function parseMazeRow(line: string, y: number, cols: number): ParsedMazeRow {
  const parsed: ParsedMazeRow = {
    tiles: [],
    pacmanSpawns: [],
    ghostSpawns: [],
    pelletCount: 0,
    powerPelletCount: 0,
  };
  for (let x = 0; x < cols; x++) {
    const tile = charToTile(line[x]);
    if (tile === null) throw new Error(`Unknown maze character "${line[x]}" at (${x}, ${y}).`);
    parsed.tiles.push(tile);
    if (tile === "pacmanSpawn") parsed.pacmanSpawns.push({ x, y });
    else if (tile === "ghostSpawn") parsed.ghostSpawns.push({ x, y });
    else if (tile === "pellet") parsed.pelletCount++;
    else if (tile === "powerPellet") parsed.powerPelletCount++;
  }
  return parsed;
}

function validateSpawnCounts(
  pacmanSpawns: Array<{ x: number; y: number }>,
  ghostSpawns: Array<{ x: number; y: number }>,
): void {
  if (pacmanSpawns.length !== 1) {
    throw new Error(`Maze must contain exactly one Pac-Man spawn (P), found ${pacmanSpawns.length}.`);
  }
  if (ghostSpawns.length === 0) {
    throw new Error("Maze must contain at least one ghost spawn (G).");
  }
}

/**
 * แปลงคำนิยามแบบข้อความให้เป็น MazeGrid ที่ engine/UI ใช้
 * การ validate แบบเต็มอยู่ใน validateMaze.ts
 */
export function parseMaze(definition: readonly string[]): MazeGrid {
  const rows = definition.length;
  const cols = definition[0].length;
  const tiles: Tile[][] = [];
  const pacmanSpawns: Array<{ x: number; y: number }> = [];
  const ghostSpawns: Array<{ x: number; y: number }> = [];
  let pelletCount = 0;
  let powerPelletCount = 0;

  for (let y = 0; y < rows; y++) {
    const line = definition[y];
    if (line.length !== cols) {
      throw new Error(`Maze row ${y} has ${line.length} columns, expected ${cols}.`);
    }
    const parsed = parseMazeRow(line, y, cols);
    tiles.push(parsed.tiles);
    pacmanSpawns.push(...parsed.pacmanSpawns);
    ghostSpawns.push(...parsed.ghostSpawns);
    pelletCount += parsed.pelletCount;
    powerPelletCount += parsed.powerPelletCount;
  }

  validateSpawnCounts(pacmanSpawns, ghostSpawns);
  return {
    rows,
    cols,
    tiles,
    spawn: {
      pacman: pacmanSpawns[0],
      ghosts: ghostSpawns.slice(0, GHOST_COLORS.length).map((pos, i) => ({
        ...pos,
        color: GHOST_COLORS[i],
        dir: "left" as const,
        mode: "scatter" as const,
      })),
    },
    pelletCount,
    powerPelletCount,
  };
}