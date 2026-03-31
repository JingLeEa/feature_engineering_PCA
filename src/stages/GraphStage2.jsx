import { useMemo, useRef, useEffect } from "react";
import { jacobiEigenN } from "../math/pca.js";
import { Callout } from "../components/ui/primitives.jsx";

const N              = 10;
const NODE_R         = 18;
const CANVAS_H       = 380;
const CHART_H        = 220;
const ZERO_THRESHOLD = 1e-4;

const RED   = "#E85D24";
const BLUE  = "#4F8CFF";
const GOLD  = "#fb9d07";
const GREEN = "#1D9E75";

const PALETTE = [BLUE, GOLD, GREEN, RED, "#9B59B6", "#E74C3C", "#F1C40F", "#1ABC9C", "#E67E22", "#95A5A6"];

// ── helpers ───────────────────────────────────────────────────────────────────

function buildLaplacian(edges) {
  const A = Array.from({ length: N }, () => Array(N).fill(0));
  const deg = Array(N).fill(0);
  edges.forEach(([a, b]) => {
    A[a - 1][b - 1] = 1;
    A[b - 1][a - 1] = 1;
    deg[a - 1]++;
    deg[b - 1]++;
  });
  return A.map((row, i) => row.map((v, j) => (i === j ? deg[i] : -v)));
}

function computeClusters(graph) {
  const L = buildLaplacian(graph.edges);
  const { eigenvalues: rawEvals, eigenvectors: rawEvecs } = jacobiEigenN(L);

  // Sort ascending, clamp float noise below zero
  const order = rawEvals.map((_, i) => i).sort((a, b) => rawEvals[a] - rawEvals[b]);
  const eigenvalues  = order.map((i) => Math.max(0, rawEvals[i]));
  const eigenvectors = order.map((i) => rawEvecs[i]);

  const k = Math.max(1, eigenvalues.filter((v) => v < ZERO_THRESHOLD).length);

  // Cluster assignment: for each node, which of the k zero-eigenvectors
  // has the largest absolute component?
  const clusterOf = graph.nodes.map((_, ni) => {
    if (k === 1) return 0;
    let best = 0, bestAbs = -1;
    for (let c = 0; c < k; c++) {
      const abs = Math.abs(eigenvectors[c][ni]);
      if (abs > bestAbs) { bestAbs = abs; best = c; }
    }
    return best;
  });

  return { eigenvalues, eigenvectors, k, clusterOf };
}

// ── sub-components ────────────────────────────────────────────────────────────

function GraphCanvas({ nodes, edges, clusterOf, isDark }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 560;
    const h = canvas.clientHeight || CANVAS_H;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDark ? "#1a1a1a" : "#f8f8f8";
    ctx.fillRect(0, 0, w, h);

    const px = {};
    nodes.forEach((n) => { px[n.id] = { x: n.nx * w, y: n.ny * h }; });

    // Edges
    edges.forEach(([a, b]) => {
      const p1 = px[a], p2 = px[b];
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)";
      ctx.lineWidth = 2; ctx.stroke();
    });

    // Nodes
    nodes.forEach(({ id }, ni) => {
      const { x, y } = px[id];
      const color = PALETTE[clusterOf[ni] % PALETTE.length];
      ctx.beginPath(); ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
      ctx.fillStyle   = color;
      ctx.strokeStyle = isDark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.12)";
      ctx.lineWidth   = 2;
      ctx.fill(); ctx.stroke();
      ctx.fillStyle    = "#fff";
      ctx.font         = "bold 13px system-ui";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(id), x, y);
    });
  }, [nodes, edges, clusterOf, isDark]);

  return <canvas ref={ref} style={{ display: "block", width: "100%", height: CANVAS_H }} />;
}

function EigenChart({ eigenvalues, isDark }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 400;
    const h = canvas.clientHeight || CHART_H;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 16, bottom: 36, left: 10, right: 10 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const maxVal = Math.max(...eigenvalues, 1);
    const barW   = chartW / eigenvalues.length;

    eigenvalues.forEach((val, i) => {
      const isZero = val < ZERO_THRESHOLD;
      const barH   = (val / maxVal) * chartH;
      const bx = pad.left + i * barW + barW * 0.12;
      const bw = barW * 0.76;
      const by = pad.top + chartH - barH;

      ctx.fillStyle   = isZero ? RED : BLUE;
      ctx.globalAlpha = isZero ? 1 : 0.65;
      ctx.fillRect(bx, by, bw, Math.max(barH, 2));
      ctx.globalAlpha = 1;

      // Index label below
      ctx.fillStyle    = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";
      ctx.font         = "11px system-ui";
      ctx.textAlign    = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(i + 1), bx + bw / 2, pad.top + chartH + 5);

      // Value above bar (if tall enough)
      if (barH > 16) {
        ctx.fillStyle    = "#fff";
        ctx.textBaseline = "top";
        ctx.fillText(val.toFixed(2), bx + bw / 2, by + 3);
      }
    });

    // Axes
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.stroke();

    // "eigenvalue index" label
    ctx.fillStyle    = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)";
    ctx.font         = "11px system-ui";
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("eigenvalue index", pad.left + chartW / 2, h);
  }, [eigenvalues, isDark]);

  return <canvas ref={ref} style={{ display: "block", width: "100%", height: CHART_H }} />;
}

