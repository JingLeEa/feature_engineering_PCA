import { useState } from "react";
import { useDarkMode } from "./hooks/useDarkMode.js";
import DarkModeToggle from "./components/ui/DarkModeToggle.jsx";
import Stage1Intuition from "./stages/Stage1Intuition.jsx";
import Stage2StepByStep from "./stages/Stage2StepByStep.jsx";

const NAV_ITEMS = [
  { id: "stage1", label: "1. Intuition" },
  { id: "stage2", label: "2. PCA step by step" },
];

export default function App() {
  const { isDark, toggle } = useDarkMode();
  const [page, setPage] = useState("stage1");

  return (
    <>
      <DarkModeToggle isDark={isDark} onToggle={toggle} />

      {/* Top nav */}
      <nav style={{
        borderBottom: "0.5px solid var(--border)",
        display: "flex",
        marginTop: "0.5rem",
        paddingLeft: "1.5rem",
        overflowX: "auto",
        alignItems: "center", // important for vertical alignment
        gap: "0.5rem",        // spacing between logo + tabs
      }}
      >
        {/* Logo / Title */}
        <div style={{
          fontWeight: 600,
          fontSize: 15,
          color: "var(--text-primary)",
          marginRight: "0.5rem",
          whiteSpace: "nowrap",
        }}
        >
          PCA Lab
        </div>

        {/* Existing nav buttons (UNCHANGED) */}
        {NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            style={{
              padding: "14px",
              fontSize: 13,
              background: "transparent",
              border: "none",
              borderBottom:
                page === id
                  ? "2px solid var(--text-primary)"
                  : "2px solid transparent",
              color:
                page === id
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: page === id ? 500 : 400,
              whiteSpace: "nowrap",
              borderRadius: 0,
              transition: "color 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Page content */}
      {page === "stage1" && (
        <Stage1Intuition
          isDark={isDark}
          goToStage2={() => setPage("stage2")}
        />
      )}
      {page === "stage2" && (
        <Stage2StepByStep
          isDark={isDark}
          goToStage1={() => setPage("stage1")}
        />
      )}
    </>
  );
}
