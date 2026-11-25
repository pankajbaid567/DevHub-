import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Circle, Diamond, Download, Eraser, Minus, MousePointer2,
  Paintbrush, Pencil, Redo2, Save, Square, StickyNote, Type, Undo2,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WhiteboardDto } from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { qk, queryClient } from '../lib/queryClient';
import { useDocumentTitle } from '../lib/hooks';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/primitives';

type Tool = 'select' | 'pen' | 'rect' | 'circle' | 'diamond' | 'line' | 'text' | 'sticky' | 'eraser';

interface Stroke {
  tool: Tool;
  color: string;
  width: number;
  points: [number, number][];
  text?: string;
  fill?: boolean;
}

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff'];
const WIDTHS = [2, 4, 6, 8];
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getBounds(s: Stroke): { x: number; y: number; w: number; h: number } {
  if (s.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  if (s.tool === 'rect' || s.tool === 'circle' || s.tool === 'diamond' || s.tool === 'sticky') {
    const [x1, y1] = s.points[0]!;
    const last = s.points[s.points.length - 1]!;
    const x = Math.min(x1, last[0]);
    const y = Math.min(y1, last[1]);
    return { x, y, w: Math.abs(last[0] - x1), h: Math.abs(last[1] - y1) };
  }
  if (s.tool === 'text') {
    const [x, y] = s.points[0]!;
    const fontSize = s.width * 4;
    const lines = (s.text ?? '').split('\n');
    const w = Math.max(...lines.map((l) => l.length * fontSize * 0.6), 20);
    const h = lines.length * fontSize * 1.2;
    return { x, y: y - fontSize, w, h };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of s.points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  const pad = s.width * 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

function hitTest(s: Stroke, px: number, py: number): boolean {
  const b = getBounds(s);
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.tool === 'text') {
    const fontSize = s.width * 4;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'top';
    const lines = (s.text ?? '').split('\n');
    if (s.points[0]) {
      lines.forEach((line, i) => {
        ctx.fillText(line, s.points[0]![0], s.points[0]![1] + i * fontSize * 1.2);
      });
    }
    return;
  }
  if (s.tool === 'sticky') {
    if (s.points.length < 2) return;
    const [x1, y1] = s.points[0]!;
    const last = s.points[s.points.length - 1]!;
    const x = Math.min(x1, last[0]);
    const y = Math.min(y1, last[1]);
    const w = Math.abs(last[0] - x1) || 160;
    const h = Math.abs(last[1] - y1) || 120;
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    if (s.text) {
      ctx.fillStyle = '#1c1917';
      ctx.font = '14px sans-serif';
      ctx.textBaseline = 'top';
      const maxW = w - 12;
      const lines = s.text.split('\n');
      let dy = 8;
      for (const line of lines) {
        const words = line.split(' ');
        let currentLine = '';
        for (const word of words) {
          const test = currentLine ? `${currentLine} ${word}` : word;
          if (ctx.measureText(test).width > maxW && currentLine) {
            ctx.fillText(currentLine, x + 6, y + dy);
            dy += 18;
            currentLine = word;
          } else {
            currentLine = test;
          }
        }
        ctx.fillText(currentLine, x + 6, y + dy);
        dy += 18;
      }
    }
    return;
  }

  if (s.points.length < 2 && s.tool !== 'eraser') return;

  ctx.strokeStyle = s.tool === 'eraser' ? '#ffffff' : s.color;
  ctx.lineWidth = s.tool === 'eraser' ? s.width * 3 : s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.tool === 'rect') {
    const [x1, y1] = s.points[0]!;
    const last = s.points[s.points.length - 1]!;
    const x = Math.min(x1, last[0]);
    const y = Math.min(y1, last[1]);
    const w = Math.abs(last[0] - x1);
    const h = Math.abs(last[1] - y1);
    if (s.fill) {
      ctx.fillStyle = hexToRgba(s.color, 0.2);
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeRect(x, y, w, h);
  } else if (s.tool === 'circle') {
    const [x1, y1] = s.points[0]!;
    const last = s.points[s.points.length - 1]!;
    const cx = (x1 + last[0]) / 2;
    const cy = (y1 + last[1]) / 2;
    const rx = Math.abs(last[0] - x1) / 2;
    const ry = Math.abs(last[1] - y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx || 0.1, ry || 0.1, 0, 0, Math.PI * 2);
    if (s.fill) {
      ctx.fillStyle = hexToRgba(s.color, 0.2);
      ctx.fill();
    }
    ctx.stroke();
  } else if (s.tool === 'diamond') {
    const [x1, y1] = s.points[0]!;
    const last = s.points[s.points.length - 1]!;
    const cx = (x1 + last[0]) / 2;
    const cy = (y1 + last[1]) / 2;
    const hw = Math.abs(last[0] - x1) / 2;
    const hh = Math.abs(last[1] - y1) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    if (s.fill) {
      ctx.fillStyle = hexToRgba(s.color, 0.2);
      ctx.fill();
    }
    ctx.stroke();
  } else if (s.tool === 'line') {
    ctx.beginPath();
    ctx.moveTo(s.points[0]![0], s.points[0]![1]);
    const last = s.points[s.points.length - 1]!;
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
    const angle = Math.atan2(last[1] - s.points[0]![1], last[0] - s.points[0]![0]);
    const headLen = 15;
    ctx.beginPath();
    ctx.moveTo(last[0], last[1]);
    ctx.lineTo(last[0] - headLen * Math.cos(angle - Math.PI / 6), last[1] - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(last[0], last[1]);
    ctx.lineTo(last[0] - headLen * Math.cos(angle + Math.PI / 6), last[1] - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(s.points[0]![0], s.points[0]![1]);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i]![0], s.points[i]![1]);
    }
    ctx.stroke();
  }
}

function WhiteboardCanvas({
  strokes,
  setStrokes,
}: {
  strokes: Stroke[];
  setStrokes: (s: Stroke[] | ((p: Stroke[]) => Stroke[])) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [undone, setUndone] = useState<Stroke[]>([]);
  const [fill, setFill] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; forSticky: boolean } | null>(null);
  const [textValue, setTextValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [stickyDraft, setStickyDraft] = useState<Stroke | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(zoom, zoom);

    const vw = canvas.width / zoom;
    const vh = canvas.height / zoom;

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < vw; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke();
    }
    for (let y = 0; y < vh; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
    }

    const all = current ? [...strokes, current] : strokes;
    for (let i = 0; i < all.length; i++) {
      drawStroke(ctx, all[i]!);
      if (i === selectedIdx && i < strokes.length) {
        const b = getBounds(all[i]!);
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
        ctx.setLineDash([]);
        const hs = 5;
        ctx.fillStyle = '#3b82f6';
        for (const [hx, hy] of [
          [b.x - 4, b.y - 4], [b.x + b.w + 4, b.y - 4],
          [b.x - 4, b.y + b.h + 4], [b.x + b.w + 4, b.y + b.h + 4],
        ]) {
          ctx.fillRect(hx! - hs / 2, hy! - hs / 2, hs, hs);
        }
        ctx.restore();
      }
    }
  }, [strokes, current, zoom, selectedIdx]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      draw();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  const getPos = (e: React.MouseEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom];
  };

  const commitText = useCallback(() => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      setTextValue('');
      setStickyDraft(null);
      return;
    }
    if (textInput.forSticky && stickyDraft) {
      setStrokes((prev) => [...prev, { ...stickyDraft, text: textValue }]);
    } else {
      setStrokes((prev) => [
        ...prev,
        { tool: 'text' as Tool, color, width, points: [[textInput.x, textInput.y]], text: textValue },
      ]);
    }
    setUndone([]);
    setTextInput(null);
    setTextValue('');
    setStickyDraft(null);
  }, [textInput, textValue, color, width, stickyDraft, setStrokes]);

  const onDown = (e: React.MouseEvent) => {
    if (textInput) {
      commitText();
      return;
    }
    const pos = getPos(e);

    if (tool === 'select') {
      let found = -1;
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (hitTest(strokes[i]!, pos[0], pos[1])) { found = i; break; }
      }
      setSelectedIdx(found >= 0 ? found : null);
      return;
    }

    if (tool === 'text') {
      setTextInput({ x: pos[0], y: pos[1], forSticky: false });
      setTextValue('');
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }

    if (tool === 'sticky') {
      setDrawing(true);
      setCurrent({ tool: 'sticky', color, width, points: [pos], fill: true });
      return;
    }

    setSelectedIdx(null);
    setDrawing(true);
    const fillShape = fill && ['rect', 'circle', 'diamond'].includes(tool);
    setCurrent({ tool, color, width, points: [pos], fill: fillShape || undefined });
  };

  const onMove = (e: React.MouseEvent) => {
    if (!drawing || !current) return;
    const pos = getPos(e);
    if (current.tool === 'rect' || current.tool === 'circle' || current.tool === 'diamond' || current.tool === 'line' || current.tool === 'sticky') {
      setCurrent({ ...current, points: [current.points[0]!, pos] });
    } else {
      setCurrent({ ...current, points: [...current.points, pos] });
    }
  };

  const onUp = () => {
    if (!current) { setDrawing(false); return; }

    if (current.tool === 'sticky') {
      const [x1, y1] = current.points[0]!;
      const last = current.points.length > 1 ? current.points[current.points.length - 1]! : [x1 + 160, y1 + 120] as [number, number];
      const finalStroke: Stroke = { ...current, points: [current.points[0]!, last] };
      setStickyDraft(finalStroke);
      const x = Math.min(x1, last[0]);
      const y = Math.min(y1, last[1]);
      setTextInput({ x: x + 6, y: y + 8, forSticky: true });
      setTextValue('');
      setCurrent(null);
      setDrawing(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }

    if (current.points.length > 1) {
      setStrokes((prev) => [...prev, current]);
      setUndone([]);
    }
    setCurrent(null);
    setDrawing(false);
  };

  const undo = () => {
    if (strokes.length === 0) return;
    setSelectedIdx(null);
    setUndone((prev) => [...prev, strokes[strokes.length - 1]!]);
    setStrokes((prev) => prev.slice(0, -1));
  };
  const redo = () => {
    if (undone.length === 0) return;
    setStrokes((prev) => [...prev, undone[undone.length - 1]!]);
    setUndone((prev) => prev.slice(0, -1));
  };

  const deleteSelected = useCallback(() => {
    if (selectedIdx === null) return;
    setUndone((prev) => [...prev, strokes[selectedIdx]!]);
    setStrokes((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }, [selectedIdx, strokes, setStrokes]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null && !textInput) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, deleteSelected, selectedIdx, textInput]);

  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));

  const tools: { key: Tool; icon: typeof Pencil; label: string }[] = [
    { key: 'select', icon: MousePointer2, label: 'Select' },
    { key: 'pen', icon: Pencil, label: 'Pen' },
    { key: 'rect', icon: Square, label: 'Rectangle' },
    { key: 'circle', icon: Circle, label: 'Ellipse' },
    { key: 'diamond', icon: Diamond, label: 'Diamond' },
    { key: 'line', icon: Minus, label: 'Arrow' },
    { key: 'text', icon: Type, label: 'Text' },
    { key: 'sticky', icon: StickyNote, label: 'Sticky Note' },
    { key: 'eraser', icon: Eraser, label: 'Eraser' },
  ];

  const cursorClass = tool === 'select' ? 'cursor-default' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair';

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-surface p-2">
        {tools.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTool(t.key); setSelectedIdx(null); }}
            className={`rounded p-2 transition-colors ${tool === t.key ? 'bg-accent text-white' : 'hover:bg-surface-2'}`}
            title={t.label}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
        <div className="mx-2 h-6 w-px bg-line" />
        <button
          onClick={() => setFill((f) => !f)}
          className={`rounded p-2 transition-colors ${fill ? 'bg-accent text-white' : 'hover:bg-surface-2'}`}
          title={fill ? 'Fill On' : 'Fill Off'}
        >
          <Paintbrush className="h-4 w-4" />
        </button>
        <div className="mx-2 h-6 w-px bg-line" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-6 w-6 rounded-full border-2 transition-all ${color === c ? 'border-accent scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <div className="mx-2 h-6 w-px bg-line" />
        {WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => setWidth(w)}
            className={`rounded px-2 py-1 text-xs ${width === w ? 'bg-accent text-white' : 'bg-surface-2'}`}
          >
            {w}px
          </button>
        ))}
        <div className="mx-2 h-6 w-px bg-line" />
        <button onClick={undo} className="rounded p-2 hover:bg-surface-2" title="Undo (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </button>
        <button onClick={redo} className="rounded p-2 hover:bg-surface-2" title="Redo (Ctrl+Y)">
          <Redo2 className="h-4 w-4" />
        </button>
        <div className="mx-2 h-6 w-px bg-line" />
        <button onClick={zoomOut} className="rounded p-2 hover:bg-surface-2" title="Zoom Out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} className="rounded p-2 hover:bg-surface-2" title="Zoom In">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className={cursorClass}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        />
        {textInput && (
          <textarea
            ref={textareaRef}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
              if (e.key === 'Escape') { setTextInput(null); setTextValue(''); setStickyDraft(null); }
            }}
            onBlur={commitText}
            className="absolute rounded border border-blue-400 bg-white/90 p-1 text-sm outline-none shadow-md"
            style={{
              left: textInput.x * zoom,
              top: textInput.y * zoom,
              minWidth: 120,
              minHeight: 32,
              fontSize: textInput.forSticky ? 14 : width * 4,
              color: textInput.forSticky ? '#1c1917' : color,
              resize: 'both',
            }}
            placeholder={textInput.forSticky ? 'Type note...' : 'Type here...'}
            autoFocus
          />
        )}
      </div>
    </div>
  );
}