// ── main component ─────────────────────────────────────────────────────────────

export default function GraphStage2({ isDark, graph }) {
  const { eigenvalues, k, clusterOf } = useMemo(
    () => computeClusters(graph),
    [graph]
  );

  const clusterColors = Array.from(
    { length: k },
    (_, i) => PALETTE[i % PALETTE.length]
  );

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--text-muted)", background: "var(--surface)",
        border: "0.5px solid var(--border)", borderRadius: 20,
        padding: "3px 10px", display: "inline-block", marginBottom: "0.75rem",
      }}>
        Graph Lab — Stage 2
      </div>
      <h1 style={{ marginBottom: "0.4rem" }}>Spectral Clustering</h1>
      <p style={{ marginBottom: "1.25rem", color: "var(--text-secondary)", maxWidth: 640 }}>
        The eigenvalues of the graph Laplacian <strong>L = D − A</strong> reveal cluster structure.
        The number of eigenvalues equal to 0 equals the number of{" "}
        <em>connected components</em> in the graph — each component is a cluster.
      </p>

      {/* Callout */}
      <Callout borderColor={RED} bg={isDark ? "rgba(232,93,36,0.09)" : "rgba(232,93,36,0.06)"}>
        <strong style={{ color: RED }}>
          {k} eigenvalue{k !== 1 ? "s" : ""} ≈ 0
        </strong>
        {" → "}
        <strong>{k} cluster{k !== 1 ? "s" : ""} detected.</strong>
        {"  "}
        {k === 1
          ? "The graph is fully connected — all nodes belong to a single cluster."
          : <>
              The graph has <strong>{k}</strong> disconnected component{k !== 1 ? "s" : ""}.
              Nodes are coloured by component:{" "}
              {clusterColors.map((c, i) => (
                <span key={i} style={{ marginRight: 8 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, background: c, borderRadius: 2, marginRight: 3, verticalAlign: "middle" }} />
                  Cluster {i + 1}
                </span>
              ))}
            </>}
      </Callout>

      {/* Canvas + Chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", padding: "10px 14px 0" }}>
            Nodes coloured by cluster membership
          </div>
          <GraphCanvas nodes={graph.nodes} edges={graph.edges} clusterOf={clusterOf} isDark={isDark} />
        </div>

        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 14px" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Eigenvalue spectrum of L</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8, display: "flex", gap: 14 }}>
            <span>
              <span style={{ display: "inline-block", width: 10, height: 10, background: RED, borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />
              ≈ 0 (cluster boundary)
            </span>
            <span>
              <span style={{ display: "inline-block", width: 10, height: 10, background: BLUE, borderRadius: 2, marginRight: 4, verticalAlign: "middle", opacity: 0.65 }} />
              &gt; 0
            </span>
          </div>
          <EigenChart eigenvalues={eigenvalues} isDark={isDark} />
        </div>
      </div>

      {/* Eigenvalue table */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.5rem" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Sorted eigenvalues (ascending)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 14, width: "100%" }}>
            <thead>
              <tr>
                {eigenvalues.map((_, i) => (
                  <th key={i} style={{
                    padding: "5px 8px", borderBottom: "0.5px solid var(--border)",
                    color: eigenvalues[i] < ZERO_THRESHOLD ? RED : "var(--text-muted)",
                    fontWeight: 600, textAlign: "center",
                  }}>
                    λ<sub>{i + 1}</sub>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {eigenvalues.map((v, i) => (
                  <td key={i} style={{
                    padding: "7px 8px", textAlign: "center",
                    fontWeight: v < ZERO_THRESHOLD ? 600 : 400,
                    color: v < ZERO_THRESHOLD ? RED : "var(--text-primary)",
                    background: v < ZERO_THRESHOLD
                      ? (isDark ? "rgba(232,93,36,0.09)" : "rgba(232,93,36,0.06)")
                      : "transparent",
                  }}>
                    {v.toFixed(4)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
