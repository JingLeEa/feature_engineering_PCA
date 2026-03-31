import { useState } from "react";
import { useDarkMode } from "./hooks/useDarkMode.js";
import DarkModeToggle from "./components/ui/DarkModeToggle.jsx";
import Stage1Intuition from "./stages/Stage1Intuition.jsx";
import Stage2StepByStep from "./stages/Stage2StepByStep.jsx";
import GraphStage1 from "./stages/GraphStage1.jsx";
import { INITIAL_GRAPH } from "./math/graphState.js";
import GraphStage2 from "./stages/GraphStage2.jsx";
import GraphStage3 from "./stages/GraphStage3.jsx";

const PCA_ITEMS   = [
  { id: "stage1",  label: "1. Intuition" },
  { id: "stage2",  label: "2. PCA step by step" },
];
const GRAPH_ITEMS = [
  { id: "graph1",  label: "1. Build a Graph" },
  { id: "graph2",  label: "2. Spectral Clustering" },
  { id: "graph3",  label: "3. Infection Spread" },
];


export default function App() {
  const { isDark, toggle } = useDarkMode();
  const [page, setPage]       = useState("stage1");
  const [graphState, setGraphState] = useState(INITIAL_GRAPH);

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
        gap: "0.25rem",
      }}>
        {/* PCA Lab group */}
        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-primary)", marginRight: "0.25rem", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
          PCA Lab
        </div>
        {PCA_ITEMS.map(({ id, label }) => (
          <button key={id} onClick={() => setPage(id)} style={{
            padding: "14px", fontSize: 15, background: "transparent", border: "none",
            borderBottom: page === id ? "2px solid var(--text-primary)" : "2px solid transparent",
            color: page === id ? "var(--text-primary)" : "var(--text-muted)",
            cursor: "pointer", fontFamily: "inherit", fontWeight: page === id ? 500 : 400,
            whiteSpace: "nowrap", borderRadius: 0, transition: "color 0.15s",
          }}>
            {label}
          </button>
        ))}

        {/* Separator */}
        <div style={{
          alignSelf: "stretch", width: "1px", background: "var(--border-strong)", margin: "10px 15px", flexShrink: 0
        }} />

        {/* Graph Lab group */}
        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-primary)", marginRight: "0.25rem", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
          Graph Lab
        </div>
        {GRAPH_ITEMS.map(({ id, label }) => (
          <button key={id} onClick={() => setPage(id)} style={{
            padding: "14px", fontSize: 15, background: "transparent", border: "none",
            borderBottom: page === id ? "2px solid var(--text-primary)" : "2px solid transparent",
            color: page === id ? "var(--text-primary)" : "var(--text-muted)",
            cursor: "pointer", fontFamily: "inherit", fontWeight: page === id ? 500 : 400,
            whiteSpace: "nowrap", borderRadius: 0, transition: "color 0.15s",
          }}>
            {label}
          </button>
        ))}
      </nav>

      {/* Page content */}
      {page === "stage1" && <Stage1Intuition isDark={isDark} goToStage2={() => setPage("stage2")} />}
      {page === "stage2" && <Stage2StepByStep isDark={isDark} goToStage1={() => setPage("stage1")} />}
      {page === "graph1" && <GraphStage1 isDark={isDark} graph={graphState} setGraph={setGraphState} />}
      {page === "graph2" && <GraphStage2 isDark={isDark} graph={graphState} />}
      {page === "graph3" && <GraphStage3 isDark={isDark} />}
    </>
  );
}
