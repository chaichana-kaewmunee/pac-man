type HUDProps = Readonly<{
  score: number;
  lives: number;
  status: "ready" | "playing" | "paused" | "won" | "lost";
  onPause: () => void;
  onResume: () => void;
}>;

/** HUD — Score / Lives / สถานะ (React อ่านจาก snapshot ที่ส่งบ่อยพอ ไม่ใช่ทุก frame) */
export function HUD(props: HUDProps) {
  const pauseHandler = props.status === "paused" ? props.onResume : props.onPause;
  const pauseLabel = props.status === "paused" ? "Resume" : "Pause";

  return (
    <div className="hud" aria-live="polite">
      <div className="hud-stat">
        <span className="hud-label">Score</span>
        <span className="hud-value">{props.score}</span>
      </div>
      <div className="hud-stat">
        <span className="hud-label">Lives</span>
        <span className="hud-value">{props.lives}</span>
      </div>
      {(props.status === "playing" || props.status === "paused") && (
        <button type="button" className="btn btn-small" onClick={pauseHandler}>
          {pauseLabel}
        </button>
      )}
    </div>
  );
}