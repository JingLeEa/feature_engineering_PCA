/**
 * DarkModeToggle — sun/moon icon button, fixed top-right.
 * Props: isDark (bool), onToggle (fn)
 */
export default function DarkModeToggle({ isDark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        position: "fixed",
        top: 16,
        right: 20,
        zIndex: 100,
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "0.5px solid var(--border-strong)",
        background: "var(--surface)",
        color: "var(--text-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: 17,
        padding: 0,
        // Override base button padding
        lineHeight: 1,
        boxShadow: "0 1px 6px rgba(0,0,0,0.12)",
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      {isDark ? "☀" : "☽"}
    </button>
  );
}
