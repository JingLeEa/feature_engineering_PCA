import { useState, useRef, useEffect, useCallback } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { INITIAL_GRAPH } from "../math/graphState.js";

function InlineMath({ children }) {
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(children, { throwOnError: false }) }} />;
}

function KatexMatrix({ mat, label, labelColor, activeColor }) {
  const zero = "#aaaaaa";
  const rows = mat.map(row =>
    row.map(v => v === 0
      ? `\\textcolor{${zero}}{\\phantom{-}0}`
      : `\\textcolor{${activeColor}}{${v < 0 ? v : `\\phantom{-}${v}`}}`
    ).join(" & ")
  ).join(" \\\\ ");
  const latex = label
    ? `\\textcolor{${labelColor}}{${label}} = \\begin{bmatrix} ${rows} \\end{bmatrix}`
    : `\\begin{bmatrix} ${rows} \\end{bmatrix}`;
  return (
    <div style={{ fontSize: 15, overflowX: "auto" }}
      dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { throwOnError: false, displayMode: true }) }}
    />
  );
}

const NODE_R   = 18;
const CANVAS_H = 480;
const BLUE     = "#4F8CFF";
const GOLD     = "#fb9d07";
const GREEN    = "#1D9E75";
const EDGE_HIT = 6;
const N        = 10;

function buildMatrices(edges) {
  const A = Array.from({ length: N }, () => Array(N).fill(0));
  const D = Array.from({ length: N }, () => Array(N).fill(0));
  edges.forEach(([a, b]) => {
    A[a - 1][b - 1] = 1;
    A[b - 1][a - 1] = 1;
  });
  for (let i = 0; i < N; i++) D[i][i] = A[i].reduce((s, v) => s + v, 0);
  const L = A.map((row, i) => row.map((v, j) => D[i][j] - v));
  return { A, D, L };
}

