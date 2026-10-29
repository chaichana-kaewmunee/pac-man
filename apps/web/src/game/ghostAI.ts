import type { Direction, GridCoord, MazeGrid } from "./types";

/**
 * Ghost AI — logic บริสุทธิ์ (pure) ไม่พึ่ง DOM/ตัวแปรภายนอก
 * - pathfinding แบบ BFS บน grid (ห้ามทะลุกำแพง/ออกนอก maze)
 * - ตัดสินใจที่ทางแยกด้วยการเลือกทิศที่ใกล้ target ที่สุด (tie-break คงที่)
 * - ห้ามกลับทิศ 180° โดยไม่จำเป็น (กลับได้เฉพาะทางตัน)
 * deterministic: input เดียวกัน → output เดียวกันเสมอ
 */

export const OPPOSITE_DIR: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export const DIR_VECTORS: Record<Direction, GridCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** ลำดับ tie-break คงที่ — ทำให้ผล deterministic และไม่ชอบหันกลับ */
const DIR_ORDER: readonly Direction[] = ["up", "left", "down", "right"];

/** คัดลอกจาก movement.isWalkable เพื่อไม่ให้ ghostAI พึ่ง module ของ Pac-Man */
function isWalkable(maze: MazeGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= maze.cols || y >= maze.rows) return false;
  return maze.tiles[y][x] !== "wall";
}

/** หา tile เดินได้ 4 ทิศรอบ (x,y) — ใช้ที่ทางแยก */
export function getWalkableNeighbors(
  maze: MazeGrid,
  x: number,
  y: number,
): GridCoord[] {
  const out: GridCoord[] = [];
  for (const d of DIR_ORDER) {
    const nx = x + DIR_VECTORS[d].x;
    const ny = y + DIR_VECTORS[d].y;
    if (isWalkable(maze, nx, ny)) out.push({ x: nx, y: ny });
  }
  return out;
}

/**
 * BFS path จาก (fromX, fromY) ไป (toX, toY) บน tile ที่เดินได้
 * คืน array พิกัดเส้นทาง (รวม from, ไม่รวม... รวม from และ to)
 * ถ้าไม่มีเส้นทาง → null
 */
