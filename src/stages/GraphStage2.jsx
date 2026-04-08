import { useMemo, useRef, useEffect } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { jacobiEigenN } from "../math/pca.js";
import { Callout } from "../components/ui/primitives.jsx";

const N              = 10;
const NODE_R         = 18;
const CANVAS_H       = 380;
const ZERO_THRESHOLD = 1e-4;

const RED   = "#E85D24";
const BLUE  = "#4F8CFF";
const GOLD  = "#fb9d07";
const GREEN = "#1D9E75";

const PALETTE = [BLUE, GOLD, GREEN, RED, "#9546b4", "#f07ad0", "#F1C40F", "#1ABC9C", "#E67E22", "#95A5A6"];

// ── KaTeX helpers ─────────────────────────────────────────────────────────────

function InlineMath({ children }) {
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(children, { throwOnError: false }) }} />;
}

function MathBlock({ label, latex }) {
  const html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
  return (
    <div style={{
      background: "var(--metric-bg)", border: "0.5px solid var(--border)",
      borderRadius: 10, padding: "10px 16px", margin: "8px 0",
      fontSize: 16, lineHeight: 1.8,
      color: "var(--text-primary)", overflowX: "auto", textAlign: "center",
    }}>
      {label && <div style={{ fontSize: 15, color: "var(--text-muted)", fontFamily: "system-ui", marginBottom: 4, textAlign: "left" }}>{label}</div>}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

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

  const order = rawEvals.map((_, i) => i).sort((a, b) => rawEvals[a] - rawEvals[b]);
  const eigenvalues  = order.map((i) => Math.max(0, rawEvals[i]));
  const eigenvectors = order.map((i) => rawEvecs[i]);

  const k = Math.max(1, eigenvalues.filter((v) => v < ZERO_THRESHOLD).length);

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

    edges.forEach(([a, b]) => {
      const p1 = px[a], p2 = px[b];
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)";
      ctx.lineWidth = 2; ctx.stroke();
    });

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

// ── KaTeX matrix renderer ─────────────────────────────────────────────────────

function KatexMatrixFull({ mat, eigenvalues, isDark }) {
  // mat is N×N. Highlight cells where eigenvalues[col] < ZERO_THRESHOLD
  const zero  = isDark ? "#666" : "#aaa";
  const rows = mat.map((row, _ri) =>
    row.map((v, ci) => {
      const isZeroEig = eigenvalues[ci] < ZERO_THRESHOLD;
      const val = Math.abs(v) < 1e-9 ? 0 : parseFloat(v.toFixed(3));
      const str = val === 0
        ? `\\textcolor{${zero}}{\\phantom{-}0}`
        : isZeroEig
        ? `\\textcolor{${RED}}{${val < 0 ? val : `\\phantom{-}${val}`}}`
        : `${val < 0 ? val : `\\phantom{-}${val}`}`;
      return str;
    }).join(" & ")
  ).join(" \\\\ ");
  const latex = `\\begin{bmatrix} ${rows} \\end{bmatrix}`;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ fontSize: 13 }}
        dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { throwOnError: false, displayMode: true }) }}
      />
    </div>
  );
}

