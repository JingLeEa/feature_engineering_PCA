import { useState, useRef, useEffect, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { SHAPES } from "../math/shapes3d.js";
import { computePCA3D, projectPoints3D, mean, varianceOf } from "../math/pca.js";
import { setupCanvas } from "../components/canvas/canvasUtils.js";
import { Callout, Divider, MetricCard } from "../components/ui/primitives.jsx";

function InlineMath({ children }) {
  const html = katex.renderToString(children, { throwOnError: false, displayMode: false });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

const GOLD  = "#fb9d07";
const BLUE  = "#4F8CFF";
const GREEN = "#1D9E75";
const RED   = "#E85D24";
const TEAL  = "#17a89e";

// ─── ISOMETRIC PROJECTION ─────────────────────────────────────────────────────

function isoProject(x, y, z, azimuth, elevation, scale, ox, oy) {
  // Rotate around Y axis (azimuth), then tilt (elevation)
  const cosA = Math.cos(azimuth), sinA = Math.sin(azimuth);
  const cosE = Math.cos(elevation), sinE = Math.sin(elevation);
  const rx =  x * cosA + z * sinA;
  const ry = -x * sinA * sinE + y * cosE + z * cosA * sinE;
  const rz = -x * sinA * cosE - y * sinE + z * cosA * cosE; // unused (depth only)
  return { sx: rx * scale + ox, sy: -ry * scale + oy, depth: rz };
}

// ─── ROTATABLE 3D SCATTER CANVAS ─────────────────────────────────────────────

function Scatter3D({ pts, isDark, eigenvectors, showAxes, showMean, highlightIdx }) {
  const ref        = useRef(null);
  const dragging   = useRef(false);
  const lastPos    = useRef({ x: 0, y: 0 });
  const azimuth    = useRef(Math.PI / 5);
  const elevation  = useRef(Math.PI / 10);
  const rafId      = useRef(null);

  // Derive a stable scale + offset from the data
  const { dataScale, cx3d, cy3d, cz3d } = useMemo(() => {
    if (!pts.length) return { dataScale: 50, cx3d: 0, cy3d: 0, cz3d: 0 };
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), zs = pts.map(p => p.z);
    const maxRange = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      Math.max(...zs) - Math.min(...zs), 1
    );
    return { dataScale: 1 / maxRange, cx3d: mean(xs), cy3d: mean(ys), cz3d: mean(zs) };
  }, [pts]);

  function draw() {
    const canvas = ref.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 400, h = canvas.clientHeight || 340;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const ox = w * 0.5, oy = h * 0.52;
    const scale = Math.min(w, h) * 0.5 * dataScale;
    const az = azimuth.current, el = elevation.current;

    const proj = (x, y, z) => isoProject(x, y, z, az, el, scale, ox, oy);

    // Grid floor
    const gridR = 1 / dataScale * 0.42;
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    ctx.lineWidth = 0.5;
    for (let g = -3; g <= 3; g++) {
      const t = g * gridR / 3;
      const { sx: sx1, sy: sy1 } = proj(t, -gridR * 0.5, -gridR);
      const { sx: sx2, sy: sy2 } = proj(t, -gridR * 0.5,  gridR);
      ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
      const { sx: sx3, sy: sy3 } = proj(-gridR, -gridR * 0.5, t);
      const { sx: sx4, sy: sy4 } = proj( gridR, -gridR * 0.5, t);
      ctx.beginPath(); ctx.moveTo(sx3, sy3); ctx.lineTo(sx4, sy4); ctx.stroke();
    }

    // Reference axes (x/y/z)
    const axLen = gridR * 2.0;
    const drawRefAxis = (dx, dy, dz, color, lbl) => {
      const { sx: x1, sy: y1 } = proj(0, 0, 0);
      const { sx: x2, sy: y2 } = proj(dx * axLen, dy * axLen, dz * axLen);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = "12px system-ui"; ctx.textAlign = "center";
      ctx.fillText(lbl, x2, y2 - 5);
    };
    const a = isDark ? "0.8" : "0.7";
    drawRefAxis(1, 0, 0, `rgba(117,124,136,${a})`,  "x");
    drawRefAxis(0, 1, 0, `rgba(117,124,136,${a})`,  "y");
    drawRefAxis(0, 0, 1, `rgba(117,124,136,${a})`,  "z");

    // Mean marker
    if (showMean) {
      const mx = mean(pts.map(p => p.x));
      const my = mean(pts.map(p => p.y));
      const mz = mean(pts.map(p => p.z));
      const { sx, sy } = proj(mx, my, mz);
      ctx.strokeStyle = BLUE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9); ctx.stroke();
      ctx.fillStyle = BLUE; ctx.font = "bold 10px system-ui"; ctx.textAlign = "left";
      ctx.fillText("mean", sx + 7, sy - 4);
    }

    // Eigenvector arrows (drawn before points so points render on top)
    if (showAxes && eigenvectors) {
      const mx = mean(pts.map(p => p.x));
      const my = mean(pts.map(p => p.y));
      const mz = mean(pts.map(p => p.z));
      const evLen = 1 / dataScale * 0.5;
      const colors = [GOLD, BLUE, TEAL];
      const labels = ["PC1", "PC2", "PC3"];
      eigenvectors.forEach(([vx, vy, vz], i) => {
        const { sx: ex1, sy: ey1 } = proj(mx - vx * evLen, my - vy * evLen, mz - vz * evLen);
        const { sx: ex2, sy: ey2 } = proj(mx + vx * evLen, my + vy * evLen, mz + vz * evLen);
        ctx.strokeStyle = colors[i]; ctx.lineWidth = i === 0 ? 2.5 : 1.8;
        ctx.beginPath(); ctx.moveTo(ex1, ey1); ctx.lineTo(ex2, ey2); ctx.stroke();
        const dx = ex2 - ex1, dy = ey2 - ey1;
        const l = Math.sqrt(dx * dx + dy * dy); if (l < 1) return;
        const ux = dx / l, uy = dy / l, hl = 8;
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.moveTo(ex2, ey2);
        ctx.lineTo(ex2 - hl * ux + hl * 0.4 * uy, ey2 - hl * uy - hl * 0.4 * ux);
        ctx.lineTo(ex2 - hl * ux - hl * 0.4 * uy, ey2 - hl * uy + hl * 0.4 * ux);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = colors[i]; ctx.font = "500 12px system-ui"; ctx.textAlign = "left";
        ctx.fillText(labels[i], ex2 + 4, ey2 + 4);
      });
    }

    // Data points — painter's algorithm by depth
    const projected = pts.map((p, i) => ({ ...proj(p.x, p.y, p.z), idx: i }));
    projected.sort((a, b) => a.depth - b.depth);
    const hlPoint3d = highlightIdx != null ? projected.find(p => p.idx === highlightIdx) : null;
    projected.forEach(({ sx, sy, idx }) => {
      if (idx === highlightIdx) return;
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(195,29,29,0.65)"; ctx.fill();
    });
    if (hlPoint3d) {
      ctx.strokeStyle = "#ff3bff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hlPoint3d.sx, hlPoint3d.sy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(hlPoint3d.sx, hlPoint3d.sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff3bff"; ctx.fill();
    }

    // Drag hint
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)";
    ctx.font = "12px system-ui"; ctx.textAlign = "right";
    ctx.fillText("drag to rotate", w - 8, h - 6);
  }

  useEffect(() => { draw(); });

  // Mouse / touch drag handlers
  function startDrag(x, y) { dragging.current = true; lastPos.current = { x, y }; }
  function moveDrag(x, y) {
    if (!dragging.current) return;
    const dx = x - lastPos.current.x, dy = y - lastPos.current.y;
    azimuth.current   += dx * 0.012;
    elevation.current += dy * 0.012;
    elevation.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, elevation.current));
    lastPos.current = { x, y };
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(draw);
  }
  function endDrag() { dragging.current = false; }

  return (
    <canvas
      ref={ref}
      style={{ display: "block", width: "100%", height: "100%", cursor: "grab" }}
      onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
      onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onTouchStart={(e) => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
      onTouchMove={(e)  => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY);  }}
      onTouchEnd={endDrag}
    />
  );
}

