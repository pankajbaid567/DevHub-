import type * as Y from 'yjs';

/** Logical whiteboard size; the canvas scales it to fit. */
export const BOARD_W = 1600;
export const BOARD_H = 1000;

export type BoardTool = 'pen' | 'highlighter' | 'eraser';

/** Draws one stroke (a Y.Map with points, tool, colour and width) at the given scale. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Y.Map<unknown>, scale: number) {
  const pts = (s.get('points') as Y.Array<number>).toArray();
  if (pts.length < 2) return;
  const tool = s.get('tool') as BoardTool;
  ctx.globalAlpha = tool === 'highlighter' ? 0.35 : 1;
  ctx.strokeStyle = s.get('color') as string;
  ctx.lineWidth = (s.get('width') as number) * (tool === 'highlighter' ? 3 : 1) * scale;
  ctx.beginPath();
  ctx.moveTo(pts[0]! * scale, pts[1]! * scale);
  if (pts.length === 2) ctx.lineTo(pts[0]! * scale + 0.01, pts[1]! * scale);
  // Quadratic smoothing through segment midpoints.
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = ((pts[i]! + pts[i + 2]!) / 2) * scale;
    const my = ((pts[i + 1]! + pts[i + 3]!) / 2) * scale;
    ctx.quadraticCurveTo(pts[i]! * scale, pts[i + 1]! * scale, mx, my);
  }
  if (pts.length >= 4) ctx.lineTo(pts[pts.length - 2]! * scale, pts[pts.length - 1]! * scale);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
