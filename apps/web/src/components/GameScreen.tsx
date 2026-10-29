import { useCallback, useEffect, useRef, useState } from "react";
import type { Direction, GameStatus, GridCoord } from "../game/types";
import { GameEngine, INITIAL_LIVES } from "../game/engine";
import { MAZE_DEFINITION, parseMaze } from "../game/maze";
import { validateMaze } from "../game/validateMaze";
import { BoardRenderer } from "../game/renderer";
import { Leaderboard } from "./Leaderboard";
import { ScoreSubmit } from "./ScoreSubmit";

const DEFAULT_NAME = "guest";

/** ตัวอักษรแสดงชีวิตที่เหลือ (เหลือกี่ชีวิตก็วาดเป็นรูป Pac-Man กี่วง) */
function renderLives(lives: number): string {
  return "●".repeat(Math.max(0, lives));
}

/** ปุ่ม Start/Resume/Play Again เปลี่ยน label ตามสถานะ */
function startLabel(status: GameStatus): string {
  if (status === "paused") return "Resume";
  if (status === "won" || status === "lost") return "Play Again";
  return "Start";
}

/** สร้าง id สำหรับรอบเกมหนึ่งๆ (ใช้เป็น clientRequestId กันคะแนนซ้ำ) */
function newGameId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

/**
 * หน้าจอเกม — ใช้ hook useRef เก็บ instance ระยะยาว (engine/renderer/RAF)
 * เพื่อไม่ให้สร้าง animation loop ใหม่ทุกครั้งที่ React re-render
 */
