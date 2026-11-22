import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Eraser, Minus, Pencil, Redo2, Save, Square, Type, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { WhiteboardDto } from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { qk, queryClient } from '../lib/queryClient';
import { useDocumentTitle } from '../lib/hooks';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/primitives';

type Tool = 'pen' | 'rect' | 'line' | 'eraser' | 'text';
interface Stroke {
  tool: Tool;
  color: string;
  width: number;
  points: [number, number][];
  text?: string;
}

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff'];
const WIDTHS = [2, 4, 6, 8];

function WhiteboardCanvas({
  strokes,
  setStrokes,
}: {
  strokes: Stroke[];
  setStrokes: (s: Stroke[] | ((p: Stroke[]) => Stroke[])) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [undone, setUndone] = useState<Stroke[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const all = current ? [...strokes, current] : strokes;
    for (const s of all) {
      if (s.tool === 'text') {
        ctx.font = `${s.width * 4}px sans-serif`;
        ctx.fillStyle = s.color;
        if (s.points[0]) ctx.fillText(s.text ?? '', s.points[0][0], s.points[0][1]);
        continue;
      }
      if (s.points.length < 2) continue;
      ctx.strokeStyle = s.tool === 'eraser' ? '#ffffff' : s.color;
      ctx.lineWidth = s.tool === 'eraser' ? s.width * 3 : s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      if (s.tool === 'rect') {
        const [x1, y1] = s.points[0]!;
        const last = s.points[s.points.length - 1]!;
        ctx.rect(x1, y1, last[0] - x1, last[1] - y1);
      } else if (s.tool === 'line') {
        ctx.moveTo(s.points[0]![0], s.points[0]![1]);
        const last = s.points[s.points.length - 1]!;
        ctx.lineTo(last[0], last[1]);
        // Arrow head
        const angle = Math.atan2(last[1] - s.points[0]![1], last[0] - s.points[0]![0]);
        const headLen = 15;
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(last[0] - headLen * Math.cos(angle - Math.PI / 6), last[1] - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(last[0] - headLen * Math.cos(angle + Math.PI / 6), last[1] - headLen * Math.sin(angle + Math.PI / 6));
      } else {
        ctx.moveTo(s.points[0]![0], s.points[0]![1]);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i]![0], s.points[i]![1]);
        }
      }
      ctx.stroke();
    }
  }, [strokes, current]);

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
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onDown = (e: React.MouseEvent) => {
    if (tool === 'text') {
      const pos = getPos(e);
      const text = prompt('Enter text:');
      if (text) {
        setStrokes((prev) => [...prev, { tool, color, width, points: [pos], text }]);
        setUndone([]);
      }
      return;
    }
    setDrawing(true);
    setCurrent({ tool, color, width, points: [getPos(e)] });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drawing || !current) return;
    setCurrent({ ...current, points: [...current.points, getPos(e)] });
  };
  const onUp = () => {
    if (current && current.points.length > 1) {
      setStrokes((prev) => [...prev, current]);
      setUndone([]);
    }
    setCurrent(null);
    setDrawing(false);
  };
  const undo = () => {
    if (strokes.length === 0) return;
    setUndone((prev) => [...prev, strokes[strokes.length - 1]!]);
    setStrokes((prev) => prev.slice(0, -1));
  };
  const redo = () => {
    if (undone.length === 0) return;
    setStrokes((prev) => [...prev, undone[undone.length - 1]!]);
    setUndone((prev) => prev.slice(0, -1));
  };

  const tools: { key: Tool; icon: typeof Pencil; label: string }[] = [
    { key: 'pen', icon: Pencil, label: 'Pen' },
    { key: 'rect', icon: Square, label: 'Rectangle' },
    { key: 'line', icon: Minus, label: 'Arrow' },
    { key: 'text', icon: Type, label: 'Text' },
    { key: 'eraser', icon: Eraser, label: 'Eraser' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-surface p-2">
        {tools.map((t) => (
          <button
            key={t.key}
            onClick={() => setTool(t.key)}
            className={`rounded p-2 transition-colors ${tool === t.key ? 'bg-accent text-white' : 'hover:bg-surface-2'}`}
            title={t.label}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
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
      </div>
      <div className="relative flex-1 overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        />
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

  // Keyboard shortcuts
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
