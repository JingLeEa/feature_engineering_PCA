import { useRef, useEffect } from "react";
import { setupCanvas } from "./canvasUtils.js";
import { projectPoints2D, varianceOf, seededRandom } from "../../math/pca.js";

const GOLD = "#F5A623";
const BLUE = "#4F8CFF";

/**
 * Shows data projected onto a single axis as a 1D strip.
 * Points are jittered vertically so overlapping values are visible.
 * axis: "pc1" | "pc2"
 */
export default function Strip1DCanvas({ pts, angleDeg, axis, isDark }) {
  const ref = useRef(null);
  const color = axis === "pc1" ? GOLD : BLUE;
  const label = axis === "pc1" ? "PC1" : "PC2";

  useEffect(() => {
    const s = setupCanvas(ref.current);
    if (!s) return;
    const { ctx, w, h } = s;
    ctx.clearRect(0, 0, w, h);
    const pad = 40, cy = h / 2, range = 2.8;
    const toSx = (v) => pad + ((v + range) / (range * 2)) * (w - pad * 2);

    // Axis line
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
    ctx.fillStyle = color; ctx.font = "500 11px system-ui"; ctx.textAlign = "left";
    ctx.fillText(label, w - pad + 5, cy + 4);

    // Tick marks
    for (let v = -2; v <= 2; v++) {
      const sx = toSx(v);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)";
      ctx.lineWidth = 0.75;
      ctx.beginPath(); ctx.moveTo(sx, cy - 5); ctx.lineTo(sx, cy + 5); ctx.stroke();
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
      ctx.font = "10px system-ui"; ctx.textAlign = "center";
      ctx.fillText(v, sx, cy + 17);
    }

    // Points with jitter
    const proj = projectPoints2D(pts, angleDeg);
    const jitterRng = seededRandom(99);
    proj.forEach((p) => {
      const val = axis === "pc1" ? p.pc1 : p.pc2;
      const sx = toSx(Math.max(-range, Math.min(range, val)));
      const jitter = (jitterRng() - 0.5) * h * 0.5;
      ctx.beginPath();
      ctx.arc(sx, cy + jitter, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = axis === "pc1" ? "rgba(245,166,35,0.55)" : "rgba(79,140,255,0.55)";
      ctx.fill();
    });

    // Variance annotation
    const vals = proj.map((p) => (axis === "pc1" ? p.pc1 : p.pc2));
    const v = varianceOf(vals);
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
    ctx.font = "11px system-ui"; ctx.textAlign = "left";
    ctx.fillText(`variance = ${v.toFixed(3)}`, pad, 16);
  });

  return (
    <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
  );
}
