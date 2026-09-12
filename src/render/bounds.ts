/** Bound the shadow source to the viewport, rather than the entire sector. */
export function drawBounds(
  ctx: CanvasRenderingContext2D, time: number, mapW: number, mapH: number,
  cx: number, cy: number, w: number, h: number,
): void {
  // Keep segment endpoints outside the viewport, including the glow fringe.
  const padding = 48;
  const left = cx - w / 2 - padding, right = cx + w / 2 + padding;
  const top = cy - h / 2 - padding, bottom = cy + h / 2 + padding;
  const x0 = Math.max(0, left), x1 = Math.min(mapW, right);
  const y0 = Math.max(0, top), y1 = Math.min(mapH, bottom);
  if (x0 > x1 || y0 > y1) return;
  const vertical = (0 >= left && 0 <= right) || (mapW >= left && mapW <= right);
  const horizontal = (0 >= top && 0 <= bottom) || (mapH >= top && mapH <= bottom);
  if (!vertical && !horizontal) return;

  ctx.save();
  ctx.strokeStyle = `rgba(120,80,255,${0.5 + 0.15 * Math.sin(time * 2)})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#7850ff';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  for (const x of [0, mapW]) if (x >= left && x <= right) {
    ctx.moveTo(x, y0); ctx.lineTo(x, y1);
  }
  for (const y of [0, mapH]) if (y >= top && y <= bottom) {
    ctx.moveTo(x0, y); ctx.lineTo(x1, y);
  }
  ctx.stroke();
  ctx.restore();
}
