import { useCallback, useRef, useState } from "react";
import { ApiClientError, submitScore } from "../api/client";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; playerName: string }
  | { kind: "error"; message: string };

const MAX_NAME_LENGTH = 20;

/**
 * ฟอร์มเสนอให้บันทึกคะแนนเมื่อจบเกม (ชนะ/แพ้)
 *
 * ป้องกันคะแนนซ้ำจาก render ซ้ำ / กดปุ่มซ้ำ / state transition ซ้ำ:
 * - ใช้ `submittedRequestIdRef` กัน submit รอบเดิมซ้ำ — component นี้คืน `completed` ต้องมี id ใหม่
 * - ระหว่าง submitting ปุ่มถูก disable + ref flag กัน double-click
 * - retry ใช้ clientRequestId เดิม → backend dedupe (ไม่ insert ซ้ำ)
 * - แสดงผลลัพธ์จริงเท่านั้น (success/failure) — ไม่แสดง success ล่วงหน้า
 */
export function ScoreSubmit({
  score,
  gameId,
  playerName,
  onPlayerNameChange,
  onCompleted,
}: {
  readonly score: number;
  readonly gameId: string;
  readonly playerName: string;
  readonly onPlayerNameChange: (name: string) => void;
  /** เรียกเมื่อส่งสำเร็จ (หรือได้ confirmation ว่า backend บันทึกแล้ว) — parent โหลด leaderboard ใหม่ */
  readonly onCompleted: () => void;
}) {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [name, setName] = useState(playerName);
  // ป้องกัน submit ซ้ำจากการ re-render / double click
  const submittedRef = useRef(false);
  const inFlightRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (submittedRef.current || inFlightRef.current) return; // ป้องกันซ้ำ
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      setState({ kind: "error", message: `Name must be 1–${MAX_NAME_LENGTH} characters` });
      return;
    }
    inFlightRef.current = true;
    setState({ kind: "submitting" });
    try {
      await submitScore({
        playerName: trimmed,
        score,
        clientRequestId: gameId, // 1 id ต่อ 1 รอบเกม — retry ไม่ insert ซ้ำ
      });
      submittedRef.current = true;
      onPlayerNameChange(trimmed);
      setState({ kind: "success", playerName: trimmed });
      onCompleted();
    } catch (err) {
      // แสดง failure จริง — ไม่แสดง success ล่วงหน้า
      const msg =
        err instanceof ApiClientError
          ? err.message
          : "Failed to submit score";
      setState({ kind: "error", message: msg });
    } finally {
      inFlightRef.current = false;
    }
  }, [name, score, gameId, onPlayerNameChange, onCompleted]);

  return (
    <form
      className="score-submit"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <h3>Submit your score</h3>
      {state.kind === "success" ? (
        <output className="lb-success">
          ✓ Score saved as {state.playerName}
        </output>
      ) : (
        <>
          <label className="lb-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => {
                setName(e.target.value);
                onPlayerNameChange(e.target.value);
              }}
              data-testid="score-name-input"
            />
          </label>
          <p className="lb-score-big">Score: {score}</p>
          {state.kind === "error" && (
            <p className="lb-error" role="alert" data-testid="score-error">
              Failed: {state.message}
            </p>
          )}
          <button
            type="submit"
            disabled={state.kind === "submitting"}
            data-testid="score-submit-button"
          >
            {state.kind === "submitting" ? "Saving…" : "Save score"}
          </button>
        </>
      )}
    </form>
  );
}
