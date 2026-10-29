import { useCallback, useEffect, useRef, useState } from "react";
import type { LeaderboardEntry } from "@pac-man/shared";
import { ApiClientError, fetchLeaderboard } from "../api/client";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; entries: LeaderboardEntry[] }
  | { kind: "error"; message: string };

/**
 * แสดง leaderboard จาก Backend จริง (ไม่ใช่ mock)
 * - โหลดเมื่อ mount + ปุ่ม Retry
 * - มี loading / empty / error / success ครบ
 * - error แยกจากสถานะเกม — เกมยังเล่นได้ถ้า API ล่ม
 *
 * ใช้ key ภายนอก (refreshKey) เพื่อบอกให้โหลดใหม่ เช่น หลังส่งคะแนนสำเร็จ
 */
interface LeaderboardProps {
  readonly refreshKey?: number;
}

export function Leaderboard({ refreshKey = 0 }: LeaderboardProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const requestIdRef = useRef(0); // กันผลลัพธ์เก่ามาทับของใหม่ (race)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState({ kind: "loading" });
    try {
      const entries = await fetchLeaderboard(10);
      if (requestIdRef.current === requestId) {
        setState({ kind: "loaded", entries });
      }
    } catch (err) {
      if (requestIdRef.current === requestId) {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : "Failed to load leaderboard";
        setState({ kind: "error", message: msg });
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="leaderboard" aria-label="Leaderboard">
      <h2>Leaderboard</h2>
      {state.kind === "loading" && <p className="lb-note">Loading…</p>}
      {state.kind === "error" && (
        <div className="lb-error" role="alert">
          <p>Leaderboard unavailable: {state.message}</p>
          <button type="button" onClick={() => void load()} data-testid="lb-retry">
            Retry
          </button>
        </div>
      )}
      {state.kind === "loaded" &&
        (state.entries.length === 0 ? (
          <p className="lb-note">No scores yet — be the first!</p>
        ) : (
          <ol className="lb-list">
            {state.entries.map((e, i) => (
              <li key={e.id} className="lb-row">
                <span className="lb-rank">{i + 1}.</span>
                <span className="lb-name">{e.playerName}</span>
                <span className="lb-score">{e.score}</span>
              </li>
            ))}
          </ol>
        ))}
    </section>
  );
}