// ─── 2D SCATTER CANVAS ────────────────────────────────────────────────────────

function Scatter2D({ projPts, isDark, highlightIdx }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 280;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = 40, cx = w / 2, cy = h / 2;
    const vals1 = projPts.map(p => p.pc1), vals2 = projPts.map(p => p.pc2);
    const maxR = Math.max(Math.max(...vals1.map(Math.abs)), Math.max(...vals2.map(Math.abs)), 1) * 1.15;
    const toSx = v => cx + (v / maxR) * (w / 2 - pad);
    const toSy = v => cy - (v / maxR) * (h / 2 - pad);

    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    ctx.lineWidth = 0.5;
    for (let g = -2; g <= 2; g++) {
      ctx.beginPath(); ctx.moveTo(toSx(g * maxR / 3), pad); ctx.lineTo(toSx(g * maxR / 3), h - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, toSy(g * maxR / 3)); ctx.lineTo(w - pad, toSy(g * maxR / 3)); ctx.stroke();
    }
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = "500 13px system-ui"; ctx.textAlign = "left";
    ctx.fillText("PC1", w - pad + 4, cy + 4);
    ctx.strokeStyle = BLUE; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, pad); ctx.lineTo(cx, h - pad); ctx.stroke();
    ctx.fillStyle = BLUE; ctx.fillText("PC2", cx + 4, pad);
    let hlPt2d = null;
    projPts.forEach(({ pc1, pc2 }, i) => {
      if (i === highlightIdx) { hlPt2d = { sx: toSx(pc1), sy: toSy(pc2) }; return; }
      ctx.beginPath(); ctx.arc(toSx(pc1), toSy(pc2), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(195,29,29,0.6)"; ctx.fill();
    });
    if (hlPt2d) {
      ctx.strokeStyle = "#ff3bff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hlPt2d.sx, hlPt2d.sy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(hlPt2d.sx, hlPt2d.sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff3bff"; ctx.fill();
    }
  });
  return <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />;
}

// ─── MATRIX DISPLAY ──────────────────────────────────────────────────────────


// ─── STEP BAR ────────────────────────────────────────────────────────────────

function StepBar({ current, total }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: "1.5rem" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          height: 4, flex: 1, borderRadius: 2,
          background: i < current ? "var(--text-primary)" : i === current ? BLUE : "var(--border)",
          transition: "background 0.3s",
        }} />
      ))}
      <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", marginLeft: 4 }}>
        Step {current + 1} / {total}
      </span>
    </div>
  );
}

// ─── MATH BLOCK (styled formula box) ─────────────────────────────────────────

function MathBlock({ label, children, latex }) {
  const html = latex ? katex.renderToString(latex, { throwOnError: false, displayMode: true }) : null;
  return (
    <div style={{
      background: "var(--metric-bg)", border: "0.5px solid var(--border)",
      borderRadius: 10, padding: "10px 16px", margin: "8px 0",
      fontSize: 16, lineHeight: 1.8,
      color: "var(--text-primary)", overflowX: "auto", textAlign: "center",
    }}>
      {label && <div style={{ fontSize: 15, color: "var(--text-muted)", fontFamily: "system-ui", marginBottom: 4, textAlign: "left" }}>{label}</div>}
      {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : children}
    </div>
  );
}

// ─── MAIN STAGE 2 ─────────────────────────────────────────────────────────────

const STEP_LABELS = [
  "Compute the mean",
  "Covariance matrix",
  "Eigendecomposition",
  "Dimension reduction",
];

