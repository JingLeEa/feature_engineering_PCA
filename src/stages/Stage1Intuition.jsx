import { useState } from "react";
import { computePCA2D, generateData2D, projectPoints2D, varianceOf } from "../math/pca.js";
import OriginalSpaceCanvas from "../components/canvas/OriginalSpaceCanvas.jsx";
import ProjectedSpaceCanvas from "../components/canvas/ProjectedSpaceCanvas.jsx";
import Strip1DCanvas from "../components/canvas/Strip1DCanvas.jsx";
import { MetricCard, Callout, VarBar, Divider } from "../components/ui/primitives.jsx";

const GOLD  = "#F5A623";
const BLUE  = "#4F8CFF";
const GREEN = "#1D9E75";
const RED   = "#E85D24";

// Computed once — stable across re-renders
const PTS  = generateData2D(120, 42);
const PCA  = computePCA2D(PTS);
const IDEAL = Math.round(PCA.idealAngle);

export default function Stage1Intuition({ isDark, goToStage2 }) {
  const [angle, setAngle] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const proj   = projectPoints2D(PTS, angle);
  const pc1V   = varianceOf(proj.map((p) => p.pc1));
  const pc1Pct = (pc1V / PCA.totalVar) * 100;
  const diff   = Math.min(Math.abs(angle - IDEAL), 180 - Math.abs(angle - IDEAL));
  const isClose = diff <= 0.5;

  const calloutBorder = isClose ? GREEN : pc1Pct > 70 ? BLUE : "var(--border-strong)";
  const calloutBg = isClose
    ? (isDark ? "rgba(29,158,117,0.08)" : "rgba(29,158,117,0.06)")
    : pc1Pct > 70
    ? (isDark ? "rgba(79,140,255,0.08)" : "rgba(79,140,255,0.06)")
    : "var(--surface)";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

      {/* ── HERO ── */}
      <div style={{
        display: "inline-block", fontSize: 12, fontWeight: 600,
        letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--text-muted)", background: "var(--surface)",
        border: "0.5px solid var(--border)", borderRadius: 20,
        padding: "3px 10px", marginBottom: "0.75rem",
      }}>
        Stage 1 — Intuition
      </div>
      <h1>Principal Component Analysis</h1>
      <p style={{ marginTop: "0.75rem", marginBottom: "2rem" }}>
        <strong>A technique for reducing the number of dimensions in a dataset while keeping as much of the meaningful variation as possible.</strong>
      </p>

      {/* ── WHAT IS PCA ── */}
      <h2>What is PCA?</h2>
      <br />
      <div style={{
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, padding: "1.2rem 1.5rem", marginBottom: "2rem",
      }}>
        <p style={{ margin: 0 }}>
          Real-world datasets often have dozens or hundreds of features. Many of these features
          are <em>correlated</em> - they carry overlapping information. PCA finds a{" "}
          <strong style={{ color: "var(--text-highlighted)" }}>new set of axes</strong>{" "}
          that point in the directions of{" "}
          <strong style={{ color: "var(--text-highlighted)" }}>maximum variation</strong>, letting
          you describe the same data with fewer numbers without losing much information.
        </p>
      </div>

      {/* ── GOAL ── */}
      <h2>The goal</h2>
      <br />
      <Callout
        borderColor={GOLD}
        bg={isDark ? "rgba(245,166,35,0.07)" : "rgba(245,166,35,0.06)"}
      >
        Reduce the dimensionality of large, complex, highly correlated datasets while preserving
        as much <strong>variation</strong> (information) as possible.
      </Callout>

      <div style={{ height: "2rem" }} />

      {/* ── WHY REDUCE ── */}
      <h2>Why reduce dimensions?</h2>
      <br />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "2rem" }}>
        {[
          {
            n: "01", title: "Stop overfitting",
            body: "Too many features relative to training samples causes a model to memorise noise instead of real patterns. Fewer dimensions = simpler model = better generalisation.",
          },
          {
            n: "02", title: "Manage computational load",
            body: "Training time and memory scale with the number of features. Reducing dimensions speeds up training and makes large-scale problems tractable.",
          },
        ].map(({ n, title, body }) => (
          <div key={n} style={{
            background: "var(--surface)", border: "0.5px solid var(--border)",
            borderRadius: 12, padding: "1rem 1.25rem",
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>{n}</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.65 }}>{body}</div>
          </div>
        ))}
      </div>

      <Divider />

      {/* ── INTERACTIVE ── */}
      <h2>2D Example — find the principal component</h2>
      <br />
      <p style={{ marginBottom: "1.25rem" }}>
        Below is a 2D dataset. Drag the slider to rotate the two axes.
        Rotate it such that:
      </p>
      <ul style={{ marginBottom: "1.25rem" }}>
        <li>PC1 captures the <strong>most</strong> variation: the spread of points along the gold PC1 axis is maximised.</li>
        <li>PC2 captures the <strong>least</strong> variation.</li>
      </ul>
      <p style={{ marginBottom: "1.25rem" }}>
        Note: <strong>the data points never move</strong> — only the axes rotate.
        In the right panel the axes are always fixed (PC1 horizontal, PC2 vertical),
        so you see the points shifting as the projection changes.
      </p>

      {/* Dual scatter plots */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", marginBottom: 6 }}>
            Original space — points fixed, axes rotate
          </div>
          <div style={{ height: 250 }}>
            <OriginalSpaceCanvas pts={PTS} angleDeg={angle} isDark={isDark} />
          </div>
        </div>
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", marginBottom: 6 }}>
            Projected space — coordinates in PC frame
          </div>
          <div style={{ height: 250 }}>
            <ProjectedSpaceCanvas pts={PTS} angleDeg={angle} isDark={isDark} />
          </div>
        </div>
      </div>

      {/* Slider */}
      <div style={{
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 10, padding: "10px 16px", marginBottom: "0.75rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Rotate axes</span>
          <input
            type="range" min="0" max="179" step="1" value={angle}
            style={{ flex: 1 }}
            onChange={(e) => { setAngle(parseInt(e.target.value)); setRevealed(false); }}
          />
          <span style={{ fontSize: 14, fontWeight: 500, minWidth: 38, textAlign: "right" }}>{angle}°</span>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: "0.75rem" }}>
        <div style={{
          background: "var(--metric-bg)", border: "0.5px solid var(--border)",
          borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${GOLD}`,
        }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>PC1 variance captured</div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>{pc1V.toFixed(3)}</div>
          <VarBar pct={pc1Pct} color={isClose ? GREEN : GOLD} />
        </div>
        <MetricCard
          label="% of total variance (PC1)"
          value={`${pc1Pct.toFixed(1)}%`}
          sub="at current angle"
          accent={isClose ? GREEN : undefined}
        />
        <MetricCard
          label="Ideal PC1 angle"
          value={revealed ? `${IDEAL}°` : "— °"}
          sub="try to find it!"
        />
      </div>

      {/* Insight callout */}
      <div style={{ marginBottom: "1rem" }}>
        <Callout borderColor={calloutBorder} bg={calloutBg}>
          {isClose
            ? <>You found it! At <strong>{angle}°</strong>, PC1 captures <strong>{pc1Pct.toFixed(1)}%</strong> of the total variance. This direction is the first principal component.</>
            : pc1Pct > 70
            ? <>Getting closer — <strong>{pc1Pct.toFixed(1)}%</strong> variance on PC1. The data has a diagonal elongation; keep rotating.</>
            : <>Rotate the axes. When the gold PC1 axis aligns with the longest direction of the data cloud, the variance meter will peak.</>}
        </Callout>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "0.5rem" }}>
        <button onClick={() => { setAngle(IDEAL); setRevealed(true); }}>Show ideal PC1</button>
        <button onClick={() => { setAngle(0); setRevealed(false); }}>Reset</button>
      </div>

      <br /><br />

      {/* ── WHY MAX VARIANCE ── */}
      <h3>Why choose the direction of maximum variance?</h3>
      <br />
      <p style={{ marginBottom: "1.25rem" }}>
        When projecting data down to fewer dimensions, we must choose which directions to keep.
        The two plots below show what happens when you project the same data onto PC1 vs PC2
        at the ideal angle. The spread of points in the result tells you how much information survives.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {/* PC1 strip */}
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: GOLD, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>Projection onto PC1 — maximum variance ✓</span>
          </div>
          <div style={{ height: 130 }}>
            <Strip1DCanvas pts={PTS} angleDeg={IDEAL} axis="pc1" isDark={isDark} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Callout
              borderColor={GREEN}
              bg={isDark ? "rgba(29,158,117,0.08)" : "rgba(29,158,117,0.06)"}
            >
              Points spread widely. Most distinction between them survives.{" "}
              <strong>{(PCA.pc1Var / PCA.totalVar * 100).toFixed(1)}% of variance retained.</strong>
            </Callout>
          </div>
        </div>

        {/* PC2 strip */}
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: BLUE, flexShrink: 0 }} />
            <span style={{ fontSize: 14 , fontWeight: 500 }}>Projection onto PC2 — minimum variance ✗</span>
          </div>
          <div style={{ height: 130 }}>
            <Strip1DCanvas pts={PTS} angleDeg={IDEAL} axis="pc2" isDark={isDark} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Callout
              borderColor={RED}
              bg={isDark ? "rgba(232,93,36,0.08)" : "rgba(232,93,36,0.06)"}
            >
              Points cluster tightly. Most distinction is destroyed.{" "}
              <strong>Only {(PCA.pc2Var / PCA.totalVar * 100).toFixed(1)}% of variance retained.</strong>
            </Callout>
          </div>
        </div>
      </div>

      <Callout
        borderColor={BLUE}
        bg={isDark ? "rgba(79,140,255,0.08)" : "rgba(79,140,255,0.06)"}
      >
        <strong>Key insight:</strong> Variance measures how spread out the projected points are.
        More spread = more distinction between points = more information preserved.
      </Callout>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: "2.5rem",
        }}
      >
        <button
          onClick={goToStage2}
          className="btn-primary"
        >
          Continue →
        </button>
      </div>

      <br />
      <Divider />

    </div>
  );
}
