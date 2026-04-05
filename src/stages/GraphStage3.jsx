import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { jacobiEigenN } from "../math/pca.js";
import { Callout } from "../components/ui/primitives.jsx";

const GOLD = "#fb9d07";
const RED  = "#E85D24";

function InlineMath({ children }) {
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(children, { throwOnError: false }) }} />;
}

function MathBlock({ label, latex }) {
  const html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
  return (
    <div style={{
      background: "var(--metric-bg)", border: "0.5px solid var(--border)",
      borderRadius: 10, padding: "10px 16px", margin: "8px 0",
      fontSize: 16, lineHeight: 1.8, color: "var(--text-primary)",
      overflowX: "auto", textAlign: "center",
    }}>
      {label && <div style={{ fontSize: 14, color: "var(--text-muted)", fontFamily: "system-ui", marginBottom: 4, textAlign: "left" }}>{label}</div>}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
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

  // Sorted eigenvalues of L (ascending, clamped ≥ 0)
  const eigenvalues = useMemo(() => {
    const { eigenvalues: raw } = jacobiEigenN(L);
    return [...raw].sort((a, b) => a - b).map(v => Math.max(0, v));
  }, [L]);

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
        Select a starting node to infect it. At each step k, the state vector is computed as{" "}
        <InlineMath>{"\\mathbf{x_k} = L^k \\cdot \\mathbf{x_0}"}</InlineMath> where{" "}
        <InlineMath>{"\\mathbf{x_0}"}</InlineMath> is the initial vector with 1 at the source node and 0 everywhere else. 
        Nodes with a non-zero component in <InlineMath>{"\\mathbf{x_k}"}</InlineMath> are considered reached by the spread. 
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
              {"\\mathbf{x}_{" + step + "} = L^{" + step + "} \\cdot \\mathbf{x}_0"}
            </InlineMath>
          </div>
          <div style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 8 }}>
            <InlineMath>{"\\mathbf{x}_0"}</InlineMath> represents the initial state of the system where only the source node is "active".{" "}
            A non-zero value in <InlineMath>{"\\mathbf{x}_k[i]"}</InlineMath> means node <InlineMath>{"i"}</InlineMath> has been reached by the spread.
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
              <InlineMath>{"\\mathbf{x}_0 ="}</InlineMath>
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
      
      {/* ── Section 1: Observation callout ── */}
      <Callout borderColor={GOLD} bg={isDark ? "rgba(251,157,7,0.08)" : "rgba(251,157,7,0.06)"}>
        You just watched{" "}
        <InlineMath>{"\\mathbf{x}_k = L^k \\cdot \\mathbf{x}_0"}</InlineMath>
        {" "}computed step by step — each step multiplies the current state by{" "}
        <InlineMath>{"L"}</InlineMath>. This works fine for 10 nodes.
        But what if the graph had <strong>1 million nodes</strong>?
      </Callout>

      {/* ── Section 2: The problem with the naive approach ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginTop: "1rem", marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem", marginTop: 0 }}>The problem with the naive approach</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: "0.75rem" }}>
          Computing <InlineMath>{"L^k"}</InlineMath> directly requires{" "}
          <InlineMath>{"k"}</InlineMath> matrix multiplications. Each multiplication of two{" "}
          <InlineMath>{"N \\times N"}</InlineMath> matrices costs{" "}
          <InlineMath>{"O(N^3)"}</InlineMath> operations.
        </p>
        <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 14, minWidth: 320 }}>
            <thead>
              <tr>
                {["Graph size", "Operations per step"].map(h => (
                  <th key={h} style={{ padding: "6px 16px", borderBottom: "0.5px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["10 nodes",        <InlineMath key="a">{"1{,}000"}</InlineMath>],
                ["1,000 nodes",     <InlineMath key="b">{"1{,}000{,}000{,}000"}</InlineMath>],
                ["1,000,000 nodes", <InlineMath key="c">{"10^{18}"}</InlineMath>],
              ].map(([size, ops]) => (
                <tr key={size} style={{ borderBottom: "0.5px solid var(--border)" }}>
                  <td style={{ padding: "7px 16px", fontFamily: "monospace", fontSize: 13 }}>{size}</td>
                  <td style={{ padding: "7px 16px" }}>{ops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>We need a smarter way.</p>
      </div>

      {/* ── Section 3: Key observation ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem", marginTop: 0 }}>Key observation: <InlineMath>{"L"}</InlineMath> is symmetric</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: "0.5rem" }}>
          Since <InlineMath>{"L = D - A"}</InlineMath> is symmetric, its eigenvectors are <strong>orthonormal</strong> (orthogonal + unit length):
        </p>
        <MathBlock latex={"V^T V = I \\iff V V^T = I"} />
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0.5rem 0" }}>
          Given <InlineMath>{"LV = V\\Lambda"}</InlineMath>:
        </p>
        <MathBlock latex={
          "LVV^T = V\\Lambda V^T \\\\" +
          "L = V\\Lambda V^T"
        } />
      </div>

      {/* ── Section 4: Raising L to the k-th power ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.5rem", marginTop: 0 }}>Raising <InlineMath>{"L"}</InlineMath> to the <InlineMath>{"k"}</InlineMath>-th power</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: "0.5rem" }}>
          When we square <InlineMath>{"L"}</InlineMath>:
        </p>
        <MathBlock latex={
          "L^2 = V\\Lambda V^T \\cdot V\\Lambda V^T \\\\" +
          "= V\\Lambda (V^T V) \\Lambda V^T \\\\" +
          "= V\\Lambda \\cdot I \\cdot \\Lambda V^T \\\\" +
          "= V\\Lambda^2 V^T"
        } />
        {/* Highlighted result */}
        <div style={{
          background: "var(--metric-bg)", border: `1.5px solid ${GOLD}`,
          borderRadius: 10, padding: "10px 16px", margin: "10px 0",
          overflowX: "auto", textAlign: "center",
        }}>
          <div dangerouslySetInnerHTML={{ __html: katex.renderToString("L^k = V\\Lambda^k V^T", { throwOnError: false, displayMode: true }) }} />
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0.75rem 0 0.5rem" }}>
          And since <InlineMath>{"\\Lambda"}</InlineMath> is diagonal,{" "}
          <InlineMath>{"\\Lambda^k"}</InlineMath> is trivial — just raise each diagonal entry to the power{" "}
          <InlineMath>{"k"}</InlineMath>. No matrix multiplication needed:
        </p>
        <MathBlock latex={
          "\\Lambda^k = " +
          "\\begin{bmatrix}" +
          "\\lambda_1^k & 0 & \\cdots & 0 \\\\" +
          "0 & \\lambda_2^k & \\cdots & 0 \\\\" +
          "\\vdots & \\vdots & \\ddots & \\vdots \\\\" +
          "0 & 0 & \\cdots & \\lambda_N^k" +
          "\\end{bmatrix}"
        } />
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0.75rem 0 0.5rem" }}>
          With the current eigenvalues at <InlineMath>{"k = " + step}</InlineMath>:
        </p>
        {/* Computed Λ^k diagonal matrix */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: katex.renderToString(
            "\\Lambda^{" + step + "} = \\begin{bmatrix}" +
            eigenvalues.map((lam, i) =>
              eigenvalues.map((_, j) => {
                if (i !== j) return "\\textcolor{#888}{0}";
                const val = Math.pow(lam, step);
                const str = val < 1e-9 ? "0" : val < 1e4 ? val.toFixed(3) : val.toExponential(2);
                return lam < 1e-4
                  ? `\\textcolor{${RED}}{${str}}`
                  : str;
              }).join(" & ")
            ).join(" \\\\ ") +
            "\\end{bmatrix}",
            { throwOnError: false, displayMode: true }
          )}} />
        </div>
      </div>

      {/* ── Section 5: The efficient pipeline ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem", marginTop: 0 }}>The efficient pipeline</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: "1rem" }}>
          Instead of computing{" "}
          <InlineMath>{"V\\Lambda^k V^T \\cdot \\mathbf{x}_0"}</InlineMath>
          {" "}as one block, split into three steps:
        </p>

        {/* Numbered cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.5rem" }}>
          {[
            {
              n: "01", accent: GOLD,
              title: <>Project into eigenvector space <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}>(done once)</span></>,
              eq: "\\tilde{\\mathbf{x}}_0 = V^T \\cdot \\mathbf{x}_0",
              body: <>
                Express <InlineMath>{"\\mathbf{x}_0"}</InlineMath> in the coordinate system of the eigenvectors.
                Computed once when the source node is selected. Cost: <InlineMath>{"O(n^2)"}</InlineMath>.
              </>,
            },
            {
              n: "02", accent: "#4F8CFF",
              title: <>Scale by <InlineMath>{"\\Lambda^k"}</InlineMath> <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}>(cheap, per step)</span></>,
              eq: "\\tilde{\\mathbf{x}}_k = \\Lambda^k \\cdot \\tilde{\\mathbf{x}}_0",
              body: <>
                Multiply each component of <InlineMath>{"\\tilde{\\mathbf{x}}_0"}</InlineMath> by{" "}
                <InlineMath>{"\\lambda_i^k"}</InlineMath>. Since <InlineMath>{"\\Lambda"}</InlineMath> is diagonal
                this is just <InlineMath>{"n"}</InlineMath> scalar multiplications. Cost:{" "}
                <InlineMath>{"O(n)"}</InlineMath>.
              </>,
            },
            {
              n: "03", accent: "#1D9E75",
              title: <>Project back to node space <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}>(per step)</span></>,
              eq: "\\mathbf{x}_k = V \\cdot \\tilde{\\mathbf{x}}_k",
              body: <>
                Convert from eigenvector coordinates back to node values. Cost:{" "}
                <InlineMath>{"O(n^2)"}</InlineMath>.
              </>,
            },
          ].map(({ n, accent, title, eq, body }) => (
            <div key={n} style={{
              display: "grid", gridTemplateColumns: "36px 1fr",
              background: "var(--surface)", border: `0.5px solid ${accent}`,
              borderRadius: 10, overflow: "hidden",
            }}>
              <div style={{
                background: "var(--metric-bg)", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 14, fontWeight: 700,
                color: accent, borderRight: "0.5px solid var(--border)",
              }}>{n}</div>
              <div style={{ padding: "10px 14px" }}>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{title}</div>
                <div style={{ marginBottom: 6 }}
                  dangerouslySetInnerHTML={{ __html: katex.renderToString(eq, { throwOnError: false, displayMode: true }) }}
                />
                <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline flow row */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {/* x₀ */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: "monospace", fontSize: 14, fontWeight: 600,
              padding: "6px 12px", borderRadius: 8,
              background: "var(--metric-bg)", border: "0.5px solid var(--border)",
            }}>
              <InlineMath>{"\\mathbf{x}_0"}</InlineMath>
            </div>
          </div>
          {/* →[Vᵀ]→ once */}
          {[
            { label: "V^T",    cost: "once",     color: GOLD    },
            { label: "\\times\\Lambda^k", cost: "O(n)",  color: "#4F8CFF" },
            { label: "V",      cost: "O(n^2)",   color: "#1D9E75" },
          ].map(({ label, cost, color }, idx) => {
            const midLabels = [
              <><InlineMath>{"\\tilde{\\mathbf{x}}_0"}</InlineMath></>,
              <><InlineMath>{"\\tilde{\\mathbf{x}}_k"}</InlineMath></>,
              <><InlineMath>{"\\mathbf{x}_k"}</InlineMath></>,
            ];
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* arrow + badge */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "var(--text-muted)", fontSize: 16 }}>→</span>
                    <span style={{
                      background: color, color: "#fff", fontSize: 12, fontWeight: 600,
                      padding: "2px 8px", borderRadius: 20,
                    }}>
                      <span dangerouslySetInnerHTML={{ __html: katex.renderToString(label, { throwOnError: false }) }} />
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 16 }}>→</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cost}</span>
                </div>
                {/* result node */}
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: "monospace", fontSize: 14, fontWeight: 600,
                    padding: "6px 12px", borderRadius: 8,
                    background: "var(--metric-bg)", border: "0.5px solid var(--border)",
                  }}>
                    {midLabels[idx]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 6: Cost comparison callout ── */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.75rem", marginTop: 0 }}>Cost comparison</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
          {/* Naive */}
          <div style={{
            border: `0.5px solid ${RED}`, borderRadius: 10, padding: "12px 16px",
            background: isDark ? "rgba(232,93,36,0.07)" : "rgba(232,93,36,0.04)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: RED, marginBottom: 8 }}>Naive</div>
            <div dangerouslySetInnerHTML={{ __html: katex.renderToString(
              "\\mathbf{x}_k = L^k \\cdot \\mathbf{x}_0",
              { throwOnError: false, displayMode: true }
            )}} />
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
              Cost: <InlineMath>{"O(n^3)"}</InlineMath> per step
            </div>
          </div>
          {/* Efficient */}
          <div style={{
            border: "0.5px solid #1D9E75", borderRadius: 10, padding: "12px 16px",
            background: isDark ? "rgba(29,158,117,0.07)" : "rgba(29,158,117,0.04)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1D9E75", marginBottom: 8 }}>Efficient</div>
            <div dangerouslySetInnerHTML={{ __html: katex.renderToString(
              "\\tilde{\\mathbf{x}}_0 = V^T\\mathbf{x}_0 \\quad \\text{(once, } O(n^2)\\text{)} \\\\" +
              "\\tilde{\\mathbf{x}}_k = \\Lambda^k \\tilde{\\mathbf{x}}_0 \\quad \\text{(per step, } O(n)\\text{)} \\\\" +
              "\\mathbf{x}_k = V\\tilde{\\mathbf{x}}_k \\quad \\text{(per step, } O(n^2)\\text{)}",
              { throwOnError: false, displayMode: true }
            )}} />
          </div>
        </div>

        <Callout borderColor={"#4F8CFF"} bg={isDark ? "rgba(79,140,255,0.08)" : "rgba(79,140,255,0.05)"}>
          For large graphs the difference is enormous. This is why eigendecomposition is not just a mathematical curiosity —
          it has direct computational consequences. The same <InlineMath>{"V"}</InlineMath> and{" "}
          <InlineMath>{"\\Lambda"}</InlineMath> computed once for spectral clustering can be reused here for free.
        </Callout>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
        <button onClick={goToGraph2} style={{ fontSize: 14, padding: "8px 18px" }}>
          ← Spectral Clustering
        </button>
      </div>
    </div>
  );
}
