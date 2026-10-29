interface MainMenuProps {
  readonly onPlay: () => void;
}

/** หน้าเริ่มเกม — อธิบายวิธีเล่น + ปุ่ม Play (React UI นอก canvas) */
export function MainMenu({ onPlay }: MainMenuProps) {
  return (
    <section className="main-menu" aria-label="Main menu">
      <h2 className="menu-title">Pac-Man</h2>
      <p className="menu-subtitle">หลบผี เก็บเม็ด ผ่านด่าน</p>

      <div className="controls-help">
        <h3>Controls</h3>
        <ul>
          <li><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> เคลื่อนที่</li>
          <li><kbd>P</kbd> หรือ <kbd>Esc</kbd> หยุด/เล่นต่อ</li>
        </ul>
      </div>

      <button type="button" className="btn-play" onClick={onPlay}>
        Play
      </button>
    </section>
  );
}