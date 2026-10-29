import { useCallback, useEffect, useRef, useState } from "react";
import { GameCanvas } from "./components/GameCanvas";
import { MainMenu } from "./components/MainMenu";
import { HUD as GameHUD } from "./components/HUD";
import { Overlays } from "./components/Overlays";
import { Leaderboard } from "./components/Leaderboard";
import { ScoreSubmit } from "./components/ScoreSubmit";
import { GAME_EVENTS } from "./phaser/events";
import type { GameStatus } from "./game/types";
import { getGameRegistry } from "./phaser/registryAccess";
import "./styles.css";

/**
 * Shell หลักของเกม:
 * - React = UI รอบเกม (menu, HUD, overlays, leaderboard)
 * - Phaser = canvas เกม (GameCanvas) — Phaser ส่ง snapshot/status ผ่าน registry events
 * React ไม่ได้ render maze เอง ไม่ควบคุมตำแหน่งตัวละคร
 */
export function App() {
  // สถานะ UI (มาจาก Phaser ผ่าน event) — ไม่ใช่ทุก frame, เฉพาะเมื่อเปลี่ยน
  const [phase, setPhase] = useState<"menu" | "game">("menu");
  const [status, setStatus] = useState<GameStatus>("ready");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(0);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [lbRefresh, setLbRefresh] = useState(0);
  // feedback สั้นๆ ระหว่างเล่น: {type:"pellet"|"died", key} — ใช้ key กันซ้ำ
  const [fx, setFx] = useState<{ type: "pellet" | "died"; key: number } | null>(null);
  /** id ตรึงต่อรอบเกมจบ (ชนะ/แพ้) — ใช้เป็น clientRequestId กัน submit ซ้ำ */
  const gameIdRef = useRef<string | null>(null);
  const pendingStartRef = useRef(false);

  // ฟัง events จาก Phaser registry (scene → React) — poll ทุก 200ms เพื่อผูกเมื่อ game เกิด
  // คำสั่ง Play รอจน GameScene ลงทะเบียน listener แล้ว ป้องกันส่ง event ก่อน scene พร้อม
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const poll = setInterval(() => {
      const registry = getGameRegistry();
      if (!registry) return;
      if (!unsub) {
        const onStatus = (s: GameStatus, sc: number, lv: number) => {
          setStatus(s);
          setScore(sc);
          if (lv >= 0) setLives(lv);
          if (s === "won" || s === "lost") {
            setFinalScore(sc);
            // id ใหม่เฉพาะครั้งที่สถานะเปลี่ยนเป็นจบเกมจริง (กัน retry insert ซ้ำ)
            if (!gameIdRef.current) {
              gameIdRef.current = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            }
          }
        };
        const onPelletEaten = () =>
          setFx((f) => ({ type: "pellet" as const, key: (f?.key ?? 0) + 1 }));
        const onPlayerDied = () =>
          setFx((f) => ({ type: "died" as const, key: (f?.key ?? 0) + 1 }));
        registry.events.on(GAME_EVENTS.STATUS, onStatus);
        registry.events.on(GAME_EVENTS.PELLET_EATEN, onPelletEaten);
        registry.events.on(GAME_EVENTS.PLAYER_DIED, onPlayerDied);
        unsub = () => {
          registry.events.off(GAME_EVENTS.STATUS, onStatus);
          registry.events.off(GAME_EVENTS.PELLET_EATEN, onPelletEaten);
          registry.events.off(GAME_EVENTS.PLAYER_DIED, onPlayerDied);
        };
      }
      if (pendingStartRef.current && registry.get("game:scene-ready") === true) {
        pendingStartRef.current = false;
        registry.events.emit(GAME_EVENTS.START);
      }
    }, 200);
    return () => {
      clearInterval(poll);
      unsub?.();
    };
  }, []);

  const registryEmit = useCallback((event: string) => {
    const registry = getGameRegistry();
    registry?.events.emit(event);
  }, []);

  const handlePlay = useCallback(() => {
    setPhase("game");
    setFinalScore(null);
    gameIdRef.current = null; // รอบใหม่ → id ใหม่
    pendingStartRef.current = true; // GameCanvas จะ mount หลังเปลี่ยน phase; เริ่มเมื่อ scene พร้อม
  }, []);

  const handlePause = useCallback(() => registryEmit(GAME_EVENTS.PAUSE), [registryEmit]);
  const handleResume = useCallback(() => registryEmit(GAME_EVENTS.RESUME), [registryEmit]);
  const handleRestart = useCallback(() => {
    setFinalScore(null);
    setFx(null);
    setScore(0);
    setLives(3);
    setStatus("ready");
    setPhase("game");
    gameIdRef.current = null; // รอบใหม่ → id ใหม่
    registryEmit(GAME_EVENTS.READY); // Phaser reset scene + engine/UI
    registryEmit(GAME_EVENTS.START); // เริ่มรอบใหม่หลัง reset
  }, [registryEmit]);

  return (
    <main className="page">
      <h1 className="visually-hidden">Pac-Man</h1>

      {phase === "menu" && <MainMenu onPlay={handlePlay} />}

      {phase === "game" && (
        <>
          <GameHUD score={score} lives={lives} status={status} onPause={handlePause} onResume={handleResume} />
          {fx && (
            <div key={fx.key} className={`fx fx-${fx.type}`} role="status" aria-live="polite">
              {fx.type === "pellet" ? "+10" : "💀"}
            </div>
          )}
          <div className="game-shell">
            <GameCanvas />
            <Overlays
              status={status}
              score={score}
              onResume={handleResume}
              onRestart={handleRestart}
            />
          </div>
          {(status === "won" || status === "lost") && finalScore !== null && (
            <ScoreSubmit
              score={finalScore}
              gameId={gameIdRef.current ?? ""}
              playerName=""
              onPlayerNameChange={() => {}}
              onCompleted={() => setLbRefresh((k) => k + 1)}
            />
          )}
          <Leaderboard refreshKey={lbRefresh} />
        </>
      )}
    </main>
  );
}