import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

function InlineMath({ children }) {
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(children, { throwOnError: false }) }} />;
}

const N              = 10;
const NODE_R         = 18;
const CANVAS_H       = 460;
const INF_THRESHOLD  = 1e-6;
const REACH_WARN     = 2;
const MAX_STEPS      = 10;

const GREY = "#9ca3af";

// Red (source) → Yellow (mid) → Green (furthest)
function distColor(dist, maxDist) {
  if (dist === null) return GREY;
  if (maxDist === 0) return "#c0392b";
  const t = dist / maxDist; // 0 = source, 1 = furthest
  let r, g, b;
  if (t < 0.5) {
    // Red #c0392b → Yellow #f1c40f
    const s = t / 0.5;
    r = Math.round(192 + s * (241 - 192));
    g = Math.round(57  + s * (196 - 57));
    b = Math.round(43  + s * (15  - 43));
  } else {
    // Yellow #f1c40f → Green #27ae60
    const s = (t - 0.5) / 0.5;
    r = Math.round(241 + s * (39  - 241));
    g = Math.round(196 + s * (174 - 196));
    b = Math.round(15  + s * (96  - 15));
  }
  return `rgb(${r},${g},${b})`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildLaplacian(edges) {
  const A = Array.from({ length: N }, () => Array(N).fill(0));
  const deg = Array(N).fill(0);
  edges.forEach(([a, b]) => {
    A[a - 1][b - 1] = 1; A[b - 1][a - 1] = 1;
    deg[a - 1]++; deg[b - 1]++;
  });
  return A.map((row, i) => row.map((v, j) => (i === j ? deg[i] : -v)));
}

function matVec(M, v) {
  return M.map(row => row.reduce((s, m, j) => s + m * v[j], 0));
}

// BFS distances from startIdx; unreachable nodes → null
function bfsDistances(edges, startIdx) {
  const dist = Array(N).fill(null);
  dist[startIdx] = 0;
  const queue = [startIdx];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [a, b] of edges) {
      const ai = a - 1, bi = b - 1;
      if (ai === cur && dist[bi] === null) { dist[bi] = dist[cur] + 1; queue.push(bi); }
      if (bi === cur && dist[ai] === null) { dist[ai] = dist[cur] + 1; queue.push(ai); }
    }
  }
  return dist;
}

function reachableCount(dist) {
  return dist.filter(d => d !== null && d > 0).length;
}

// ── main component ─────────────────────────────────────────────────────────────

