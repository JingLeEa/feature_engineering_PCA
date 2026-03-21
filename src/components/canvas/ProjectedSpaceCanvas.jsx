import { useRef, useEffect } from "react";
import { setupCanvas, drawBaseGrid, toScreen } from "./canvasUtils.js";
import { projectPoints2D } from "../../math/pca.js";

const GOLD = "#F5A623";
const BLUE = "#4F8CFF";
const PT_CLR = "rgba(195, 29, 29, 0.6)";

/**
 * Right scatter plot for the 2D intuition section.
 * PC1 is always horizontal, PC2 always vertical.
 * Points re-project each render to show the rotated coordinates.
 */
export default function ProjectedSpaceCanvas({ pts, angleDeg, isDark }) {
  const ref = useRef(null);

  useEffect(() => {
    const s = setupCanvas(ref.current);
    if (!s) return;
    const { ctx, w, h } = s;
    ctx.clearRect(0, 0, w, h);
    const pad = 32;
    const { cx, cy, range } = drawBaseGrid(ctx, w, h, pad, isDark);

    // Project points — they move as angle changes
    projectPoints2D(pts, angleDeg).forEach(({ pc1, pc2 }) => {
      const { sx, sy } = toScreen(pc1, pc2, cx, cy, range, w, h, pad);
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = PT_CLR;
      ctx.fill();
    });

    // Fixed axes
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = "500 11px system-ui"; ctx.textAlign = "left";
    ctx.fillText("PC1", w - pad + 5, cy + 4);

    ctx.strokeStyle = BLUE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, pad); ctx.lineTo(cx, h - pad); ctx.stroke();
    ctx.fillStyle = BLUE;
    ctx.fillText("PC2", cx + 5, pad + 2);
  });

  return (
    <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
  );
}
