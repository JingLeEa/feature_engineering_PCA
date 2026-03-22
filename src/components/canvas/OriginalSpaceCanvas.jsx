import { useRef, useEffect } from "react";
import { setupCanvas, drawBaseGrid, toScreen, drawArrowLine } from "./canvasUtils.js";

const GOLD = "#F5A623";
const BLUE = "#4F8CFF";
const PT_CLR = "rgba(195, 29, 29, 0.6)";

/**
 * Left scatter plot for the 2D intuition section.
 * Data points are drawn at their original (x, y) positions and NEVER move.
 * Only the two PC axes rotate with angleDeg.
 */
export default function OriginalSpaceCanvas({ pts, angleDeg, isDark }) {
  const ref = useRef(null);

  useEffect(() => {
    const s = setupCanvas(ref.current);
    if (!s) return;
    const { ctx, w, h } = s;
    ctx.clearRect(0, 0, w, h);
    const pad = 32;
    const { cx, cy, range } = drawBaseGrid(ctx, w, h, pad, isDark);

    // Fixed data points
    pts.forEach(({ x, y }) => {
      const { sx, sy } = toScreen(x, y, cx, cy, range, w, h, pad);
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = PT_CLR;
      ctx.fill();
    });

    // Rotating axes
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad), vl = 2.3;

    const { sx: ax1, sy: ay1 } = toScreen(-cos * vl, -sin * vl, cx, cy, range, w, h, pad);
    const { sx: ax2, sy: ay2 } = toScreen( cos * vl,  sin * vl, cx, cy, range, w, h, pad);
    drawArrowLine(ctx, ax1, ay1, ax2, ay2, GOLD, 2.5);
    ctx.fillStyle = GOLD; ctx.font = "500 13px system-ui"; ctx.textAlign = "left";
    ctx.fillText("PC1", ax2 + 5, ay2 + 4);

    const { sx: bx1, sy: by1 } = toScreen( sin * vl, -cos * vl, cx, cy, range, w, h, pad);
    const { sx: bx2, sy: by2 } = toScreen(-sin * vl,  cos * vl, cx, cy, range, w, h, pad);
    drawArrowLine(ctx, bx1, by1, bx2, by2, BLUE, 2);
    ctx.fillStyle = BLUE;
    ctx.fillText("PC2", bx2 + 5, by2 + 4);
  });

  return (
    <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
  );
}