export function bfsPath(
  maze: MazeGrid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): GridCoord[] | null {
  if (!isWalkable(maze, toX, toY)) return null;
  if (fromX === toX && fromY === toY) return [{ x: fromX, y: fromY }];

  const queue: GridCoord[] = [{ x: fromX, y: fromY }];
  const visited = new Set<string>([`${fromX},${fromY}`]);
  const prev = new Map<string, GridCoord | null>();
  prev.set(`${fromX},${fromY}`, null);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === toX && cur.y === toY) break;

    for (const n of getWalkableNeighbors(maze, cur.x, cur.y)) {
      const key = `${n.x},${n.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      prev.set(key, cur);
      queue.push(n);
    }
  }

  const last = `${toX},${toY}`;
  if (!visited.has(last)) return null; // ไปไม่ถึง

  // trace กลับ
  const path: GridCoord[] = [];
  let cur: GridCoord | null = { x: toX, y: toY };
  while (cur) {
    path.unshift(cur);
    const k: string = `${cur.x},${cur.y}`;
    cur = prev.get(k) ?? null;
  }
  return path;
}

/** ระยะ manhattan — ใช้เช็ค y/x เมื่อ far */
function manhattan(a: GridCoord, b: GridCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * ตัดสินใจทิศถัดไปของ ghost ที่ทางแยก (อยู่กลาง tile):
 * - ถ้าเหลือทิศเดียว (ทางตัน) → ต้องกลับ (อนุญาต 180°)
 * - มีทางเลือกหลายทิศ → เลือกทิศที่ใกล้ target (manhattan) มากสุด, tie-break ตาม DIR_ORDER
 * - ห้ามกลับทิศตรงข้ามกับ currentDir เว้นแต่ทางตัน
 */
function findDeadEndDirection(
  options: GridCoord[],
  ghostX: number,
  ghostY: number,
  currentDir: Direction,
): Direction | null {
  const back = OPPOSITE_DIR[currentDir];
  const backTile = { x: ghostX + DIR_VECTORS[back].x, y: ghostY + DIR_VECTORS[back].y };
  if (options.some((neighbor) => neighbor.x === backTile.x && neighbor.y === backTile.y)) return back;

  for (const direction of DIR_ORDER) {
    const next = { x: ghostX + DIR_VECTORS[direction].x, y: ghostY + DIR_VECTORS[direction].y };
    if (options.some((neighbor) => neighbor.x === next.x && neighbor.y === next.y)) return direction;
  }
  return null;
}

function findBestTargetDirection(
  options: GridCoord[],
  ghostX: number,
  ghostY: number,
  currentDir: Direction,
  target: GridCoord,
): Direction | null {
  let best: Direction | null = null;
  let bestDist = Infinity;
  for (const direction of DIR_ORDER) {
    if (direction === OPPOSITE_DIR[currentDir]) continue;
    const next = { x: ghostX + DIR_VECTORS[direction].x, y: ghostY + DIR_VECTORS[direction].y };
    if (!options.some((neighbor) => neighbor.x === next.x && neighbor.y === next.y)) continue;
    const distance = manhattan(next, target);
    if (distance < bestDist) {
      bestDist = distance;
      best = direction;
    }
  }
  return best;
}

export function decideDirection(
  maze: MazeGrid,
  ghostX: number,
  ghostY: number,
  currentDir: Direction,
  target: GridCoord,
): Direction {
  const options = getWalkableNeighbors(maze, ghostX, ghostY);
  const forward = { x: ghostX + DIR_VECTORS[currentDir].x, y: ghostY + DIR_VECTORS[currentDir].y };
  const canContinue = options.some((neighbor) => neighbor.x === forward.x && neighbor.y === forward.y);

  if (!canContinue) {
    const deadEndDirection = findDeadEndDirection(options, ghostX, ghostY, currentDir);
    if (deadEndDirection !== null) return deadEndDirection;
  }

  return findBestTargetDirection(options, ghostX, ghostY, currentDir, target)
    ?? OPPOSITE_DIR[currentDir];
}

/** เลือกทางหนีที่เพิ่มระยะทางตามเส้นทางถึง Pac-Man โดยไม่กลับหลังถ้าไม่ใช่ทางตัน */
export function decideFleeDirection(
  maze: MazeGrid,
  ghostX: number,
  ghostY: number,
  currentDir: Direction,
  pacman: GridCoord,
): Direction {
  const options = getWalkableNeighbors(maze, ghostX, ghostY);
  const forwardOptions = options.filter((n) =>
    n.x !== ghostX + DIR_VECTORS[OPPOSITE_DIR[currentDir]].x ||
    n.y !== ghostY + DIR_VECTORS[OPPOSITE_DIR[currentDir]].y
  );
  const candidates = forwardOptions.length > 0 ? forwardOptions : options;

  let bestDir = OPPOSITE_DIR[currentDir];
  let bestDistance = -1;
  for (const dir of DIR_ORDER) {
    const next = {
      x: ghostX + DIR_VECTORS[dir].x,
      y: ghostY + DIR_VECTORS[dir].y,
    };
    if (!candidates.some((n) => n.x === next.x && n.y === next.y)) continue;
    const path = bfsPath(
      maze,
      next.x,
      next.y,
      Math.floor(pacman.x + 0.5),
      Math.floor(pacman.y + 0.5),
    );
    const distance = path ? path.length : Number.POSITIVE_INFINITY;
    if (distance > bestDistance) {
      bestDistance = distance;
      bestDir = dir;
    }
  }
  return bestDir;
}

/**
 * เป้าหมาย AI ตามโหมด:
 * - scatter: มุมที่กำหนด (steady กลับบ้าน) — deterministic
 * - chase: ไล่ Pac-Man (target = pacman)
 * - respawning: กลับไปที่ spawn (ghost house)
 */
export function getTarget(
  mode: "scatter" | "chase",
  pacman: GridCoord,
  corner: GridCoord,
): GridCoord {
  return mode === "scatter" ? corner : pacman;
}