// Distance from point (px,py) to segment (ax,ay)-(bx,by)
function ptSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export default function GraphStage1({ isDark, graph, setGraph, goToGraph2, goToPCA }) {
  const [selected, setSelected] = useState(null); // node id awaiting second click
  const canvasRef  = useRef(null);
  const dragging   = useRef(null);  // { id, ox, oy }
  const dragMoved  = useRef(false); // did we actually move beyond threshold?
  const dragStart  = useRef(null);  // { x, y } at mousedown, for sensitivity check
  const DRAG_THRESHOLD = 4;         // px — movements smaller than this count as a click

  // Resolve normalised coords to canvas px
  function resolve(nx, ny) {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth || 700;
    const h = canvas?.clientHeight || CANVAS_H;
    return { x: nx * w, y: ny * h };
  }
  function toNorm(x, y) {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth || 700;
    const h = canvas?.clientHeight || CANVAS_H;
    return { nx: x / w, ny: y / h };
  }

  // Notify parent whenever graph changes

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 700;
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

    // Build px lookup
    const px = {};
    graph.nodes.forEach(n => { px[n.id] = { x: n.nx * w, y: n.ny * h }; });

    // Edges
    graph.edges.forEach(([a, b]) => {
      const p1 = px[a], p2 = px[b];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Nodes
    graph.nodes.forEach(({ id }) => {
      const { x, y } = px[id];
      const isSel = id === selected;
      ctx.beginPath();
      ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
      ctx.fillStyle   = isSel ? GOLD : (isDark ? "#2a2a2a" : "#ffffff");
      ctx.strokeStyle = isSel ? GOLD : BLUE;
      ctx.lineWidth   = isSel ? 3 : 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle    = isSel ? "#000" : (isDark ? "#e0e0e0" : "#111111");
      ctx.font         = "bold 13px system-ui";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(id), x, y);
    });

    // Hint
    ctx.fillStyle  = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.18)";
    ctx.font       = "12px system-ui";
    ctx.textAlign  = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("drag nodes · click two nodes to add/remove edge · click edge to remove", w - 10, h - 8);
  }, [graph, isDark, selected]);

  useEffect(() => { draw(); }, [draw]);

  function getCanvasPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current.clientWidth  / rect.width),
      y: (e.clientY - rect.top)  * (canvasRef.current.clientHeight / rect.height),
    };
  }

  function hitNode(x, y) {
    return graph.nodes.find(n => {
      const p = resolve(n.nx, n.ny);
      return Math.hypot(p.x - x, p.y - y) <= NODE_R;
    }) ?? null;
  }

  function hitEdge(x, y) {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth || 700;
    const h = canvas?.clientHeight || CANVAS_H;
    return graph.edges.find(([a, b]) => {
      const na = graph.nodes.find(n => n.id === a);
      const nb = graph.nodes.find(n => n.id === b);
      return ptSegDist(x, y, na.nx * w, na.ny * h, nb.nx * w, nb.ny * h) <= EDGE_HIT;
    }) ?? null;
  }

  function hasEdge(a, b) {
    return graph.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  function onMouseDown(e) {
    const { x, y } = getCanvasPos(e);
    const node = hitNode(x, y);
    dragMoved.current = false;
    dragStart.current = { x, y };
    if (node) {
      const p = resolve(node.nx, node.ny);
      dragging.current = { id: node.id, ox: x - p.x, oy: y - p.y };
    }
  }

  function onMouseMove(e) {
    if (!dragging.current) return;
    const { x, y } = getCanvasPos(e);
    // Only count as a drag once the pointer moves beyond the threshold
    if (!dragMoved.current && dragStart.current) {
      const dx = x - dragStart.current.x;
      const dy = y - dragStart.current.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragMoved.current = true;
    }
    const { id, ox, oy } = dragging.current;
    const { nx, ny } = toNorm(x - ox, y - oy);
    setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === id ? { ...n, nx, ny } : n) }));
  }

  function onMouseUp(e) {
    const moved = dragMoved.current;
    dragging.current  = null;
    dragMoved.current = false;

    if (moved) return; // was a drag, not a click

    const { x, y } = getCanvasPos(e);
    const node = hitNode(x, y);

    if (node) {
      if (selected === null) {
        setSelected(node.id);
      } else if (selected === node.id) {
        setSelected(null);
      } else {
        // Add or remove edge between selected and node
        const a = selected, b = node.id;
        setGraph(g => {
          if (hasEdge(a, b)) {
            return { ...g, edges: g.edges.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))) };
          } else {
            return { ...g, edges: [...g.edges, [a, b]] };
          }
        });
        setSelected(null);
      }
      return;
    }

    // Click on empty space or edge
    const edge = hitEdge(x, y);
    if (edge) {
      const [a, b] = edge;
      setGraph(g => ({ ...g, edges: g.edges.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))) }));
    } else {
      setSelected(null);
    }
  }

  function reset() {
    setGraph(INITIAL_GRAPH);
    setSelected(null);
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--text-muted)", background: "var(--surface)",
        border: "0.5px solid var(--border)", borderRadius: 20,
        padding: "3px 10px", display: "inline-block", marginBottom: "0.75rem",
      }}>
        Graph Lab — Stage 1
      </div>
      <h1 style={{ marginBottom: "0.4rem" }}>Build a Graph</h1>
      <p style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}>
        Drag nodes to reposition them. Click a node then click another to add an edge.
        Click an existing edge (or repeat the node pair) to remove it.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "1rem" }}>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
          {graph.nodes.length} nodes · <strong>{graph.edges.length}</strong> edges
          {selected !== null && <span style={{ color: GOLD, marginLeft: 10 }}>Node {selected} selected — click another node to connect</span>}
        </span>
        <button onClick={reset} style={{ marginLeft: "auto", fontSize: 13, padding: "5px 14px" }}>
          Reset
        </button>
      </div>

      <div style={{
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, overflow: "hidden", width: "100%",
      }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: CANVAS_H, cursor: dragging.current ? "grabbing" : "grab" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { dragging.current = null; dragMoved.current = false; }}
        />
      </div>

      {/* ── MATRICES ── */}
      {(() => {
        const { A, D, L } = buildMatrices(graph.edges);
        const maxDeg = Math.max(...D.map((row, i) => row[i]), 0);
        const matrices = [
          {
            label: "A", mat: A, color: BLUE,
            title: "Adjacency Matrix",
            desc: <><InlineMath>{"A_{ij} = 1"}</InlineMath> if there is an edge between nodes <InlineMath>{"i"}</InlineMath> and <InlineMath>{"j"}</InlineMath>, 0 otherwise.</>,
          },
          {
            label: "D", mat: D, color: GOLD,
            title: "Degree Matrix",
            desc: <>Diagonal matrix. <InlineMath>{"D_{ii}"}</InlineMath> = degree of node <InlineMath>{"i"}</InlineMath> (number of edges connected to it).</>,
          },
          {
            label: "L", mat: L, color: GREEN,
            title: "Laplacian  L = D − A",
            desc: <><InlineMath>{"L_{ij} = -1"}</InlineMath> if <InlineMath>{"i"}</InlineMath> and <InlineMath>{"j"}</InlineMath> are connected, <InlineMath>{"\\text{deg}(i)"}</InlineMath> on the diagonal, 0 elsewhere.</>,
          },
        ];

        // Properties table: [property, A value, D value, L value, which cols to highlight]
        const HIGHLIGHT = "rgba(255,200,0,0.13)";
        const props = [
          { name: "Symmetric",              a: "Yes",                      d: "Yes",                       l: "Yes",                       hi: [] },
          { name: "Diagonal",               a: "No",                       d: "Yes",                       l: "No",                        hi: [1] },
          { name: "Row sums",               a: <InlineMath>{"d_i"}</InlineMath>, d: <InlineMath>{"d_i"}</InlineMath>, l: "0",            hi: [2] },
          { name: "Positive semi-definite", a: "Not always",               d: "Yes",                       l: "Yes",                       hi: [0] },
          { name: "Smallest eigenvalue",    a: "can be < 0",               d: "0",                         l: "0",                         hi: [0] },
        ];

        return (
          <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {matrices.map(({ label, mat, color, title, desc }) => (
              <div key={label} style={{
                background: "var(--surface)", border: "0.5px solid var(--border)",
                borderRadius: 12, padding: "1rem 1.5rem",
                borderLeft: `3px solid ${color}`,
              }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>{desc}</div>
                <KatexMatrix mat={mat} label={label} labelColor={color} activeColor={color} />
              </div>
            ))}

            {/* Properties comparison table */}
            <div style={{
              background: "var(--surface)", border: "0.5px solid var(--border)",
              borderRadius: 12, padding: "1rem 1.5rem",
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Properties</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr>
                      {["Property", "A (Adjacency)", "D (Degree)", "L (Laplacian)"].map((h, i) => (
                        <th key={h} style={{
                          textAlign: i === 0 ? "left" : "center",
                          padding: "6px 10px", borderBottom: "0.5px solid var(--border)",
                          color: i === 0 ? "var(--text-muted)" : [BLUE, GOLD, GREEN][i - 1],
                          fontWeight: 600, whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {props.map(({ name, a, d, l, hi }) => (
                      <tr key={name} style={{ borderBottom: "0.5px solid var(--border)" }}>
                        <td style={{ padding: "6px 10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{name}</td>
                        {[a, d, l].map((val, ci) => (
                          <td key={ci} style={{
                            padding: "6px 10px", textAlign: "center",
                            background: hi.includes(ci) ? HIGHLIGHT : "transparent",
                            borderRadius: 4,
                          }}>{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
        <button onClick={() => { goToPCA(); window.scrollTo({ top: 0, behavior: "instant" }); }} style={{ fontSize: 14, padding: "8px 18px" }}>
          ← Back to PCA
        </button>
        <button className="btn-primary" onClick={() => { goToGraph2(); window.scrollTo({ top: 0, behavior: "instant" }); }} style={{ fontSize: 14, padding: "8px 18px" }}>
          Next: Spectral Clustering →
        </button>
      </div>
    </div>
  );
}
