interface OverlaysProps {
  readonly status: "ready" | "playing" | "paused" | "won" | "lost";
  readonly score: number;
  readonly onResume: () => void;
  readonly onRestart: () => void;
}

/** Overlays (React, ซ้อนเหนือ canvas เฉพาะตอนพัก/จบ) — เริ่มเกม, pause, restart */
export function Overlays({ status, score, onResume, onRestart }: OverlaysProps) {
  if (status === "ready") return null; // MainMenu แยกแสดง
  if (status === "playing") return null;

  return (
    <dialog open className="overlay" aria-label={`Game ${status}`}>
      <div className="overlay-card">
        {status === "paused" && (
          <>
            <h2>Paused</h2>
            <p>คะแนนปัจจุบัน: {score}</p>
            <button type="button" className="btn" onClick={onResume} autoFocus>
              Resume
            </button>
            <button type="button" className="btn btn-secondary" onClick={onRestart}>
              Restart
            </button>
          </>
        )}

        {status === "won" && (
          <>
            <h2>You Win!</h2>
            <p>คะแนน: {score}</p>
            <button type="button" className="btn" onClick={onRestart} autoFocus>
              Play Again
            </button>
          </>
        )}

        {status === "lost" && (
          <>
            <h2>Game Over</h2>
            <p>คะแนน: {score}</p>
            <button type="button" className="btn" onClick={onRestart} autoFocus>
              Play Again
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}