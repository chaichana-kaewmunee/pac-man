import type { MazeGrid } from "./types";

/**
 * ตรวจสอบความถูกต้องของ Maze ที่ parse แล้ว:
 * - มีอย่างน้อย 1 แถว/คอลัมน์
 * - ขอบทั้ง 4 ด้านเป็นกำแพง (กันตัวละครหลุด)
 * - ทุกช่องที่เดินได้เชื่อมถึง spawn ของ Pac-Man (ไม่มีเม็ดตกค้างในพื้นที่ตัดขาด)
 */
function validateBorders(maze: MazeGrid, errors: string[]): void {
  for (let x = 0; x < maze.cols; x++) {
    if (maze.tiles[0][x] !== "wall") errors.push(`Top border is not a wall at (${x}, 0).`);
    if (maze.tiles[maze.rows - 1][x] !== "wall") {
      errors.push(`Bottom border is not a wall at (${x}, ${maze.rows - 1}).`);
    }
  }
  for (let y = 0; y < maze.rows; y++) {
    if (maze.tiles[y][0] !== "wall") errors.push(`Left border is not a wall at (0, ${y}).`);
    if (maze.tiles[y][maze.cols - 1] !== "wall") {
      errors.push(`Right border is not a wall at (${maze.cols - 1}, ${y}).`);
    }
  }
}

function findConnectedTiles(maze: MazeGrid): Set<number> {
  const visited = new Set<number>();
  const queue: Array<{ x: number; y: number }> = [maze.spawn.pacman];
  visited.add(maze.spawn.pacman.y * maze.cols + maze.spawn.pacman.x);

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const neighbors = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];
    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= maze.cols || neighbor.y >= maze.rows) continue;
      const key = neighbor.y * maze.cols + neighbor.x;
      if (visited.has(key) || maze.tiles[neighbor.y][neighbor.x] === "wall") continue;
      visited.add(key);
      queue.push(neighbor);
    }
  }
  return visited;
}

function appendDisconnectedTileErrors(maze: MazeGrid, visited: Set<number>, errors: string[]): void {
  for (let y = 0; y < maze.rows; y++) {
    for (let x = 0; x < maze.cols; x++) {
      if (maze.tiles[y][x] === "wall") continue;
      const key = y * maze.cols + x;
      if (!visited.has(key)) errors.push(`Walkable tile not connected to Pac-Man spawn at (${x}, ${y}).`);
    }
  }
}

export function validateMaze(maze: MazeGrid): string[] {
  const errors: string[] = [];
  if (maze.rows < 3 || maze.cols < 3) {
    errors.push(`Maze too small: ${maze.rows}x${maze.cols}, minimum 3x3.`);
  }
  validateBorders(maze, errors);
  appendDisconnectedTileErrors(maze, findConnectedTiles(maze), errors);
  return errors;
}