export default function GraphStage3({ isDark, graph, goToGraph1, goToGraph2 }) {
  const [sourceIdx, setSourceIdx] = useState(null);
  const [step,      setStep]      = useState(0);
  const [vec,       setVec]       = useState(null); // L^k · e_source
  const canvasRef = useRef(null);

  const L = useMemo(() => buildLaplacian(graph.edges), [graph.edges]);

  // BFS distances from source
  const distances = useMemo(
    () => sourceIdx === null ? null : bfsDistances(graph.edges, sourceIdx),
    [sourceIdx, graph.edges]
  );

  const maxDist = useMemo(
    () => distances ? Math.max(0, ...distances.filter(d => d !== null)) : 0,
    [distances]
  );

  const reachable = useMemo(
    () => distances ? reachableCount(distances) : null,
    [distances]
  );

  // Infected set: nodes with |vec[i]| > threshold
  const infected = useMemo(() => {
    if (!vec) return new Set();
    return new Set(vec.reduce((acc, v, i) => {
      if (Math.abs(v) > INF_THRESHOLD) acc.push(i);
      return acc;
    }, []));
  }, [vec]);

  function selectSource(ni) {
    const x0 = Array(N).fill(0);
    x0[ni] = 1;
    setSourceIdx(ni);
    setStep(0);
    setVec(x0);
  }

  function nextStep() {
    if (!vec || step >= MAX_STEPS) return;
    setVec(v => matVec(L, v));
    setStep(s => s + 1);
  }

  function reset() {
    setSourceIdx(null);
    setStep(0);
    setVec(null);
  }

  // ── canvas draw ──────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 700;
    const h = canvas.clientHeight || CANVAS_H;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDark ? "#1a1a1a" : "#f8f8f8";
    ctx.fillRect(0, 0, w, h);

    const px = {};
    graph.nodes.forEach(n => { px[n.id] = { x: n.nx * w, y: n.ny * h }; });

    // Edges
    graph.edges.forEach(([a, b]) => {
      const p1 = px[a], p2 = px[b];
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2; ctx.stroke();
    });

    const maxAbs = vec ? Math.max(...vec.map(Math.abs), 1e-9) : 1;

    // Nodes
    graph.nodes.forEach(({ id }, ni) => {
      const { x, y } = px[id];
      const dist  = distances ? distances[ni] : null;
      const isInf = infected.has(ni);
      const color = isInf ? distColor(dist, maxDist) : GREY;
      const isSource = ni === sourceIdx;
      const r = isSource ? NODE_R + 3 : NODE_R;

      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle   = color;
      ctx.strokeStyle = isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.12)";
      ctx.lineWidth   = isSource ? 3 : 2;
      ctx.fill(); ctx.stroke();

      ctx.fillStyle    = "#fff";
      ctx.font         = "bold 13px system-ui";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(id), x, y);

      // Influence value beside node
      if (vec) {
        const raw  = vec[ni];
        const norm = raw / maxAbs;
        const str  = Math.abs(raw) < 1e-9 ? "0" : raw.toFixed(3);

        const barW = 36, barH = 6;
        const bx   = x + r + 6;
        const by   = y - barH / 2;

        ctx.fillStyle   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle   = color === GREY ? "rgba(156,163,175,0.6)" : color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(bx, by, Math.abs(norm) * barW, barH);
        ctx.globalAlpha = 1;

        ctx.fillStyle    = isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.55)";
        ctx.font         = "10px monospace";
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(str, bx + barW + 4, y);
      }
    });
  }, [graph, vec, infected, distances, maxDist, sourceIdx, isDark]);

  useEffect(() => { draw(); }, [draw]);

  function onCanvasClick(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w  = canvas.clientWidth;
    const h  = canvas.clientHeight;
    for (let i = 0; i < graph.nodes.length; i++) {
      const n = graph.nodes[i];
      const x = n.nx * w, y = n.ny * h;
      if (Math.hypot(mx - x, my - y) <= NODE_R + 6) {
        selectSource(i);
        return;
      }
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

      {/* Badge */}
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--text-muted)", background: "var(--surface)",
        border: "0.5px solid var(--border)", borderRadius: 20,
        padding: "3px 10px", display: "inline-block", marginBottom: "0.75rem",
      }}>
        Graph Lab — Stage 3
      </div>

      <h1 style={{ marginBottom: "0.4rem" }}>Infection Spread</h1>
      <p style={{ marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
        Select a starting node to infect it. At each step the influence vector{" "}
        <InlineMath>{"\\mathbf{x}"}</InlineMath> is multiplied by the graph Laplacian:{" "}
        <InlineMath>{"\\mathbf{x} \\leftarrow L \\cdot \\mathbf{x}"}</InlineMath>.
        Nodes with a non-zero component are considered reached by the spread.
        The colour fades from deep red (source) to green (further away).
      </p>

      {/* Instruction banner */}
      {sourceIdx === null && (
        <div style={{
          background: isDark ? "rgba(79,140,255,0.1)" : "rgba(79,140,255,0.07)",
          padding: "10px 14px", marginBottom: "1rem",
          fontSize: 14, color: isDark ? "#93bcff" : "#2a5cbf",
        }}>
          Click any node in the graph below to select it as the infection source.
        </div>
      )}

      {/* Reach warning */}
      {sourceIdx !== null && reachable !== null && reachable <= REACH_WARN && (
        <div style={{
          background: isDark ? "rgba(251,157,7,0.12)" : "rgba(251,157,7,0.1)",
          border: "0.5px solid #fb9d07", borderRadius: 10,
          padding: "10px 14px", marginBottom: "1rem",
          fontSize: 14, color: isDark ? "#fbcc6a" : "#7a5200",
        }}>
          ⚠️ The selected node can only reach <strong>{reachable}</strong> other node{reachable !== 1 ? "s" : ""}.
          Try{" "}
          <button
            onClick={goToGraph1}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              color: isDark ? "#fbcc6a" : "#7a5200",
              fontWeight: 600, textDecoration: "underline", fontSize: "inherit",
              fontFamily: "inherit",
            }}
          >
            adding more edges
          </button>
          {" "}to see the spread travel further!
        </div>
      )}

      {/* Step limit notice */}
      {step >= MAX_STEPS && (
        <div style={{
          background: isDark ? "rgba(232, 188, 172, 0.1)" : "rgba(255, 155, 146, 0.1)",
          border: "0.5px solid #f69999", borderRadius: 10,
          padding: "10px 14px", marginBottom: "1rem",
          fontSize: 14, color: "var(--text-muted)",
        }}>
          Maximum of {MAX_STEPS} steps reached. Reset to start again.
        </div>
      )}

      {/* Canvas */}
      <div style={{
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, overflow: "hidden", marginBottom: "1rem",
      }}>
        <div style={{ fontSize: 14, color: "var(--text-muted)", padding: "10px 14px" }}>
          {sourceIdx === null
            ? "Click a node to begin"
            : <>Source: Node {graph.nodes[sourceIdx]?.id} · Step <InlineMath>{"k = " + step}</InlineMath></>}
        </div>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: CANVAS_H, cursor: "pointer" }}
          onClick={onCanvasClick}
        />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "1.5rem" }}>
        <button
          className="btn-primary"
          onClick={nextStep}
          disabled={sourceIdx === null || step == MAX_STEPS}
          style={{ fontSize: 14, padding: "8px 20px" }}
        >
          Next Step →
        </button>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
          {sourceIdx !== null
            ? <><InlineMath>{"k = " + step}</InlineMath></>
            : "Select a node first"}
        </span>
        {sourceIdx !== null && (
          <button onClick={reset} style={{ marginLeft: "auto", fontSize: 14, padding: "8px 14px" }}>
            Reset
          </button>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: "1.5rem", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Colour scale:</span>
        {/* Gradient swatch */}
        <span style={{
          display: "inline-block", width: 80, height: 12, borderRadius: 3,
          background: "linear-gradient(to right, #c0392b, #f1c40f, #27ae60)",
        }} />
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>source (red) → mid (yellow) → furthest (green)</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--text-secondary)" }}>
          <span style={{ display: "inline-block", width: 12, height: 12, background: GREY, borderRadius: 3 }} />
          Uninfected
        </span>
      </div>

      {/* Influence vector table */}
      {vec && (
        <div style={{
          background: "var(--surface)", border: "0.5px solid var(--border)",
          borderRadius: 12, padding: "1rem 1.5rem", marginBottom: "1.5rem",
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            Influence vector{" "}
            <InlineMath>
              {"\\mathbf{x}_{" + step + "} = L^{" + step + "} \\cdot \\mathbf{e}_{" + (graph.nodes[sourceIdx]?.id ?? "") + "}"}
            </InlineMath>
          </div>
          <div style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 8 }}>
            <InlineMath>{"\\mathbf{e}_i"}</InlineMath> represents the initial state of the system where only node <InlineMath>{"i"}</InlineMath> is "active".{" "}
            A non-zero value in <InlineMath>{"\\mathbf{x}[i]"}</InlineMath> means node <InlineMath>{"i"}</InlineMath> has been reached by the spread.
          </div>

          {/* Initial e-vector display */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            fontFamily: "KaTeX_Main, serif", fontSize: 15,
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            border: "0.5px solid var(--border)", borderRadius: 8,
            padding: "8px 14px", marginBottom: 12,
          }}>
            <span style={{ color: "var(--text-muted)", marginRight: 4 }}>
              <InlineMath>{"\\mathbf{e}_{" + (graph.nodes[sourceIdx]?.id ?? "") + "} ="}</InlineMath>
            </span>
            <span style={{ color: "var(--text-muted)" }}>[</span>
            {graph.nodes.map(({ id }, ni) => {
              const isOne = ni === sourceIdx;
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center" }}>
                  <span style={{
                    color: isOne ? "#c0392b" : "var(--text-muted)",
                    fontWeight: isOne ? 700 : 400,
                    background: isOne ? (isDark ? "rgba(251,157,7,0.15)" : "rgba(251,157,7,0.12)") : "transparent",
                    borderRadius: 3, padding: isOne ? "0 3px" : "0",
                  }}>
                    {isOne ? "1" : "0"}
                  </span>
                  {ni < graph.nodes.length - 1 && (
                    <span style={{ color: "var(--text-muted)", marginLeft: 2, marginRight: 2 }}>,</span>
                  )}
                </span>
              );
            })}
            <span style={{ color: "var(--text-muted)" }}>]</span>
            <span style={{ color: "var(--text-muted)", fontSize: 16, lineHeight: 1, alignSelf: "flex-end", marginBottom: -2 }}><InlineMath>^T</InlineMath></span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 14, width: "100%" }}>
              <thead>
                <tr>
                  {[
                    { label: "Node",    align: "center" },
                    { label: <InlineMath>{"\\mathbf{x}_k[i]"}</InlineMath>, align: "left" },
                    { label: "Steps from source", align: "left" },
                    { label: "Status",  align: "left" },
                  ].map(({ label, align }, i) => (
                    <th key={i} style={{
                      padding: "5px 10px", borderBottom: "0.5px solid var(--border)",
                      color: "var(--text-muted)", fontWeight: 600, textAlign: align,
                    }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {graph.nodes.map(({ id }, ni) => {
                  const dist    = distances ? distances[ni] : null;
                  const isInf   = infected.has(ni);
                  const color   = isInf ? distColor(dist, maxDist) : GREY;
                  const bgAlpha = isDark ? "28" : "18";
                  const bg      = isInf
                    ? `${color}${bgAlpha}`
                    : "transparent";

                  const statusLabel = ni === sourceIdx ? "Source"
                    : isInf ? "Reached"
                    : "Uninfected";

                  return (
                    <tr key={id} style={{ background: bg, borderBottom: "0.5px solid var(--border)" }}>
                      <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 600 }}>{id}</td>
                      <td style={{ padding: "6px 10px" }}>
                        {vec[ni].toFixed(6)}
                      </td>
                      <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--text-secondary)" }}>
                        {dist === null ? "—" : dist}
                      </td>
                      <td style={{ padding: "6px 10px" }}>
                        <span style={{ color, fontWeight: 500 }}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
        <button onClick={goToGraph2} style={{ fontSize: 14, padding: "8px 18px" }}>
          ← Spectral Clustering
        </button>
      </div>
    </div>
  );
}
