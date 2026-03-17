import { useState, useEffect, useRef } from "react";
import { Matrix, EigenvalueDecomposition } from 'ml-matrix';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const GOLD   = "#F5A623";
const BLUE   = "#4F8CFF";
const GREEN  = "#1D9E75";
const RED    = "#E85D24";
const PT_CLR = "rgba(195, 29, 29, 0.6)";

// ─── PCA MATH ────────────────────────────────────────────────────────────────

function seededRandom(seed) {
  let x = seed;
  return () => { x = Math.sin(x) * 10000; return x - Math.floor(x); };
}

function randNormal(r) {
  let u = 0, v = 0;
  while (!u) u = r(); while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generateData(n = 120, seed = 42) {
  const r = seededRandom(seed), rn = () => randNormal(r);
  const raw = Array.from({ length: n }, () => {
    const t = rn(); return { x: t, y: 0.75 * t + 0.22 * rn() };
  });
  const mx = raw.reduce((s, p) => s + p.x, 0) / n;
  const my = raw.reduce((s, p) => s + p.y, 0) / n;
  return raw.map((p) => ({ x: p.x - mx, y: p.y - my }));
}

function computePCA(pts) {
  const n = pts.length;
  const X = new Matrix(pts.map(p => [p.x, p.y]));
  // covariance matrix
  const cov = X.transpose().mmul(X).div(n);
  const evd = new EigenvalueDecomposition(cov);
  const eigval = evd.realEigenvalues;
  const eigvec = evd.eigenvectorMatrix;
  const i = eigval[0] > eigval[1] ? 0 : 1;
  const vx = eigvec.get(0, i);
  const vy = eigvec.get(1, i);
  const angle = (Math.atan2(vy, vx) * 180 / Math.PI + 360) % 180;
  return {
    pc1Var: Math.max(...eigval),
    pc2Var: Math.min(...eigval),
    totalVar: eigval[0] + eigval[1],
    idealAngle: angle
  };
}

function projectPoints(pts, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return pts.map((p) => ({ pc1: p.x * cos + p.y * sin, pc2: -p.x * sin + p.y * cos }));
}

function varianceOf(arr) {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

// ─── CANVAS HELPERS ───────────────────────────────────────────────────────────

function setupCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawBaseGrid(ctx, w, h, pad, isDark) {
  const cx = w / 2, cy = h / 2, range = 2.8;
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  ctx.lineWidth = 0.5;
  for (let v = -2; v <= 2; v++) {
    const px = cx + (v / range) * ((w - pad * 2) / 2);
    const py = cy + (v / range) * ((h - pad * 2) / 2);
    ctx.beginPath(); ctx.moveTo(px, pad); ctx.lineTo(px, h - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, py); ctx.lineTo(w - pad, py); ctx.stroke();
  }
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
  ctx.lineWidth = 0.75; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, pad); ctx.lineTo(cx, h - pad); ctx.stroke();
  ctx.setLineDash([]);
  return { cx, cy, range };
}

function toS(vx, vy, cx, cy, range, w, h, pad) {
  return {
    sx: cx + (vx / range) * ((w - pad * 2) / 2),
    sy: cy - (vy / range) * ((h - pad * 2) / 2),
  };
}

function drawArrowLine(ctx, x1, y1, x2, y2, color, lw = 2.5) {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len, hl = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hl * ux + hl * 0.4 * uy, y2 - hl * uy - hl * 0.4 * ux);
  ctx.lineTo(x2 - hl * ux - hl * 0.4 * uy, y2 - hl * uy + hl * 0.4 * ux);
  ctx.closePath(); ctx.fill();
}