export default function Stage2StepByStep({ isDark, goToStage1, goToGraph1 }) {
  const [shapeKey, setShapeKey] = useState(null);
  const [step, setStep]         = useState(0);
  const [centered, setCentered] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const stepBarRef    = useRef(null);
  const stepMounted   = useRef(false);

  useEffect(() => {
    if (!stepMounted.current) { stepMounted.current = true; return; }
    stepBarRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [step]);

  const pts = useMemo(() => (shapeKey ? SHAPES[shapeKey].generate() : []), [shapeKey]);
  const pca = useMemo(() => (pts.length ? computePCA3D(pts) : null), [pts]);

  const centeredPts = pca?.centeredPts ?? [];
  const projPts     = pca ? projectPoints3D(centeredPts, pca.eigenvectors, 2) : [];

  if (!shapeKey) {
    return <ShapePicker isDark={isDark} goToStage1={goToStage1} onSelect={(k) => { setShapeKey(k); setStep(0); setCentered(false); setShowSummary(false); }} />;
  }

  if (showSummary) {
    return <SummarySection pca={pca} centeredPts={centeredPts} onBackToShapes={() => { setShapeKey(null); setShowSummary(false); }} goToGraph1={goToGraph1} isDark={isDark} />;
  }

  const n = pts.length;
  const dim = 3;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.5rem" }}>
        <button onClick={() => setShapeKey(null)} style={{ padding: "4px 10px", fontSize: 13 }}>← Back</button>
        <span style={{
          fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--text-muted)", background: "var(--surface)",
          border: "0.5px solid var(--border)", borderRadius: 20, padding: "5px 10px",
        }}>Stage 2 - Step-by-step PCA</span>
      </div>
      <h1 style={{ marginBottom: "0.4rem" }}>3D → 2D with {SHAPES[shapeKey].label}</h1>
      <p style={{ marginBottom: "1.5rem", maxWidth: 560 }}>{SHAPES[shapeKey].description}</p>

      {/* ── SETUP OVERVIEW ── */}
      <div style={{
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, padding: "1rem 1.5rem", marginBottom: "1.5rem",
      }}>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Dataset overview
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
          {[
            { label: "Feature vectors", value: `N = ${n}`, sub: "data points" },
            { label: "Dimension of each", value: `m = ${dim}`, sub: "x, y, z features" },
            { label: "Target dimension", value: "k = 2", sub: "we will reduce to this" },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: "var(--metric-bg)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 14, marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 500 }}>{value}</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          We have <InlineMath>{`N=${n}`}</InlineMath> feature vectors{" "}
          <InlineMath>{"\\{p_1, p_2, \\ldots, p_N\\}"}</InlineMath> where each{" "}
          <strong><InlineMath>{"p_i"}</InlineMath></strong> is a <InlineMath>{`${dim} \\times 1`}</InlineMath> vector.
          Our goal is to find a mapping to a <InlineMath>{`2 \\times 1`}</InlineMath> vector — reducing from <InlineMath>{`m = ${dim}`}</InlineMath> to <InlineMath>{`k = 2`}</InlineMath> dimensions —
          while preserving as much variance as possible.
        </div>
      </div>

      {/* Step nav */}
      <div ref={stepBarRef} />
      <StepBar current={step} total={4} />
      <div style={{ display: "flex", gap: 6, marginBottom: "2rem", flexWrap: "wrap" }}>
        {STEP_LABELS.map((label, i) => (
          <button key={i} onClick={() => setStep(i)} style={{
            fontSize: 14, padding: "5px 12px", borderRadius: 20,
            background: step === i ? "var(--text-primary)" : "transparent",
            color: step === i ? "var(--bg)" : "var(--text-muted)",
            border: `0.5px solid ${step === i ? "transparent" : "var(--border)"}`,
          }}>
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && <StepMean pts={pts} pca={pca} centered={centered} setCentered={setCentered} centeredPts={centeredPts} isDark={isDark} />}
      {step === 1 && <StepCovariance pca={pca} centeredPts={centeredPts} isDark={isDark} />}
      {step === 2 && <StepEigen pca={pca} centeredPts={centeredPts} isDark={isDark} />}
      {step === 3 && <StepReduction pca={pca} centeredPts={centeredPts} projPts={projPts} isDark={isDark} />}

      {/* Prev / Next */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
        <button onClick={() => {
          if (step === 0) setShapeKey(null);
          else setStep(s => s - 1);
        }}>
          {step === 0 ? "← Back to shapes" : "← Previous"}
        </button>
        {step === 3 ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShapeKey(null)}>Choose another shape</button>
            <button onClick={() => { setShowSummary(true); window.scrollTo({ top: 0, behavior: "instant" }); }}>View Summary</button>
            <button className="btn-primary" onClick={() => { goToGraph1(); window.scrollTo({ top: 0, behavior: "instant" }); }}>Next: Graph Lab →</button>
          </div>
        ) : (
          <button className="btn-primary" onClick={() => setStep(s => s + 1)}>
            Next →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────

function SummarySection({ pca, centeredPts, onBackToShapes, goToGraph1, isDark }) {
  const keptPct = pca ? ((pca.eigenvalues[0] + pca.eigenvalues[1]) / pca.totalVar * 100).toFixed(1) : "—";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--text-muted)", background: "var(--surface)",
        border: "0.5px solid var(--border)", borderRadius: 20,
        padding: "3px 10px", display: "inline-block", marginBottom: "0.75rem",
      }}>
        Stage 2 — Summary
      </div>
      <h1 style={{ marginBottom: "0.5rem" }}>Summary: PCA in general</h1>
      <p style={{ marginBottom: "1.5rem", color: "var(--primary)" }}>
        Suppose we have <strong>N</strong> feature vectors{" "}
        <InlineMath>{"\\{p_1, p_2, \\ldots, p_N\\}"}</InlineMath> where each{" "}
        <strong><InlineMath>{"p_i"}</InlineMath></strong> is of dimension <InlineMath>{"m \\times 1"}</InlineMath> (m can be very large).
        Our goal is to reduce every vector to dimension <InlineMath>{"k \\times 1"}</InlineMath> where <InlineMath>{"k \\ll m"}</InlineMath>.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.5rem" }}>
        {[
          {
            n: "01", title: "Form the covariance matrix C",
            body: <>Compute <InlineMath>{"C"}</InlineMath> from all N feature vectors: <InlineMath>{"C = \\frac{1}{N}\\sum_i (p_i - \\bar{p})(p_i - \\bar{p})^T"}</InlineMath>. 
            <InlineMath>{"C"}</InlineMath> is of dimension <InlineMath>{"m \\times m"}</InlineMath>.</>,
          },
          {
            n: "02", title: "Find eigenvectors and eigenvalues of C",
            body: <>Solve <InlineMath>{"C\\mathbf{v} = \\lambda\\mathbf{v}"}</InlineMath>. This gives m eigenvectors <InlineMath>{"\\{v_1, v_2, \\ldots, v_m\\}"}</InlineMath> : the <strong>principal components</strong>. Each <InlineMath>{"v_i"}</InlineMath> is <InlineMath>{"m \\times 1"}</InlineMath>.</>,
          },
          {
            n: "03", title: "Rank by eigenvalue",
            body: "Sort eigenvectors by their eigenvalue (descending). The eigenvector with the largest eigenvalue is PC1: the direction of maximum variance.",
          },
          {
            n: "04", title: "Select top k eigenvectors",
            body: <>Choose the k eigenvectors with the largest eigenvalues. These form a projection matrix <InlineMath>{"W"}</InlineMath> of dimension <InlineMath>{"m \\times k"}</InlineMath>.</>,
          },
          {
            n: "05", title: "Project each feature vector",
            body: <>For each <InlineMath>{"p_i"}</InlineMath>, compute the new k-dimensional coordinates: <InlineMath>{"y_i = W^T(p_i - \\bar{p})"}</InlineMath>. Since <InlineMath>{"k \\ll m"}</InlineMath>, the feature vector is greatly reduced in size.</>,
          },
        ].map(({ n, title, body }) => (
          <div key={n} style={{
            display: "grid", gridTemplateColumns: "36px 1fr",
            background: "var(--surface)", border: "0.5px solid var(--border)",
            borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{
              background: "var(--metric-bg)", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 15, fontWeight: 600,
              color: "var(--text-muted)", borderRight: "0.5px solid var(--border)",
            }}>{n}</div>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 15, lineHeight: 1.65 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>

      {pca && (
        <Callout borderColor={GOLD} bg={isDark ? "rgba(245,166,35,0.07)" : "rgba(245,166,35,0.06)"}>
          <strong>In this example:</strong> m = 3, k = 2, N = {centeredPts.length}.
          We retained <strong>{keptPct}%</strong> of the total variance with just 2 components out of 3.
          In practice, datasets with m = 100–10,000 features can often be compressed to k = 10–50
          components while retaining 80%+ of the information.
        </Callout>
      )}

      <Divider />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBackToShapes}>← Back to Shapes</button>
        <button className="btn-primary" onClick={() => { goToGraph1(); window.scrollTo({ top: 0, behavior: "instant" }); }}>Next: Graph Lab →</button>
      </div>
    </div>
  );
}

// ─── SHAPE PICKER ─────────────────────────────────────────────────────────────

function ShapePicker({ isDark, onSelect, goToStage1 }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--text-muted)", background: "var(--surface)",
        border: "0.5px solid var(--border)", borderRadius: 20,
        padding: "3px 10px", display: "inline-block", marginBottom: "0.75rem",
      }}>
        Stage 2 — Step-by-step PCA
      </div>
      <h1 style={{ marginBottom: "0.75rem" }}>3D → 2D: PCA step by step</h1>
      <p style={{ marginBottom: "0.75rem" }}>
        Choose a 3D shape to work with. Each shape has a different variance structure —
        you'll see how PCA finds the directions that matter for each one.
      </p>
      <p style={{ marginBottom: "2rem" }}>
        All shapes are <strong>intentionally not centered at the origin</strong> so you can
        see exactly why mean-centering is the critical first step.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem" }}>
        {Object.entries(SHAPES).map(([key, { label, description }]) => (
          <button key={key} onClick={() => onSelect(key)} style={{
            background: "var(--surface)", border: "0.5px solid var(--border)",
            borderRadius: 14, padding: "1.5rem 1.25rem", textAlign: "left",
            cursor: "pointer", transition: "border-color 0.15s", display: "block",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>
              {key === "helix" ? "🌀" : key === "disc" ? "🥏" : "🔵"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{description}</div>
          </button>
        ))}
      </div>
      <br /><br />
      <button onClick={goToStage1}>← Back to Intuition</button>
    </div>
  );
}

// ─── STEP 1: MEAN ─────────────────────────────────────────────────────────────

function StepMean({ pts, pca, centered, setCentered, centeredPts, isDark }) {
  if (!pca) return null;
  const [mx, my, mz] = pca.mean3;
  const n = pts.length;

  return (
    <div>
      <h2>Step 1: Compute the mean — and center the data</h2>
      <br />
      <p style={{ marginBottom: "1rem" }}>
        The first step of PCA is to <strong>subtract the mean</strong> from every point,
        shifting the entire dataset so that its centroid sits at the origin (0, 0, 0).
        This is called <strong>mean centering</strong>.
      </p>

      <Callout borderColor={BLUE} bg={isDark ? "rgba(27, 182, 238, 0.08)" : "rgba(36, 180, 232, 0.06)"}>
        <strong>Why does it matter?</strong> PCA computes directions through the <em>origin</em>.
        If the data is not centered, the first "principal component" will point toward the
        mean of the data rather than the direction of maximum variance — giving completely
        wrong results. Mean centering ensures PCA captures <em>spread</em>, not <em>location</em>.
      </Callout>

      <br />

      {/* Mean formula + computed values side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        {/* Formula */}
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 10 }}>Formula:</div>
          <MathBlock latex={`\\textcolor{${BLUE}}{\\bar{p}} = \\frac{1}{N}\\sum_{i=1}^{N} p_i`} />
          <div style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, marginTop: 8 }}>
            For each dimension, sum all N = {n} values and divide by N.
            The mean vector <InlineMath>{`\\textcolor{${BLUE}}{\\bar{p}}`}</InlineMath> is then subtracted
            from every point:
          </div>
          <MathBlock latex={`p_i' = p_i - \\textcolor{${BLUE}}{\\bar{p}}`} />
        </div>

        {/* Computed values */}
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 10 }}>Computed mean (N = {n} points):</div>
          <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
            {[[<InlineMath>{"\\bar{x}"}</InlineMath>, mx], 
              [<InlineMath>{"\\bar{y}"}</InlineMath>, my], 
              [<InlineMath>{"\\bar{z}"}</InlineMath>, mz]].map(([label, val]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, color: "var(--text-muted)" }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: BLUE }}>{val.toFixed(3)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 15, color: "var(--text-muted)", lineHeight: 1.6 }}>
            New centered point:<br />
            <span style={{ fontFamily: "monospace" }}>
              <InlineMath>{`x_i' = x_i - ${mx.toFixed(2)}`}</InlineMath><br />
              <InlineMath>{`y_i' = y_i - ${my.toFixed(2)}`}</InlineMath><br />
              <InlineMath>{`z_i' = z_i - ${mz.toFixed(2)}`}</InlineMath>
            </span>
          </div>
        </div>
      </div>

      {/* Toggle buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <button className={!centered ? "btn-primary" : ""} onClick={() => setCentered(false)}>
          Before centering
        </button>
        <button className={centered ? "btn-primary" : ""} onClick={() => setCentered(true)}>
          After centering ✓
        </button>
      </div>

      {/* Large rotatable 3D view + explanation */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem" }}>
          <div style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 6 }}>
            {centered ? "After centering — centroid at (0, 0, 0)" : "Raw data — centroid is far from origin"}
          </div>
          <div style={{ height: 340 }}>
            <Scatter3D pts={centered ? centeredPts : pts} isDark={isDark} showMean={!centered} />
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 10 }}>What changes:</div>
          {centered ? (
            <>
              <Callout borderColor={GREEN} bg={isDark ? "rgba(29,158,117,0.08)" : "rgba(29,158,117,0.06)"}>
                The centroid is now exactly at (0, 0, 0). All mean values are ≈ 0.
                PCA can now correctly identify directions of spread.
              </Callout>
              <br />
              <div style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 8 }}>New means (should be ≈ 0):</div>
              <div style={{ display: "flex", gap: 16 }}>
                {[[<InlineMath>{`\\bar{x}'`}</InlineMath>, mean(centeredPts.map(p => p.x))], [<InlineMath>{`\\bar{y}'`}</InlineMath>, mean(centeredPts.map(p => p.y))], [<InlineMath>{`\\bar{z}'`}</InlineMath>, mean(centeredPts.map(p => p.z))]].map(([l, v]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 15, color: "var(--text-muted)" }}>{l}</div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: GREEN }}>{Math.abs(v) < 1e-10 ? "0.000" : v.toFixed(3)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <Callout borderColor={BLUE} bg={isDark ? "rgba(27, 182, 238, 0.08)" : "rgba(36, 180, 232, 0.06)"}>
                The blue cross marks the mean. It is far from (0, 0, 0).
                If PCA runs now, the first component will point toward this offset
                rather than the direction of maximum spread.
              </Callout>
              <br />
              <p>Toggle to "After centering ✓" to see the entire cloud shift to the origin.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STEP 2: COVARIANCE MATRIX ────────────────────────────────────────────────

function StepCovariance({ pca, centeredPts, isDark }) {
  if (!pca) return null;
  const C = pca.covMatrix;
  const n = centeredPts.length;

  return (
    <div>
      <h2>Step 2: Compute the covariance matrix</h2>
      <br />

      {/* ── MAXIMISING SPREAD DERIVATION ── */}
      <h3>Maximising spread (the squared projection)</h3>
      <br />
      <p style={{ marginBottom: "0.75rem" }}>
        We want to <span style={{ color: RED }}>find a direction v</span> such that the data is as spread out as possible
        when projected onto it. The projection of a point <strong>p</strong> onto direction <strong>v</strong> is:
      </p>
      <MathBlock label="Projection (scalar):" latex={"\\mathbf{v}^T\\mathbf{p} \\qquad (\\mathbf{v}^T \\text{ is } 1{\\times}n,\\ \\mathbf{p} \\text{ is } n{\\times}1 \\to \\text{scalar})"} />

      <p style={{ margin: "0.75rem 0" }}>
        To maximise spread we maximise the <strong>squared projection</strong>:
      </p>
      <MathBlock latex={"(\\mathbf{v}^T\\mathbf{p})^2 = (\\mathbf{v}^T\\mathbf{p})(\\mathbf{v}^T\\mathbf{p})"} />

      <p style={{ margin: "0.75rem 0" }}>
        Since <InlineMath>{"\\mathbf{v}^T\\mathbf{p}"}</InlineMath> is a scalar, its transpose equals itself:{" "}
        <InlineMath>{"\\mathbf{v}^T\\mathbf{p} = (\\mathbf{v}^T\\mathbf{p})^T = \\mathbf{p}^T\\mathbf{v}"}</InlineMath>.
        Using this and the associative property:
      </p>
      <MathBlock latex={"(\\mathbf{v}^T\\mathbf{p})^2 = (\\mathbf{v}^T\\mathbf{p})(\\mathbf{p}^T\\mathbf{v}) = \\mathbf{v}^T(\\mathbf{p}\\mathbf{p}^T)\\mathbf{v}"} />

      <p style={{ margin: "0.75rem 0" }}>
        Subtracting the mean (from Step 1) to capture true spread:
      </p>
      <MathBlock latex={"\\mathbf{v}^T(\\mathbf{p} - \\bar{\\mathbf{p}})(\\mathbf{p} - \\bar{\\mathbf{p}})^T\\mathbf{v}"} />

      <p style={{ margin: "0.75rem 0" }}>
        Since we have <strong>N</strong> points, we take the <em>average</em> (expected value) across the whole dataset.
        Because <strong>v</strong> is the direction we are searching for (not part of the data), it can be
        factored out of the expectation:
      </p>
      <MathBlock latex={`\\mathbb{E}\\left\\{\\mathbf{v}^T(\\mathbf{p}-\\bar{\\mathbf{p}})(\\mathbf{p}-\\bar{\\mathbf{p}})^T\\mathbf{v}\\right\\} = \\mathbf{v}^T \\textcolor{${GOLD}}{\\underbrace{\\mathbb{E}\\left\\{(\\mathbf{p}-\\bar{\\mathbf{p}})(\\mathbf{p}-\\bar{\\mathbf{p}})^T\\right\\}}_{C}} \\mathbf{v} = \\mathbf{v}^T\\textcolor{${GOLD}}{C}\\mathbf{v}`} />

      <Callout borderColor={GOLD} bg={isDark ? "rgba(245,166,35,0.07)" : "rgba(245,166,35,0.06)"}>
        The highlighted term <strong style={{ color: GOLD }}>C</strong> is the <strong>covariance matrix</strong>.
        It captures how all dimensions of the data vary together —
        summarising the "shape" of the data cloud. Maximising <InlineMath>{"\\mathbf{v}^TC\\mathbf{v}"}</InlineMath> over all unit vectors <InlineMath>{"\\mathbf{v}"}</InlineMath>{" "}
        is exactly the eigenvalue problem we solve in Step 3.
      </Callout>

      <br />

      {/* ── COVARIANCE FORMULA ── */}
      <h3>The covariance matrix C</h3>
      <br />
      <MathBlock label="Definition:" latex={"C = \\frac{1}{N}\\sum_{i=1}^{N}(\\mathbf{p}_i - \\bar{\\mathbf{p}})(\\mathbf{p}_i - \\bar{\\mathbf{p}})^T"} />
      <p style={{ margin: "0.75rem 0 1rem" }}>
        For our 3D data, <strong>C</strong> is a symmetric 3×3 matrix:
      </p>

      <MathBlock latex={String.raw`C = \begin{pmatrix} \textcolor{${GOLD}}{\text{Var}(x)} & \textcolor{${BLUE}}{\text{Cov}(x,y)} & \textcolor{${BLUE}}{\text{Cov}(x,z)} \\ \textcolor{${BLUE}}{\text{Cov}(y,x)} & \textcolor{${GOLD}}{\text{Var}(y)} & \textcolor{${BLUE}}{\text{Cov}(y,z)} \\ \textcolor{${BLUE}}{\text{Cov}(z,x)} & \textcolor{${BLUE}}{\text{Cov}(z,y)} & \textcolor{${GOLD}}{\text{Var}(z)} \end{pmatrix}`} />

      {/* Properties */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: "1rem" }}>
        {[
          { label: "Diagonal entries", desc: <><InlineMath>{"C_{kk} = \\text{Var}(x_k)"}</InlineMath> — variance of the k-th dimension (x, y, or z).</>, color: GOLD },
          { label: "Off-diagonal entries", desc: <><InlineMath>{"C_{kl} = \\text{Cov}(x_k,\\, x_l),\\; k \\neq l"}</InlineMath> — how two dimensions change together. Positive = same direction, negative = opposite.</>, color: BLUE },
          { label: "Symmetry", desc: <><InlineMath>{"C_{kl} = C_{lk}"}</InlineMath> always. The matrix is always symmetric around the diagonal.</>, color: GREEN },
        ].map(({ label, desc, color }) => (
          <div key={label} style={{
            background: "var(--surface)", borderLeft: `3px solid ${color}`,
            borderRadius: "0 8px 8px 0", padding: "10px 12px",
            border: `0.5px solid ${color}22`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Computed matrix */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.5rem", marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "1.5rem", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 12 }}>
              Computed covariance matrix C (N = {n} centered points):
            </div>
            <div style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: katex.renderToString(
              `\\textcolor{${GOLD}}{C} = \\begin{bmatrix} ${
                C.map((row, i) => row.map((v, j) =>
                  i === j
                    ? `\\textcolor{${GOLD}}{${v.toFixed(2)}}`
                    : `\\textcolor{${BLUE}}{${v.toFixed(2)}}`
                ).join(" & ")).join(" \\\\ ")
              } \\end{bmatrix}`,
              { throwOnError: false, displayMode: true }
            ) }} />
          </div>
        </div>
      </div>

      <Callout borderColor={BLUE} bg={isDark ? "rgba(79,140,255,0.08)" : "rgba(79,140,255,0.06)"}>
        <strong>Key insight:</strong> Large diagonal values mean that dimension has high spread.
        Large off-diagonal absolute values mean two dimensions are correlated — carrying redundant information. <br /><br />
        Because C is <span style={{ color: RED, fontWeight: 600 }}>symmetrical</span>, its eigenvectors are guaranteed to be{" "}
        <span style={{ color: RED, fontWeight: 600 }}>orthogonal to each other</span> — they form a perfectly perpendicular coordinate system aligned with the data's natural axes.
      </Callout>
    </div>
  );
}

// ─── STEP 3: EIGENDECOMPOSITION ───────────────────────────────────────────────

function StepEigen({ pca, centeredPts, isDark }) {
  if (!pca) return null;
  const { eigenvectors, eigenvalues, totalVar } = pca;

  return (
    <div>
      <h2>Step 3: Eigendecomposition</h2>
      <br />
      <p style={{ marginBottom: "1rem" }}>
        We factorise the covariance matrix <InlineMath>{`\\textcolor{${GOLD}}{C}`}</InlineMath> into its <strong>eigenvalues</strong> and <strong>eigenvectors</strong>:
      </p>

      {/* Equation */}
      <div style={{
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, padding: "1rem 1.5rem", marginBottom: "1rem",
        fontSize: 20, lineHeight: 2,
      }}>
        <div style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 4, fontFamily: "system-ui" }}>Eigenvalue equation:</div>
        <div dangerouslySetInnerHTML={{ __html: katex.renderToString(
          `\\textcolor{${GOLD}}{C}\\,\\textcolor{${BLUE}}{\\mathbf{v}} = \\textcolor{${RED}}{\\lambda}\\,\\textcolor{${BLUE}}{\\mathbf{v}}`,
          { throwOnError: false, displayMode: true }
        ) }} />
        <div style={{ fontSize: 15, color: "var(--text-secondary)", fontFamily: "system-ui", marginTop: 4, lineHeight: 1.6 }}>
          <InlineMath>{`\\textcolor{${GOLD}}{C}`}</InlineMath> = covariance matrix &nbsp;·&nbsp;
          <InlineMath>{`\\textcolor{${BLUE}}{\\mathbf{v}}`}</InlineMath> = eigenvector (a direction) &nbsp;·&nbsp;
          <InlineMath>{`\\textcolor{${RED}}{\\lambda}`}</InlineMath> = eigenvalue (variance in that direction)
        </div>
      </div>

      {/* Interpretation */}
      <div style={{
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, padding: "1rem 1.5rem", marginBottom: "1rem",
      }}>
        <div style={{ fontSize: 15, marginBottom: 15 }}>
          For our 3D data, <InlineMath>{`\\textcolor{${GOLD}}{C}`}</InlineMath> is <InlineMath>{`3 \\times 3`}</InlineMath>, 
          so there are <strong>3 eigenvector–eigenvalue pairs</strong>:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>
              Eigenvectors <InlineMath>{`\\textcolor{${BLUE}}{\\mathbf{v_i}}`}</InlineMath> — principal directions
            </div>
            <ul style={{ fontSize: 15, lineHeight: 1.8 }}>
              <li>Represent the principal directions or axes of the data cloud.</li>
              <li>Ranked by their eigenvalues — largest first.</li>
              <li>The eigenvector with the <strong>largest eigenvalue</strong> points in the direction of maximum variance.</li>
              <li>All eigenvectors are <strong>orthogonal</strong> (perpendicular) to each other.</li>
            </ul>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>
              Eigenvalues <InlineMath>{`\\textcolor{${RED}}{\\lambda_i}`}</InlineMath> — strength of each direction
            </div>
            <ul style={{ fontSize: 15, lineHeight: 1.8 }}>
              <li>Indicate the <strong>variance</strong> (spread) along each principal direction.</li>
              <li>A large eigenvalue means that direction contains lots of information.</li>
              <li>A small eigenvalue means the direction can be discarded with little loss.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Eigenvectors table */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.5rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, marginBottom: 10 }}>
          Computed eigenvectors (sorted by eigenvalue, descending):
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
            <thead>
              <tr>
                {["Component", "Eigenvector v (direction)", "Eigenvalue λ", "Variance explained", "Cumulative"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "0.5px solid var(--border)", color: "var(--text-muted)", fontWeight: 500, fontSize: 14 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eigenvectors.map((v, i) => {
                const cum = eigenvalues.slice(0, i + 1).reduce((s, x) => s + x, 0);
                const colors = [GOLD, BLUE, TEAL];
                return (
                  <tr key={i} style={{ borderBottom: "0.5px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ color: colors[i], fontWeight: 500 }}><InlineMath>{`\\mathbf{v_${i+1}}`}</InlineMath> (PC{i + 1})</span>
                    </td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 14 }}>
                      [{v.map(x => x.toFixed(3)).join(", ")}]
                    </td>
                    <td style={{ padding: "8px 10px", color: colors[i], fontWeight: 500 }}>
                      {eigenvalues[i].toFixed(4)}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: "var(--border)", borderRadius: 3, minWidth: 60 }}>
                          <div style={{ height: "100%", background: colors[i], borderRadius: 3, width: `${(eigenvalues[i] / totalVar * 100).toFixed(1)}%` }} />
                        </div>
                        <span>{(eigenvalues[i] / totalVar * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {(cum / totalVar * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full-width rotatable 3D + legend */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem" }}>
          <div style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 6 }}>Centered data with principal axes (drag to rotate)</div>
          <div style={{ height: 340 }}>
            <Scatter3D pts={centeredPts} isDark={isDark} eigenvectors={eigenvectors} showAxes={true} />
          </div>
        </div>
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 12 }}>Reading the diagram:</div>
          {[
            { color: GOLD, label: "PC1", desc: `Longest axis — ${(eigenvalues[0]/totalVar*100).toFixed(1)}% of variance. The direction the data stretches most.` },
            { color: BLUE, label: "PC2", desc: `Second axis — ${(eigenvalues[1]/totalVar*100).toFixed(1)}% of variance. Orthogonal to PC1.` },
            { color: TEAL, label: "PC3", desc: `Shortest axis — ${(eigenvalues[2]/totalVar*100).toFixed(1)}% of variance. Discarded when reducing to 2D.` },
          ].map(({ color, label, desc }) => (
            <div key={label} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 4, borderRadius: 2, background: color, flexShrink: 0, marginTop: 3 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color }}>{label}</div>
                <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
          <Callout borderColor={GREEN} bg={isDark ? "rgba(29,158,117,0.08)" : "rgba(29,158,117,0.06)"}>
            Eigenvectors are always <strong>orthogonal</strong> to each other — they form a new coordinate system
            aligned with the data's natural axes.
          </Callout>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 4: DIMENSION REDUCTION ──────────────────────────────────────────────

function StepReduction({ pca, centeredPts, projPts, isDark }) {
  const [pickedIdx, setPickedIdx] = useState(0);
  if (!pca) return null;
  const { eigenvalues, eigenvectors, mean3, totalVar } = pca;
  const kept    = eigenvalues[0] + eigenvalues[1];
  const keptPct = (kept / totalVar * 100).toFixed(1);
  const lostPct = (eigenvalues[2] / totalVar * 100).toFixed(1);

  return (
    <div>
      <h2>Step 4: Dimension reduction — 3D → 2D</h2>
      <br />
      <p style={{ marginBottom: "1rem" }}>
        We keep only the top 2 eigenvectors (PC1 and PC2) and project every point onto them.
        Each 3D point becomes a 2D point by taking the dot product with each eigenvector:
      </p>

      {/* Projection formula — larger font */}
      <div style={{
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1.25rem",
      }}>
        <div style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 10, fontFamily: "system-ui" }}>Projection formula:</div>
        <div style={{ fontSize: 16 }}>
          <div dangerouslySetInnerHTML={{ __html: katex.renderToString(
            `\\textcolor{${GOLD}}{\\mathbf{p_{pc1}}} = \\textcolor{${GOLD}}{\\mathbf{v}_1}^T \\cdot \\mathbf{p}' = v_{1x}x' + v_{1y}y' + v_{1z}z'`,
            { throwOnError: false, displayMode: true }
          ) }} />
          <div dangerouslySetInnerHTML={{ __html: katex.renderToString(
            `\\textcolor{${BLUE}}{\\mathbf{p_{pc2}}} = \\textcolor{${BLUE}}{\\mathbf{v}_2}^T \\cdot \\mathbf{p}' = v_{2x}x' + v_{2y}y' + v_{2z}z'`,
            { throwOnError: false, displayMode: true }
          ) }} />
        </div>
        <div style={{ fontSize: 15, color: "var(--text-muted)", marginTop: 6, fontFamily: "system-ui" }}>
          <InlineMath>{"\\mathbf{p}'"}</InlineMath> = centered point &nbsp;·&nbsp;
          <InlineMath>{`\\textcolor{${GOLD}}{\\mathbf{v}_1}`}</InlineMath>, <InlineMath>{`\\textcolor{${BLUE}}{\\mathbf{v}_2}`}</InlineMath> = first two eigenvectors (rows of projection matrix)
        </div>
      </div>

      {/* Before / After — larger graphs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 6 }}>3D centered data (drag to rotate)</div>
          <div style={{ height: 320 }}>
            <Scatter3D pts={centeredPts} isDark={isDark} eigenvectors={pca.eigenvectors} showAxes={true} highlightIdx={pickedIdx} />
          </div>
        </div>
        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 24 }}>→</div>
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 6 }}>2D projection (PC1 × PC2)</div>
          <div style={{ height: 320 }}>
            <Scatter2D projPts={projPts} isDark={isDark} highlightIdx={pickedIdx} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: "1rem" }}>
        <MetricCard label="Dimensions before" value="3" sub="x, y, z" />
        <MetricCard label="Dimensions after"  value="2" sub="PC1, PC2" accent={GREEN} />
        <MetricCard label="Variance retained" value={`${keptPct}%`} sub={`Lost only ${lostPct}% (PC3)`} accent={GOLD} />
      </div>

      <Callout borderColor={GREEN} bg={isDark ? "rgba(29,158,117,0.08)" : "rgba(29,158,117,0.06)"}>
        <strong>We went from 3D to 2D retaining {keptPct}% of the variance.</strong>{" "}
        The discarded dimension (PC3) carried only {lostPct}% of the information.
        In real datasets with hundreds of dimensions, PCA can often retain 80–95% of variance
        in just dozens of components.
      </Callout>

      <Divider />

      {/* ── TRACE A POINT ── */}
      {(() => {
        const n   = centeredPts.length;
        const cp  = centeredPts[pickedIdx];
        const v1  = eigenvectors[0], v2 = eigenvectors[1];
        const pc1 = v1[0]*cp.x + v1[1]*cp.y + v1[2]*cp.z;
        const pc2 = v2[0]*cp.x + v2[1]*cp.y + v2[2]*cp.z;
        const ox  = cp.x + mean3[0], oy = cp.y + mean3[1], oz = cp.z + mean3[2];

        const row = (label, content) => (
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "0.5rem", alignItems: "start", padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
            <div style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500, paddingTop: 2 }}>{label}</div>
            <div className="trace-row-content" style={{ fontSize: 17, lineHeight: 1.75, fontFamily: "KaTeX_Main, serif" }}>{content}</div>
          </div>
        );

        const term = (coef, coord, val, color) => (
          <span>
            <span style={{ color }}>{coef.toFixed(4)}</span>
            <span> * </span>
            <span>{coord}</span>
            <span>({val.toFixed(4)})</span>
          </span>
        );

        return (
          <div>
            <style>{`.trace-row-content .katex { font-size: 1em; }`}</style>
            <h3 style={{ marginBottom: "0.75rem" }}>Trace a point</h3>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: "1rem", lineHeight: 1.7 }}>
              Pick any point and see the full numeric walkthrough — original coordinates → center → project onto PC1 and PC2.<br />
              Recall&nbsp;
              <span style={{ fontSize: "1.21em", fontFamily: "KaTeX_Main, serif" }}>
                <span style={{ color: GOLD }}>PC1 = [{v1.map(x => x.toFixed(4)).join(", ")}]</span>
                ,&ensp;
                <span style={{ color: BLUE }}>PC2 = [{v2.map(x => x.toFixed(4)).join(", ")}]</span>
              </span>
            </p>

            {/* Slider */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "1.25rem" }}>
              <span style={{ fontSize: 14, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Point #</span>
              <input
                type="range" min={0} max={n - 1} value={pickedIdx}
                onChange={e => setPickedIdx(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{
                fontSize: 13, fontWeight: 600, color: "#ff3bff",
                minWidth: 40, textAlign: "right",
              }}>
                {pickedIdx}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={{ padding: "3px 10px", fontSize: 14 }} onClick={() => setPickedIdx(i => Math.max(0, i - 1))}>−</button>
                <button style={{ padding: "3px 10px", fontSize: 14 }} onClick={() => setPickedIdx(i => Math.min(n - 1, i + 1))}>+</button>
              </div>
            </div>

            {/* Walkthrough table */}
            <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "0.75rem 1.25rem", marginBottom: "1rem" }}>
              {row(
                "1. Original point",
                <span>
                  x = <strong>{ox.toFixed(4)}</strong>,&ensp;
                  y = <strong>{oy.toFixed(4)}</strong>,&ensp;
                  z = <strong>{oz.toFixed(4)}</strong>
                </span>
              )}
              {row(
                "2. Subtract mean",
                <span>
                  <InlineMath>{`\\mathbf{p}' = \\mathbf{p} - \\bar{\\mathbf{p}}`}</InlineMath>
                  <span style={{ marginLeft: 10 }}>
                    = (<strong>{cp.x.toFixed(4)}</strong>,&ensp;
                    <strong>{cp.y.toFixed(4)}</strong>,&ensp;
                    <strong>{cp.z.toFixed(4)}</strong>)
                  </span>
                </span>
              )}
              {row(
                <>3. Dot with <InlineMath>{"\\mathbf{v}_1"}</InlineMath> (PC1)</>,
                <span>
                  {term(v1[0], null, cp.x, GOLD)}
                  <span style={{ color: "var(--text-muted)" }}> + </span>
                  {term(v1[1], null, cp.y, GOLD)}
                  <span style={{ color: "var(--text-muted)" }}> + </span>
                  {term(v1[2], null, cp.z, GOLD)}
                  <span style={{ color: "var(--text-muted)" }}> = </span>
                  <strong style={{ color: GOLD }}>{pc1.toFixed(4)}</strong>
                </span>
              )}
              {row(
                <>4. Dot with <InlineMath>{"\\mathbf{v}_2"}</InlineMath> (PC2)</>,
                <span>
                  {term(v2[0], null, cp.x, BLUE)}
                  <span style={{ color: "var(--text-muted)" }}> + </span>
                  {term(v2[1], null, cp.y, BLUE)}
                  <span style={{ color: "var(--text-muted)" }}> + </span>
                  {term(v2[2], null, cp.z, BLUE)}
                  <span style={{ color: "var(--text-muted)" }}> = </span>
                  <strong style={{ color: BLUE }}>{pc2.toFixed(4)}</strong>
                </span>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "0.5rem", alignItems: "center", padding: "10px 0" }}>
                <div style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500 }}>5. Final 2D point</div>
                <span style={{ fontSize: 17 }}>
                  <span style={{ fontFamily: "KaTeX_Main, serif"}}>PC1 = <strong style={{ color: GOLD }}>{pc1.toFixed(4)}</strong>,&ensp;</span>
                  <span style={{ fontFamily: "KaTeX_Main, serif"}}>PC2 = <strong style={{ color: BLUE }}>{pc2.toFixed(4)}</strong></span>
                  <span style={{ marginLeft: 12, color: "#ff3bff", fontSize: 15 }}> (highlighted in both plots above)</span>
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      <br />
      <Callout borderColor={BLUE} bg={isDark ? "rgba(79,140,255,0.08)" : "rgba(79,140,255,0.06)"}>
        <strong>What we did, step by step:</strong><br />
        1. Subtracted the mean → data centered at origin<br />
        2. Computed covariance matrix C → captured how dimensions co-vary<br />
        3. Eigendecomposition of C → found directions of maximum variance<br />
        4. Projected onto top-2 eigenvectors → dropped the least informative dimension
      </Callout>

    </div>
  );
}
