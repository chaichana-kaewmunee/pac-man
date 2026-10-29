/**
 * คีย์ texture ทั้งหมด — สร้างจาก Graphics (โปรแกรม) ไม่โหลดไฟล์
 * → ไม่มี asset ภายนอก ไม่มีใบอนุญาต/watermark ให้กังวล
 */
export const TEXTURES = {
  WALL: "wall",
  WALL_EDGE: "wall-edge",
  PELLET: "pellet",
  POWER_PELLET: "power-pellet",
  PACMAN: "pacman",
  GHOST_RED: "ghost-red",
  GHOST_PINK: "ghost-pink",
  GHOST_CYAN: "ghost-cyan",
  GHOST_ORANGE: "ghost-orange",
  GHOST_FRIGHTENED: "ghost-frightened",
} as const;