// ─── ORIGINAL SPACE CANVAS
// Data points NEVER move. Only the two axes rotate.
function OriginalSpaceCanvas({ pts, angleDeg, isDark }) {
  const ref = useRef(null);
  useEffect(() => {
    const s = setupCanvas(ref.current); if (!s) return;
    const { ctx, w, h } = s;
    ctx.clearRect(0, 0, w, h);
    const pad = 32;
    const { cx, cy, range } = drawBaseGrid(ctx, w, h, pad, isDark);

    // Points at original (x, y) — fixed, never rotate
    pts.forEach(({ x, y }) => {
      const { sx, sy } = toS(x, y, cx, cy, range, w, h, pad);
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = PT_CLR; ctx.fill();
    });

    // Rotating axes
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad), vl = 2.3;
    const { sx: ax1, sy: ay1 } = toS(-cos * vl, -sin * vl, cx, cy, range, w, h, pad);
    const { sx: ax2, sy: ay2 } = toS(cos * vl, sin * vl, cx, cy, range, w, h, pad);
    drawArrowLine(ctx, ax1, ay1, ax2, ay2, GOLD, 2.5);
    ctx.fillStyle = GOLD; ctx.font = "500 11px system-ui"; ctx.textAlign = "left";
    ctx.fillText("PC1", ax2 + 5, ay2 + 4);

    const { sx: bx1, sy: by1 } = toS(sin * vl, -cos * vl, cx, cy, range, w, h, pad);
    const { sx: bx2, sy: by2 } = toS(-sin * vl, cos * vl, cx, cy, range, w, h, pad);
    drawArrowLine(ctx, bx1, by1, bx2, by2, BLUE, 2);
    ctx.fillStyle = BLUE;
    ctx.fillText("PC2", bx2 + 5, by2 + 4);
  });
  return <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />;
}

// ─── PROJECTED SPACE CANVAS
// PC1 axis is always horizontal. Points move to show their projection coordinate.
function ProjectedSpaceCanvas({ pts, angleDeg, isDark }) {
  const ref = useRef(null);
  useEffect(() => {
    const s = setupCanvas(ref.current); if (!s) return;
    const { ctx, w, h } = s;
    ctx.clearRect(0, 0, w, h);
    const pad = 32;
    const { cx, cy, range } = drawBaseGrid(ctx, w, h, pad, isDark);

    // Project points — they move as angle changes
    projectPoints(pts, angleDeg).forEach(({ pc1, pc2 }) => {
      const { sx, sy } = toS(pc1, pc2, cx, cy, range, w, h, pad);
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = PT_CLR; ctx.fill();
    });

    // Fixed axes — PC1 horizontal, PC2 vertical
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = "500 11px system-ui"; ctx.textAlign = "left";
    ctx.fillText("PC1", w - pad + 5, cy + 4);

    ctx.strokeStyle = BLUE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, pad); ctx.lineTo(cx, h - pad); ctx.stroke();
    ctx.fillStyle = BLUE;
    ctx.fillText("PC2", cx + 5, pad + 2);
  });
  return <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />;
}

// ─── 1D STRIP CANVAS
function Strip1DCanvas({ pts, angleDeg, axis, isDark }) {
  const ref = useRef(null);
  const color = axis === "pc1" ? GOLD : BLUE;

  useEffect(() => {
    const s = setupCanvas(ref.current); if (!s) return;
    const { ctx, w, h } = s;
    ctx.clearRect(0, 0, w, h);
    const pad = 40, cy = h / 2, range = 2.8;
    const toSx = (v) => pad + ((v + range) / (range * 2)) * (w - pad * 2);

    // axis line
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
    ctx.fillStyle = color; ctx.font = "500 11px system-ui"; ctx.textAlign = "left";
    ctx.fillText(axis === "pc1" ? "PC1" : "PC2", w - pad + 5, cy + 4);

    // ticks
    for (let v = -2; v <= 2; v++) {
      const sx = toSx(v);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)";
      ctx.lineWidth = 0.75;
      ctx.beginPath(); ctx.moveTo(sx, cy - 5); ctx.lineTo(sx, cy + 5); ctx.stroke();
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
      ctx.font = "10px system-ui"; ctx.textAlign = "center";
      ctx.fillText(v, sx, cy + 17);
    }

    // points with jitter so overlap is visible
    const proj = projectPoints(pts, angleDeg);
    const jitterRng = seededRandom(99);
    proj.forEach((p) => {
      const val = axis === "pc1" ? p.pc1 : p.pc2;
      const sx = toSx(Math.max(-range, Math.min(range, val)));
      const jitter = (jitterRng() - 0.5) * h * 0.5;
      ctx.beginPath(); ctx.arc(sx, cy + jitter, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = axis === "pc1" ? "rgba(245,166,35,0.55)" : "rgba(79,140,255,0.55)";
      ctx.fill();
    });

    // variance label
    const vals = proj.map((p) => (axis === "pc1" ? p.pc1 : p.pc2));
    const v = varianceOf(vals);
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
    ctx.font = "11px system-ui"; ctx.textAlign = "left";
    ctx.fillText(`variance = ${v.toFixed(3)}`, pad, 16);
  });

  return <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />;
}

