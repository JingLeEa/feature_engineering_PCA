/** Set up a canvas for crisp HiDPI rendering. Returns { ctx, w, h } */
export function setupCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 300;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** Draw background grid and dashed origin axes. Returns { cx, cy, range } */
export function drawBaseGrid(ctx, w, h, pad, isDark) {
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

/** Convert data coords → screen pixels */
export function toScreen(vx, vy, cx, cy, range, w, h, pad) {
  return {
    sx: cx + (vx / range) * ((w - pad * 2) / 2),
    sy: cy - (vy / range) * ((h - pad * 2) / 2),
  };
}

/** Draw an arrow line with a solid arrowhead */
export function drawArrowLine(ctx, x1, y1, x2, y2, color, lw = 2.5) {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len, hl = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hl * ux + hl * 0.4 * uy, y2 - hl * uy - hl * 0.4 * ux);
  ctx.lineTo(x2 - hl * ux - hl * 0.4 * uy, y2 - hl * uy + hl * 0.4 * ux);
  ctx.closePath(); ctx.fill();
}