function KatexDiagMatrix({ eigenvalues, isDark }) {
  const zero = isDark ? "#666" : "#aaa";
  const n = eigenvalues.length;
  const rows = eigenvalues.map((v, i) =>
    eigenvalues.map((_n, j) => {
      if (i !== j) return `\\textcolor{${zero}}{0}`;
      const isZero = v < ZERO_THRESHOLD;
      const val = parseFloat(v.toFixed(4));
      return isZero
        ? `\\textcolor{${RED}}{${val}}`
        : `${val}`;
    }).join(" & ")
  ).join(" \\\\ ");
  const latex = `\\begin{bmatrix} ${rows} \\end{bmatrix}`;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ fontSize: 13 }}
        dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { throwOnError: false, displayMode: true }) }}
      />
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function GraphStage2({ isDark, graph, goToGraph1, goToGraph3 }) {
  const { eigenvalues, eigenvectors, k, clusterOf } = useMemo(
    () => computeClusters(graph),
    [graph]
  );

  const clusterColors = Array.from(
    { length: k },
    (_, i) => PALETTE[i % PALETTE.length]
  );

  // Only the k zero-eigenvectors shown in the cluster membership table
  const zeroEvecs = eigenvectors.slice(0, k);

  // V matrix: rows = nodes, columns = eigenvectors (eigenvectors[col][row])
  const V = Array.from({ length: N }, (_, ni) =>
    eigenvectors.map((evec) => evec[ni])
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
      <p style={{ marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
        The eigenvalues of the graph Laplacian <strong>L = D − A</strong> reveal cluster structure.
        The number of eigenvalues equal to 0 equals the number of{" "}
        <em>connected components</em> in the graph — each component is a cluster.
      </p>

      {/* ── Section 1: Eigendecomposition equation ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}><h3>Eigendecomposition of L</h3></div>
        <MathBlock latex={
          `Lv_1 = \\lambda_1 v_1 \\\\` +
          `Lv_2 = \\lambda_2 v_2 \\\\` +
          `\\vdots \\\\` +
          `Lv_N = \\lambda_N v_N \\\\[6pt]` +
          `L\\begin{bmatrix}v_1 & v_2 & \\cdots & v_N\\end{bmatrix} = \\begin{bmatrix}v_1 & v_2 & \\cdots & v_N\\end{bmatrix}\\begin{bmatrix}\\lambda_1 & 0 & 0 \\\\ 0 & \\ddots & 0 \\\\ 0 & 0 & \\lambda_N\\end{bmatrix} \\\\[6pt]` +
          `\\boxed{LV = V\\Lambda}`
        } />

        {/* Two-column explanation */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
          <div style={{
            background: isDark ? "rgba(79,140,255,0.07)" : "rgba(79,140,255,0.05)",
            border: `0.5px solid ${BLUE}`, borderRadius: 8, padding: "10px 14px", fontSize: 15,
          }}>
            <span style={{ color: BLUE, fontWeight: 600 }}><InlineMath>{"V"}</InlineMath></span>
            {" — eigenvector matrix ("}
            <InlineMath>{"N \\times N"}</InlineMath>
            {"). Each column "}
            <InlineMath>{"v_i"}</InlineMath>
            {" is an eigenvector of "}
            <InlineMath>{"L"}</InlineMath>
            {"."}
          </div>
          <div style={{
            background: isDark ? "rgba(232,93,36,0.07)" : "rgba(232,93,36,0.05)",
            border: `0.5px solid ${RED}`, borderRadius: 8, padding: "10px 14px", fontSize: 15,
          }}>
            <span style={{ color: RED, fontWeight: 600 }}><InlineMath>{"\\Lambda"}</InlineMath></span>
            {" — diagonal matrix ("}
            <InlineMath>{"N \\times N"}</InlineMath>
            {"). Each diagonal entry "}
            <InlineMath>{"\\lambda_i"}</InlineMath>
            {" is the corresponding eigenvalue."}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden", marginTop: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ fontSize: 14, color: "var(--text-muted)", padding: "10px 14px" }}>
          Nodes coloured by cluster membership
        </div>
        <GraphCanvas nodes={graph.nodes} edges={graph.edges} clusterOf={clusterOf} isDark={isDark} />
      </div>

      {/* Callout */}
      <Callout borderColor={RED} bg={isDark ? "rgba(232,93,36,0.09)" : "rgba(232,93,36,0.06)"}>
        <strong style={{ color: RED }}>
          {k} eigenvalue{k !== 1 ? "s" : ""} = 0
        </strong>
        {" → "}
        <strong>{k} cluster{k !== 1 ? "s" : ""} detected.</strong>
        {"  "}
        {k === 1
          ? "The graph is fully connected — all nodes belong to a single cluster."
          : <>
              The graph has <strong>{k}</strong> disconnected component{k !== 1 ? "s" : ""}. <br />
              Nodes are coloured by component:{" "} <br />
              {clusterColors.map((c, i) => (
                <span key={i} style={{ marginRight: 8 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, background: c, borderRadius: 2, marginRight: 3, verticalAlign: "middle" }} />
                  Cluster {i + 1}
                </span>
              ))}
            </>}
      </Callout>
      <br />

      {/* ── Section 2: Computed Λ matrix ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          <h3>Computed <InlineMath>{"\\Lambda"}</InlineMath> (eigenvalue matrix)</h3>
        </div>
        <div style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 10 }}>
          Diagonal entries are the eigenvalues{" "}
          <InlineMath>{"\\lambda_1 \\leq \\lambda_2 \\leq \\cdots \\leq \\lambda_N"}</InlineMath>
          {" "}sorted ascending.{" "}
          <span style={{ color: RED }}>Red</span> entries indicate <InlineMath>{"\\lambda = 0"}</InlineMath> (cluster boundaries).
        </div>
        <KatexDiagMatrix eigenvalues={eigenvalues} isDark={isDark} />

        {/* Flat eigenvalue row */}
        <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 15, width: "100%" }}>
            <thead>
              <tr>
                {eigenvalues.map((_, i) => (
                  <th key={i} style={{
                    padding: "4px 8px", borderBottom: "0.5px solid var(--border)",
                    color: eigenvalues[i] < ZERO_THRESHOLD ? RED : "var(--text-muted)",
                    fontWeight: 600, textAlign: "center",
                  }}>
                    <InlineMath>{`\\lambda_{${i + 1}}`}</InlineMath>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {eigenvalues.map((v, i) => (
                  <td key={i} style={{
                    padding: "6px 8px", textAlign: "center", fontFamily: "KaTeX_Main, serif",
                    fontWeight: v < ZERO_THRESHOLD ? 600 : 400,
                    color: v < ZERO_THRESHOLD ? RED : "var(--text-primary)",
                    background: v < ZERO_THRESHOLD
                      ? (isDark ? "rgba(232,93,36,0.1)" : "rgba(232,93,36,0.06)")
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

      {/* ── Section 3: Computed V matrix ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          <h3>Computed <InlineMath>{"V"}</InlineMath> (eigenvector matrix)</h3>
        </div>
        <div style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 10 }}>
          Eigenvectors in <span style={{ color: RED }}>red</span> are the eigenvectors corresponding to zero eigenvalues <InlineMath>{"(\\lambda = 0)"}</InlineMath>{" "}.
          Members in the same cluster share the same row vector values formed by these eigenvectors.
        </div>
        <KatexMatrixFull mat={V} eigenvalues={eigenvalues} isDark={isDark} />
      </div>

      {/* ── Cluster membership (zero-eigenvectors) ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          <h3>Zero-eigenvalue eigenvectors — cluster membership</h3>
        </div>
        <div style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 10 }}>
          We compare the row vectors of the eigenvectors corresponding to zero eigenvalues. <br />
          Each row is a node. Rows with the same background colour belong to the same cluster.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 14, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ padding: "5px 10px", borderBottom: "0.5px solid var(--border)", color: "var(--text-muted)", textAlign: "center", fontWeight: 600 }}>
                  Node
                </th>
                {zeroEvecs.map((_, ci) => (
                  <th key={ci} style={{
                    padding: "5px 10px", borderBottom: "0.5px solid var(--border)",
                    fontWeight: 600, textAlign: "center",
                  }}>
                    <InlineMath>{`v_{${ci + 1}} (\\lambda = 0)`}</InlineMath>
                  </th>
                ))}
                <th style={{ padding: "5px 10px", borderBottom: "0.5px solid var(--border)", color: "var(--text-muted)", textAlign: "center", fontWeight: 600 }}>
                  Cluster
                </th>
              </tr>
            </thead>
            <tbody>
              {graph.nodes.map(({ id }, ni) => {
                const cluster = clusterOf[ni];
                const color   = clusterColors[cluster];
                const bg      = isDark ? `${color}22` : `${color}18`;
                return (
                  <tr key={id} style={{ background: bg }}>
                    <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 600 }}>{id}</td>
                    {zeroEvecs.map((evec, ci) => (
                      <td key={ci} style={{
                        padding: "6px 10px", textAlign: "center",
                        color: Math.abs(evec[ni]) > ZERO_THRESHOLD ? "var(--text-primary)" : "var(--text-muted)",
                      }}>
                        {evec[ni].toFixed(4)}
                      </td>
                    ))}
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600, color }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, background: color, borderRadius: 2 }} />
                        {cluster + 1}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
        <button onClick={() => { goToGraph1(); window.scrollTo({ top: 0, behavior: "instant" }); }} style={{ fontSize: 14, padding: "8px 18px" }}>
          ← Build a Graph
        </button>
        <button className="btn-primary" onClick={() => { goToGraph3(); window.scrollTo({ top: 0, behavior: "instant" }); }} style={{ fontSize: 14, padding: "8px 18px" }}>
          Next: Infection Spread →
        </button>
      </div>
    </div>
  );
}