// ─── SMALL UI PRIMITIVES ─────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "var(--metric-bg)", border: "0.5px solid var(--border)",
      borderRadius: 8, padding: "10px 14px",
      borderLeft: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function VarBar({ pct, color }) {
  return (
    <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", borderRadius: 3, background: color, width: `${Math.min(pct,100)}%`, transition: "width 0.04s" }} />
    </div>
  );
}

function Callout({ children, borderColor, bg }) {
  return (
    <div style={{
      borderLeft: `3px solid ${borderColor}`, background: bg,
      borderRadius: "0 8px 8px 0", padding: "10px 14px",
      fontSize: 13.5, lineHeight: 1.65, color: "var(--text-secondary)",
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: "0.5px", background: "var(--border)", margin: "2.5rem 0" }} />;
}

function Tag({ children }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
      color: "var(--text-muted)", background: "var(--surface)",
      border: "0.5px solid var(--border)", borderRadius: 20, padding: "3px 10px",
      display: "inline-block", marginBottom: "0.75rem",
    }}>
      {children}
    </span>
  );
}

// ─── DATA (computed once at module level) ─────────────────────────────────────

const PTS = generateData(120, 42);
const PCA = computePCA(PTS);
const IDEAL = Math.round(PCA.idealAngle);

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function PCAApp() {
  const [angle, setAngle] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  const proj   = projectPoints(PTS, angle);
  const pc1V   = varianceOf(proj.map((p) => p.pc1));
  const pc1Pct = (pc1V / PCA.totalVar) * 100;
  const diff   = Math.min(Math.abs(angle - IDEAL), 180 - Math.abs(angle - IDEAL));
  const isClose = diff <= 0.5;

  const theme = isDark ? {
    "--bg": "#111110", "--surface": "#1a1a18", "--metric-bg": "#161614",
    "--border": "rgba(255,255,255,0.09)", "--border-strong": "rgba(255,255,255,0.28)",
    "--text-primary": "#edece8", "--text-secondary": "#9a9890", "--text-muted": "#5c5b56","--text-highlighted": "#d3a47b",
  } : {
    "--bg": "#fafaf8", "--surface": "#ffffff", "--metric-bg": "#f4f4f2",
    "--border": "rgba(0,0,0,0.08)", "--border-strong": "rgba(0,0,0,0.22)",
    "--text-primary": "#1a1a17", "--text-secondary": "#52524e", "--text-muted": "#9a9890", "--text-highlighted": "#b25d12",
  };

  return (
    <div style={{ ...theme, background: "var(--bg)", color: "var(--text-primary)", minHeight: "100vh", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

        {/* ── HERO ── */}
        <h1 style={{ fontSize: 30, fontWeight: 500, lineHeight: 1.2, marginBottom: "0.75rem" }}>
          Principal Component Analysis
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: "2rem" }}>
          A technique for reducing the number of dimensions in a dataset while keeping
          as much of the meaningful variation as possible.
        </p>

        {/* ── WHAT IS PCA ── */}
        <h2>What is PCA?</h2><br />
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.2rem 1.5rem", marginBottom: "2rem" }}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0 }}>
            Real-world datasets often have dozens or hundreds of features. Many of these features
            are <em>correlated</em> — they carry overlapping information. PCA finds a <strong style={{ color: "var(--text-highlighted)" }}>new set of axes </strong>
            that point in the directions of <strong style={{ color: "var(--text-highlighted)" }}>maximum variation</strong>, letting
            you describe the same data with fewer numbers without losing much information.
          </p>
        </div>

        {/* ── GOAL ── */}
        <h2>The goal</h2>
        <br />
        <Callout borderColor={GOLD} bg={isDark ? "rgba(245,166,35,0.07)" : "rgba(245,166,35,0.06)"}>
          Reduce the dimensionality of large, complex, highly correlated datasets while preserving
          as much <strong style={{ color: "var(--text-primary)" }}>variation</strong> (information) as possible.
        </Callout>

        <div style={{ height: "2rem" }} />

        {/* ── WHY REDUCE ── */}
        <h2>Why reduce dimensions?</h2><br />
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
            <div key={n} style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>{n}</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.65 }}>{body}</div>
            </div>
          ))}
        </div>

        <Divider />

        {/* ── INTERACTIVE ── */}
        <h2>2D Example — find the principal component</h2><br />
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.75, marginBottom: "1.25rem" }}>
          Below is a 2D dataset. Drag the slider to rotate the two axes.{" "}
          Rotate it such that: <br />
          <ul style={{marginLeft: "2rem"}}>
            <li>PC1 captures the <b>most</b> variations: The spread of points along PC1 axis is maximised.</li>
            <li>PC1 captures the <b>least</b> variations.</li>
          </ul> 
        </p>

        {/* Dual scatter plots */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 6 }}>
              Original space — points fixed, axes rotate
            </div>
            <div style={{ height: 250 }}>
              <OriginalSpaceCanvas pts={PTS} angleDeg={angle} isDark={isDark} />
            </div>
          </div>
          <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 6 }}>
              Projected space — axes fixed, points shift
            </div>
            <div style={{ height: 250 }}>
              <ProjectedSpaceCanvas pts={PTS} angleDeg={angle} isDark={isDark} />
            </div>
          </div>
        </div>

        {/* Slider */}
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 16px", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Rotate axes</span>
            <input type="range" min="0" max="179" step="1" value={angle} style={{ flex: 1 }}
              onChange={(e) => { setAngle(parseInt(e.target.value)); setRevealed(false); }} />
            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 38, textAlign: "right" }}>{angle}°</span>
          </div>
        </div>

        {/* Metrics row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: "0.75rem" }}>
          <div style={{ background: "var(--metric-bg)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${GOLD}` }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>PC1 variance captured</div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{pc1V.toFixed(3)}</div>
            <VarBar pct={pc1Pct} color={isClose ? GREEN : GOLD} />
          </div>
          <MetricCard label="% of total variance (PC1)" value={`${pc1Pct.toFixed(1)}%`} sub="at current angle" accent={isClose ? GREEN : undefined} />
          <MetricCard label="Ideal PC1 angle" value={revealed ? `${IDEAL}°` : "— °"} sub="try to find it!" />
        </div>

        {/* Insight */}
        <div style={{ marginBottom: "1rem" }}>
          <Callout
            borderColor={isClose ? GREEN : pc1Pct > 70 ? BLUE : "var(--border-strong)"}
            bg={isClose ? (isDark ? "rgba(29,158,117,0.08)" : "rgba(29,158,117,0.06)") : pc1Pct > 70 ? (isDark ? "rgba(79,140,255,0.08)" : "rgba(79,140,255,0.06)") : "var(--surface)"}
          >
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
        <h3>Why choose the direction of maximum variance?</h3><br />
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.75, marginBottom: "1.25rem" }}>
          When projecting data down to fewer dimensions, we must choose which directions to keep.
          The two plots below show what happens when you project the same data onto PC1 vs PC2
          at the ideal angle. The spread of points in the result tells you how much information survives.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
          {/* PC1 */}
          <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: GOLD, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500 }}>Projection onto PC1 — maximum variance ✓</span>
            </div>
            <div style={{ height: 130 }}>
              <Strip1DCanvas pts={PTS} angleDeg={IDEAL} axis="pc1" isDark={isDark} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Callout borderColor={GREEN} bg={isDark ? "rgba(29,158,117,0.08)" : "rgba(29,158,117,0.06)"}>
                Points spread widely. Most distinction between them survives.{" "}
                <strong>{(PCA.pc1Var / PCA.totalVar * 100).toFixed(1)}% of variance retained.</strong>
              </Callout>
            </div>
          </div>

          {/* PC2 */}
          <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: BLUE, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500 }}>Projection onto PC2 — minimum variance ✗</span>
            </div>
            <div style={{ height: 130 }}>
              <Strip1DCanvas pts={PTS} angleDeg={IDEAL} axis="pc2" isDark={isDark} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Callout borderColor={RED} bg={isDark ? "rgba(232,93,36,0.08)" : "rgba(232,93,36,0.06)"}>
                Points cluster tightly. Most distinction is destroyed.{" "}
                <strong>Only {(PCA.pc2Var / PCA.totalVar * 100).toFixed(1)}% of variance retained.</strong>
              </Callout>
            </div>
          </div>
        </div>

        <Callout borderColor={BLUE} bg={isDark ? "rgba(79,140,255,0.08)" : "rgba(79,140,255,0.06)"}>
          <strong style={{ color: "var(--text-primary)" }}>Key insight:</strong> Variance measures how spread out
          the projected points are. More spread = more distinction between points = more information preserved.
        </Callout>
        <br />
        <Divider />
      </div>
    </div>
  );
}
