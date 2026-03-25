'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pen, ArrowRight, Square, Type, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tool = 'pen' | 'arrow' | 'rect' | 'text';

interface Point {
  x: number;
  y: number;
}

interface CanvasOverlayProps {
  imageSrc: string;
}

export interface CanvasOverlayHandle {
  exportBlob: () => Promise<Blob | null>;
}

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ffffff',
  '#000000',
];

const TOOLS: { id: Tool; icon: typeof Pen; label: string }[] = [
  { id: 'pen', icon: Pen, label: 'Pen' },
  { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'text', icon: Type, label: 'Text' },
];

function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, strokeColor: string) {
  const headLen = 15;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLen * Math.cos(angle - Math.PI / 6),
    to.y - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLen * Math.cos(angle + Math.PI / 6),
    to.y - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

function drawRect(ctx: CanvasRenderingContext2D, from: Point, to: Point, strokeColor: string) {
  ctx.beginPath();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
}

export const CanvasOverlay = forwardRef<CanvasOverlayHandle, CanvasOverlayProps>(
  function CanvasOverlay({ imageSrc }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Separate offscreen canvas holds the committed strokes; the main canvas
    // is the composited view (committed + in-progress live preview).
    const committedRef = useRef<HTMLCanvasElement | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState('#ef4444');
    const [showColors, setShowColors] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const drawingRef = useRef(false);
    const startRef = useRef<Point>({ x: 0, y: 0 });
    const lastPosRef = useRef<Point>({ x: 0, y: 0 });
    const historyRef = useRef<ImageData[]>([]);
    const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean }>({
      x: 0,
      y: 0,
      visible: false,
    });
    const [textValue, setTextValue] = useState('');
    const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
    const textInputRef = useRef<HTMLInputElement>(null);
    // Guard against the immediate blur that occurs when focus transfers from
    // canvas mousedown → input mount.
    const textMountedAtRef = useRef(0);

    // Explicitly focus the text input after mount — autoFocus alone is unreliable
    // because the browser may hand focus to the canvas from the preceding mousedown.
    useEffect(() => {
      if (textInput.visible) {
        textMountedAtRef.current = Date.now();
        // Schedule focus on the next frame so the DOM has settled.
        requestAnimationFrame(() => {
          textInputRef.current?.focus();
        });
      }
    }, [textInput.visible]);

    // Draw image onto canvas once loaded
    useEffect(() => {
      const img = new Image();
      img.crossOrigin = 'use-credentials';
      img.onload = () => {
        imgRef.current = img;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        setCanvasSize({ width: img.naturalWidth, height: img.naturalHeight });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        // Mirror to committed canvas
        const committed = document.createElement('canvas');
        committed.width = img.naturalWidth;
        committed.height = img.naturalHeight;
        committed.getContext('2d')!.drawImage(img, 0, 0);
        committedRef.current = committed;
        setImgLoaded(true);
      };
      img.src = imageSrc;
    }, [imageSrc]);

    const saveHistory = useCallback(() => {
      const committed = committedRef.current;
      if (!committed) return;
      const ctx = committed.getContext('2d');
      if (!ctx) return;
      historyRef.current.push(ctx.getImageData(0, 0, committed.width, committed.height));
      if (historyRef.current.length > 50) historyRef.current.shift();
    }, []);

    const undo = useCallback(() => {
      const canvas = canvasRef.current;
      const committed = committedRef.current;
      if (!canvas || !committed || historyRef.current.length === 0) return;
      const prev = historyRef.current.pop()!;
      committed.getContext('2d')!.putImageData(prev, 0, 0);
      // Sync display canvas
      canvas.getContext('2d')!.putImageData(prev, 0, 0);
    }, []);

    const getCanvasCoords = useCallback((e: React.MouseEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }, []);

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        const pos = getCanvasCoords(e);
        if (tool === 'text') {
          setTextInput({ x: pos.x, y: pos.y, visible: true });
          setTextValue('');
          return;
        }
        saveHistory();
        drawingRef.current = true;
        startRef.current = pos;
        lastPosRef.current = pos;

        if (tool === 'pen') {
          const ctx = canvasRef.current?.getContext('2d');
          if (!ctx) return;
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      },
      [tool, color, getCanvasCoords, saveHistory],
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!drawingRef.current) return;
        const pos = getCanvasCoords(e);
        const canvas = canvasRef.current;
        const committed = committedRef.current;
        if (!canvas || !committed) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (tool === 'pen') {
          // Segment-based drawing committed directly
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
          // Also commit to offscreen
          const cctx = committed.getContext('2d')!;
          cctx.beginPath();
          cctx.strokeStyle = color;
          cctx.lineWidth = 3;
          cctx.lineCap = 'round';
          cctx.lineJoin = 'round';
          cctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
          cctx.lineTo(pos.x, pos.y);
          cctx.stroke();
          lastPosRef.current = pos;
        } else if (tool === 'arrow' || tool === 'rect') {
          // Live preview: restore committed state then draw current shape
          ctx.putImageData(
            committed.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height),
            0,
            0,
          );
          if (tool === 'arrow') drawArrow(ctx, startRef.current, pos, color);
          else drawRect(ctx, startRef.current, pos, color);
        }
      },
      [tool, color, getCanvasCoords],
    );

    const handleMouseUp = useCallback(
      (e: React.MouseEvent) => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        const pos = getCanvasCoords(e);
        const canvas = canvasRef.current;
        const committed = committedRef.current;
        if (!canvas || !committed) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const start = startRef.current;

        if (tool === 'pen') {
          // Already committed segment by segment
        } else if (tool === 'arrow') {
          drawArrow(ctx, start, pos, color);
          // Commit final state
          committed.getContext('2d')!.drawImage(canvas, 0, 0);
        } else if (tool === 'rect') {
          drawRect(ctx, start, pos, color);
          committed.getContext('2d')!.drawImage(canvas, 0, 0);
        }
      },
      [tool, color, getCanvasCoords],
    );

    const handleTextSubmit = useCallback(() => {
      if (!textValue.trim()) {
        // If blur fires within 200 ms of mount it's the initial focus-steal race — ignore it.
        if (Date.now() - textMountedAtRef.current < 200) return;
        setTextInput((prev) => ({ ...prev, visible: false }));
        return;
      }
      saveHistory();
      const canvas = canvasRef.current;
      const committed = committedRef.current;
      if (!canvas || !committed) return;
      // Scale font to match canvas resolution (canvas may be 2-4× the CSS size)
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / (rect.width || 1);
      const fontSize = Math.round(18 * scale);
      for (const ctx of [canvas.getContext('2d')!, committed.getContext('2d')!]) {
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(textValue, textInput.x, textInput.y);
      }
      setTextInput((prev) => ({ ...prev, visible: false }));
      setTextValue('');
    }, [textValue, color, textInput, saveHistory]);

    useImperativeHandle(ref, () => ({
      exportBlob: () => {
        // Export final display canvas (already contains everything including live preview)
        return new Promise<Blob | null>((resolve) => {
          canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png');
        });
      },
    }));

    return (
      <div className="relative flex items-center justify-center">
        {/* Canvas + overlaid toolbar */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[55vh] rounded-xl cursor-crosshair"
            style={{ display: imgLoaded ? undefined : 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              drawingRef.current = false;
            }}
          />
          {!imgLoaded && (
            <div className="w-96 h-64 flex items-center justify-center text-muted-foreground text-sm">
              Loading image…
            </div>
          )}

          {/* Toolbar overlaid at the bottom of the canvas */}
          {imgLoaded && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/90 backdrop-blur rounded-xl border border-border/60 px-2 py-1.5 shadow-sm">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                return (
                  <Button
                    key={t.id}
                    variant={tool === t.id ? 'default' : 'ghost'}
                    size="icon-sm"
                    title={t.label}
                    onClick={() => setTool(t.id)}
                  >
                    <Icon size={14} />
                  </Button>
                );
              })}
              <div className="w-px h-5 bg-border mx-1" />
              <div className="relative">
                <Button variant="ghost" size="icon-sm" onClick={() => setShowColors((v) => !v)}>
                  <div
                    className="h-3.5 w-3.5 rounded-full border border-border"
                    style={{ background: color }}
                  />
                </Button>
                {showColors && (
                  <div className="absolute bottom-full mb-1 left-0 flex gap-1 bg-background border border-border rounded-lg p-1.5 shadow-lg z-10">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={cn(
                          'h-5 w-5 rounded-full border-2 transition-transform',
                          c === color
                            ? 'border-primary scale-110'
                            : 'border-transparent hover:scale-110',
                        )}
                        style={{ background: c }}
                        onClick={() => {
                          setColor(c);
                          setShowColors(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" title="Undo" onClick={undo}>
                <Undo2 size={14} />
              </Button>
            </div>
          )}

          {/* Inline text input — positioned over the canvas in display space */}
          {textInput.visible && (
            <input
              ref={textInputRef}
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') setTextInput((prev) => ({ ...prev, visible: false }));
              }}
              onBlur={handleTextSubmit}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute border-b-2 text-base font-medium outline-none px-1 py-0.5 z-20 rounded-sm"
              style={{
                left: `${(textInput.x / canvasSize.width) * 100}%`,
                top: `${(textInput.y / canvasSize.height) * 100}%`,
                color,
                borderColor: color,
                backgroundColor: 'rgba(0,0,0,0.35)',
                minWidth: '80px',
                textShadow: color === '#ffffff' ? '0 0 4px #000' : '0 0 4px rgba(0,0,0,0.5)',
              }}
            />
          )}
        </div>
      </div>
    );
  },
);
