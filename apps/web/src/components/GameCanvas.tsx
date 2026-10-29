import { useEffect, useRef } from "react";
import { createGame } from "../phaser/createGame";

/**
 * รับผิดชอบ mount/destroy Phaser.Game หนึ่ง instance ลงใน container
 * - StrictMode เรียก effect 2 รอบ → ต้อง guard ไม่ให้สร้างเกมซ้ำ และ destroy ระหว่าง
 * - ล้างเกมเมื่อ unmount (destroy() = resource leak-free)
 */
export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (gameRef.current) return; // StrictMode guard: ไม่สร้างซ้ำ

    const game = createGame(containerRef.current);
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="game-canvas" />;
}