export default function Whiteboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const [title, setTitle] = useState('Untitled');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [dirty, setDirty] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: qk.practice.whiteboard(id ?? ''),
    queryFn: () => api<WhiteboardDto>(`/practice/whiteboards/${id}`),
    enabled: !isNew && !!id,
  });

  useEffect(() => {
    if (data) {
      setTitle(data.title);
      setStrokes((data.data as any)?.strokes ?? []);
    }
  }, [data]);

  useDocumentTitle(`Whiteboard - ${title}`);

  const setStrokesTracked = useCallback(
    (fn: Stroke[] | ((p: Stroke[]) => Stroke[])) => {
      setStrokes(fn);
      setDirty(true);
    },
    [],
  );

  const save = useMutation({
    mutationFn: async () => {
      const body = { title, data: { strokes } };
      if (isNew) {
        return api<WhiteboardDto>('/practice/whiteboards', { method: 'POST', body });
      }
      return api<WhiteboardDto>(`/practice/whiteboards/${id}`, { method: 'PATCH', body });
    },
    onSuccess: (wb) => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: qk.practice.whiteboards });
      toast.success('Saved!');
      if (isNew) navigate(`/whiteboard/${wb.id}`, { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const exportPng = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${title}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save.mutate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  if (!isNew && isPending) return <Skeleton className="h-screen" />;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b bg-surface px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <input
          className="flex-1 bg-transparent text-lg font-semibold outline-none"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          placeholder="Whiteboard title..."
        />
        <Button
          size="sm"
          variant="outline"
          icon={<Download className="h-4 w-4" />}
          onClick={exportPng}
        >
          Export PNG
        </Button>
        <Button
          size="sm"
          icon={<Save className="h-4 w-4" />}
          onClick={() => save.mutate()}
          loading={save.isPending}
        >
          {dirty ? 'Save*' : 'Saved'}
        </Button>
      </div>
      <WhiteboardCanvas strokes={strokes} setStrokes={setStrokesTracked} />
    </div>
  );
}
