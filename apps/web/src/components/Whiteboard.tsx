import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import * as Y from 'yjs';
import { Download, Eraser, Highlighter, Pen, Redo2, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { DOC_BOARD } from '@devhub/shared';
import type { SessionDoc } from '../lib/useSessionDoc';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { Dialog } from './ui/primitives';

/** Logical board size: every participant sees the same picture whatever their screen size. */
const MAX_STROKES = 3_000;
const ERASER_RADIUS = 14;
const LOCAL = 'board-local';
const COLORS = ['#0f172a', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea'];
const WIDTHS = [3, 6, 12];

import { BOARD_H as H, BOARD_W as W, drawStroke } from '../lib/board';

type Tool = 'pen' | 'highlighter' | 'eraser';
type Stroke = Y.Map<unknown>;

interface Props {
  session: SessionDoc;
  readOnly: boolean;
  canClear: boolean;
  me: { id: string; name: string };
}

interface RemoteCursor {
  clientId: number;
  name: string;
  color: string;
  x: number;
  y: number;
}

/**
 * Collaborative whiteboard backed by a Y.Array of strokes in the session's Yjs document.
 * Each stroke's points are a Y.Array, so remote participants watch strokes being drawn live;
 * points are batched once per animation frame to keep updates small.
 */
export default function Whiteboard({ session, readOnly, canClear, me }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(0.5);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]!);
  const [width, setWidth] = useState(WIDTHS[1]!);
  const [count, setCount] = useState(0);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const board = session.doc.getArray<Stroke>(DOC_BOARD);
  const undoRef = useRef<Y.UndoManager | null>(null);
  const drawing = useRef<{ points: Y.Array<number>; pending: number[] } | null>(null);
  const frame = useRef<number | null>(null);
  const lastCursor = useRef(0);

  // ------------------------------------------------------------------ rendering
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    board.forEach((s) => drawStroke(ctx, s, scale));
    setCount(board.length);
  }, [board, scale]);

  const scheduleRender = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      render();
    });
  }, [render]);

  // Fit the fixed-aspect board into the available space.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const s = Math.max(0.1, Math.min(wrap.clientWidth / W, wrap.clientHeight / H));
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${W * s}px`;
      canvas.style.height = `${H * s}px`;
      canvas.width = Math.round(W * s * dpr);
      canvas.height = Math.round(H * s * dpr);
      setScale(s);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    render();
    board.observeDeep(scheduleRender);
    return () => board.unobserveDeep(scheduleRender);
  }, [board, render, scheduleRender]);

  // Undo/redo only this user's own strokes and erasures.
  useEffect(() => {
    // One stroke (or one eraser drag) is exactly one undo step, however long it takes to
    // draw: no time-based merging; boundaries are set explicitly on pointer down and up.
    // (With the default 500 ms window, a slowly drawn stroke became several steps and Undo
    // removed only its last points; this showed up under load in E2E.)
    const um = new Y.UndoManager(board, {
      trackedOrigins: new Set([LOCAL]),
      captureTimeout: Number.MAX_SAFE_INTEGER,
    });
    undoRef.current = um;
    const sync = () => {
      setCanUndo(um.undoStack.length > 0);
      setCanRedo(um.redoStack.length > 0);
    };
    um.on('stack-item-added', sync);
    um.on('stack-item-popped', sync);
    return () => {
      um.destroy();
      undoRef.current = null;
    };
  }, [board]);

  // Remote cursors from awareness.
  useEffect(() => {
    const { awareness, doc } = session;
    const update = () => {
      const list: RemoteCursor[] = [];
      awareness.getStates().forEach((st, clientId) => {
        const c = st.board as { x: number; y: number } | null | undefined;
        const u = st.user as { name: string; color: string } | undefined;
        if (clientId !== doc.clientID && c && u)
          list.push({ clientId, name: u.name, color: u.color, ...c });
      });
      setCursors(list);
    };
    awareness.on('change', update);
    return () => {
      awareness.off('change', update);
      awareness.setLocalStateField('board', null);
    };
  }, [session]);

  // ------------------------------------------------------------------ input
  const toBoard = (e: ReactPointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      Math.round((e.clientX - rect.left) / scale),
      Math.round((e.clientY - rect.top) / scale),
    ] as const;
  };

  const flushPoints = () => {
    frame.current = null;
    const d = drawing.current;
    if (!d || d.pending.length === 0) return;
    const pts = d.pending;
    d.pending = [];
    session.doc.transact(() => d.points.push(pts), LOCAL);
  };

  const eraseAt = (x: number, y: number) => {
    const hits: number[] = [];
    board.forEach((s, i) => {
      const pts = (s.get('points') as Y.Array<number>).toArray();
      for (let j = 0; j < pts.length; j += 2) {
        if (
          Math.hypot(pts[j]! - x, pts[j + 1]! - y) <=
          ERASER_RADIUS + (s.get('width') as number)
        ) {
          hits.push(i);
          break;
        }
      }
    });
    if (hits.length)
      session.doc.transact(() => hits.reverse().forEach((i) => board.delete(i, 1)), LOCAL);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    undoRef.current?.stopCapturing(); // each stroke is its own undo step
    const [x, y] = toBoard(e);
    if (tool === 'eraser') {
      drawing.current = { points: new Y.Array<number>(), pending: [] };
      eraseAt(x, y);
      return;
    }
    if (board.length >= MAX_STROKES) {
      toast.error('The board is full. Clear it or erase some strokes.');
      return;
    }
    const points = new Y.Array<number>();
    points.push([x, y]);
    const stroke = new Y.Map<unknown>();
    stroke.set('id', `${session.doc.clientID}-${Date.now()}`);
    stroke.set('by', me.id);
    stroke.set('tool', tool);
    stroke.set('color', color);
    stroke.set('width', width);
    stroke.set('points', points);
    session.doc.transact(() => board.push([stroke]), LOCAL);
    drawing.current = { points, pending: [] };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const [x, y] = toBoard(e);
    const now = performance.now();
    if (now - lastCursor.current > 50) {
      lastCursor.current = now;
      session.awareness.setLocalStateField('board', { x, y });
    }
    const d = drawing.current;
    if (!d) return;
    if (tool === 'eraser') return eraseAt(x, y);
    d.pending.push(x, y);
    frame.current ??= requestAnimationFrame(flushPoints);
  };

  const endStroke = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    flushPoints();
    undoRef.current?.stopCapturing(); // the final points belong to this stroke's step
    drawing.current = null;
  };

  const exportPng = () => {
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    board.forEach((s) => drawStroke(ctx, s, 1));
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = 'devhub-whiteboard.png';
    a.click();
  };

  const toolBtn = (t: Tool, label: string, Icon: typeof Pen) => (
    <button
      type="button"
      onClick={() => setTool(t)}
      aria-pressed={tool === t}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-2 transition-colors',
        tool === t ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div
        role="toolbar"
        aria-label="Whiteboard tools"
        className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2"
      >
        {toolBtn('pen', 'Pen', Pen)}
        {toolBtn('highlighter', 'Highlighter', Highlighter)}
        {toolBtn('eraser', 'Eraser', Eraser)}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${c}`}
              onClick={() => {
                setColor(c);
                if (tool === 'eraser') setTool('pen');
              }}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform',
                color === c ? 'scale-110 border-accent' : 'border-line',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Stroke width">
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={width === w}
              aria-label={`Width ${w}`}
              onClick={() => setWidth(w)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md',
                width === w ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <span className="rounded-full bg-fg" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo"
          title="Undo (your strokes)"
          disabled={!canUndo || readOnly}
          onClick={() => undoRef.current?.undo()}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo"
          title="Redo"
          disabled={!canRedo || readOnly}
          onClick={() => undoRef.current?.redo()}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-muted">{count} strokes</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Download PNG"
            title="Download PNG"
            onClick={exportPng}
          >
            <Download className="h-4 w-4" />
          </Button>
          {canClear && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear board"
              title="Clear board (host)"
              disabled={readOnly || count === 0}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div
        ref={wrapRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface-2 p-3"
      >
        <div className="relative shadow-lg">
          <canvas
            ref={canvasRef}
            data-testid="whiteboard"
            data-stroke-count={count}
            aria-label="Shared whiteboard"
            role="img"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={() => session.awareness.setLocalStateField('board', null)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) undoRef.current?.redo();
                else undoRef.current?.undo();
              }
            }}
            tabIndex={0}
            className={cn(
              'block touch-none rounded-md bg-white bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px]',
              readOnly
                ? 'cursor-not-allowed'
                : tool === 'eraser'
                  ? 'cursor-cell'
                  : 'cursor-crosshair',
            )}
          />
          {cursors.map((c) => (
            <div
              key={c.clientId}
              className="pointer-events-none absolute"
              style={{ left: c.x * scale, top: c.y * scale }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M1 1l5 12 2-5 5-2z" fill={c.color} stroke="#fff" strokeWidth="1" />
              </svg>
              <span
                className="ml-3 rounded px-1 text-[10px] font-semibold text-white"
                style={{ background: c.color }}
              >
                {c.name}
              </span>
            </div>
          ))}
        </div>
      </div>
      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear the whole board?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                session.doc.transact(() => board.delete(0, board.length), LOCAL);
                setConfirmClear(false);
              }}
            >
              Clear for everyone
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This removes every stroke for all participants. You can undo it afterwards.
        </p>
      </Dialog>
    </div>
  );
}
