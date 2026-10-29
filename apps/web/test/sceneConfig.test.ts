import { describe, expect, it } from "bun:test";
import { SCENE_KEYS } from "../src/phaser/sceneKeys";
import { GAME_EVENTS } from "../src/phaser/events";
import { TEXTURES } from "../src/phaser/textures";

/**
 * Phase 2 — test scene config ที่ทำได้แบบ node (ไม่ต้อง browser DOM / phaser runtime):
 * - scene keys ไม่ชนกัน, events ครบ lifecycle, textures ครบ
 * (หมายเหตุ: ไม่ import createGame ที่นี่ เพราะ phaser ESM ต้องการ window — ตรวจ
 *   lifecycle ใน browser test/smoke test แทน)
 */

describe("scene configuration", () => {
  it("scene keys ไม่ซ้ำกัน และมี Boot/Game", () => {
    const keys = Object.values(SCENE_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("BootScene");
    expect(keys).toContain("GameScene");
  });

  it("event names ไม่ซ้ำกัน และมี status lifecycle ครบ", () => {
    const ev = Object.values(GAME_EVENTS);
    expect(new Set(ev).size).toBe(ev.length);
    expect(ev).toContain("game:status");
    expect(ev).toContain("game:start");
    expect(ev).toContain("game:pause");
    expect(ev).toContain("game:resume");
    expect(ev).toContain("game:ready");
    expect(ev).toContain("game:pellet-eaten");
    expect(ev).toContain("game:player-died");
  });

  it("texture keys ไม่ซ้ำกัน และครอบคลุม wall/pellet/pacman/ghosts", () => {
    const tex = Object.values(TEXTURES);
    expect(new Set(tex).size).toBe(tex.length);
    expect(tex).toContain("wall");
    expect(tex).toContain("pellet");
    expect(tex).toContain("pacman");
    expect(tex).toContain("ghost-red");
    expect(tex).toContain("ghost-pink");
    expect(tex).toContain("ghost-cyan");
    expect(tex).toContain("ghost-orange");
    expect(tex).toContain("ghost-frightened");
  });
});