export function GameScreen() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const scoreRef = useRef<HTMLDivElement | null>(null);
  const livesRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // state สำหรับปุ่ม/UI เท่านั้น — ผลของเกมมาจาก refs ใน loop
  const [status, setStatus] = useState<GameStatus>("ready");
  const [mazeError, setMazeError] = useState<string | null>(null);
  const [pacmanStart, setPacmanStart] = useState<GridCoord>({ x: 0, y: 0 });

  // ---- Phase 7: leaderboard integration ----
  const [showScoreSubmit, setShowScoreSubmit] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [gameId, setGameId] = useState("");
  const [savedName, setSavedName] = useState(DEFAULT_NAME);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  // ตรวจ status ที่เปลี่ยนจริงจาก loop (กัน state transition ซ้ำ → submit ซ้ำ)
  const lastStatusRef = useRef<GameStatus | null>(null);
  const submittedIdRef = useRef<string | null>(null);

  const handleGameEnd = useCallback((snapshotScore: number, id: string) => {
    setShowScoreSubmit(true);
    setFinalScore(snapshotScore);
    setGameId(id);
  }, []);

  const handleNewGame = useCallback(() => {
    // เริ่มรอบใหม่ → เปิดโอกาส submit อีกรอบ (id ใหม่ถูกสร้างตอนจบเกมถัดไป)
    submittedIdRef.current = null;
    setShowScoreSubmit(false);
    setLeaderboardRefreshKey((k) => k + 1); // โหลด leaderboard ใหม่อีกรอบ (เผื่อมีคะแนนใหม่)
  }, []);

  const onScoreCompleted = useCallback(() => {
    setLeaderboardRefreshKey((k) => k + 1); // หลังบันทึกสำเร็จ → โหลด leaderboard ใหม่
  }, []);

  // สร้าง engine ครั้งเดียว — maze ต้องผ่าน validate ก่อน
  useEffect(() => {
    if (engineRef.current) return;
    const maze = parseMaze(MAZE_DEFINITION);
    const errors = validateMaze(maze);
    if (errors.length > 0) {
      setMazeError(errors.join(" "));
      return;
    }
    engineRef.current = new GameEngine(maze);
    setPacmanStart(maze.spawn.pacman);
  }, []);

  // ตั้งขนาด canvas + renderer ครั้งเดียว
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engineRef.current) return;
    const renderer = new BoardRenderer(canvas);
    rendererRef.current = renderer;

    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, window.devicePixelRatio);
  }, []);

  const handleStart = useCallback(() => {
    // ถ้ายังไม่ได้สร้าง engine / maze error → ไม่ทำอะไร (engine สร้างใน effect)
    if (!engineRef.current) return;
    const st = engineRef.current.status;
    // "Play Again" (จบเกมแล้ว) หรือเริ่มเกมใหม่จาก ready → รอบใหม่ ล้าง state submit ค้าง
    // (resume จาก paused ไม่ต้องล้าง)
    if (st === "ready" || st === "won" || st === "lost") {
      handleNewGame();
    }
    engineRef.current.start();
    setStatus(engineRef.current.status);
  }, [handleNewGame]);

  const handlePause = useCallback(() => {
    engineRef.current?.pause();
    setStatus(engineRef.current?.status ?? "ready");
  }, []);

  const handleReset = useCallback(() => {
    engineRef.current?.reset();
    handleNewGame(); // รอบใหม่ — ล้าง state submit ค้าง
    setStatus(engineRef.current?.status ?? "ready");
  }, [handleNewGame]);

  // game loop เดียวต่อ engine — RAF เดียว, cleanup เดียว
  useEffect(() => {
    let lastTime = performance.now();
    const loop = (now: number) => {
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (engine && renderer) {
        const dt = now - lastTime;
        lastTime = now;
        engine.tick(dt);
        const snapshot = engine.getSnapshot();
        renderer.draw(engine.maze, snapshot);

        if (scoreRef.current) {
          scoreRef.current.textContent = String(snapshot.score);
        }
        if (livesRef.current) {
          livesRef.current.textContent = renderLives(snapshot.lives);
        }
        if (statusRef.current) {
          statusRef.current.textContent = snapshot.status;
        }

        // Phase 7: ตรวจจับจบเกม (won/lost) — trigger ครั้งเดียวต่อรอบเกม
        // ดู transition จาก playing → won/lost เท่านั้น กัน state transition ซ้ำ
        const last = lastStatusRef.current;
        if (
          (snapshot.status === "won" || snapshot.status === "lost") &&
          last !== snapshot.status &&
          last === "playing" &&
          submittedIdRef.current === null
        ) {
          const id = newGameId(); // id ประจำรอบเกมนี้ — กัน submit ซ้ำ/retry ซ้ำ
          submittedIdRef.current = id;
          handleGameEnd(snapshot.score, id);
        }
        lastStatusRef.current = snapshot.status;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // resize: ปรับ canvas ให้เข้ากับ container + devicePixelRatio
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) return;
      const rect = canvas.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // input: Arrow keys / WASD — preventDefault + กัน key repeat + กันตอนไม่ running
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // keydown ซ้ำจาก key ค้าง — ไม่เลื่อนซ้ำ
      const keyMap: Record<string, Direction> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
      };
      const dir = keyMap[e.key];
      if (!dir) return;
      e.preventDefault();
      engineRef.current?.setPendingDirection(dir);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="game-layout">
      <header className="hud">
        <div className="hud-item">
          <span className="hud-label">Score</span>
          <span ref={scoreRef} className="hud-value">
            0
          </span>
        </div>
        <div className="hud-item">
          <span className="hud-label">Lives</span>
          <span ref={livesRef} className="hud-value">
            {renderLives(INITIAL_LIVES)}
          </span>
        </div>
        <div className="hud-item">
          <span className="hud-label">Status</span>
          <span ref={statusRef} className="hud-value">
            ready
          </span>
        </div>
      </header>

      <div className="board-wrap">
        {mazeError ? (
          <div className="maze-error" role="alert">
            Maze error: {mazeError}
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="game-canvas"
            aria-label="Pac-Man game board"
          />
        )}
      </div>

      <div className="controls">
        <button
          type="button"
          onClick={handleStart}
          disabled={status === "playing"}
          data-testid="start-button"
        >
          {startLabel(status)}
        </button>
        <button
          type="button"
          onClick={handlePause}
          disabled={status !== "playing"}
          data-testid="pause-button"
        >
          Pause
        </button>
        <button type="button" onClick={handleReset} data-testid="reset-button">
          Reset
        </button>
      </div>

      {showScoreSubmit && (
        <ScoreSubmit
          score={finalScore}
          gameId={gameId}
          playerName={savedName}
          onPlayerNameChange={setSavedName}
          onCompleted={onScoreCompleted}
        />
      )}

      <p className="hint">
        Pac-Man spawn: ({pacmanStart.x}, {pacmanStart.y}) • Arrow keys / WASD to
        move
      </p>

      <Leaderboard refreshKey={leaderboardRefreshKey} />
    </div>
  );
}
