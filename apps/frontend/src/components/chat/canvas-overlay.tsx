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

export const CanvasOverlay = forwardRef<CanvasOverlayHandle, CanvasOverlayProps>(
  function CanvasOverlay({ imageSrc }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState('#ef4444');
    const [showColors, setShowColors] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const drawingRef = useRef(false);
    const startRef = useRef<Point>({ x: 0, y: 0 });
    const historyRef = useRef<ImageData[]>([]);
    const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean }>({
      x: 0,
      y: 0,
      visible: false,
    });
    const [textValue, setTextValue] = useState('');
    const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

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
        setImgLoaded(true);
      };
      img.src = imageSrc;
    }, [imageSrc]);

    const saveHistory = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (historyRef.current.length > 50) historyRef.current.shift();
    }, []);

    const undo = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || historyRef.current.length === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const prev = historyRef.current.pop()!;
      ctx.putImageData(prev, 0, 0);
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

        if (tool === 'pen') {
          const ctx = canvasRef.current?.getContext('2d');
          if (!ctx) return;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
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
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        if (tool === 'pen') {
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
      },
      [tool, getCanvasCoords],
    );

    const handleMouseUp = useCallback(
      (e: React.MouseEvent) => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        const pos = getCanvasCoords(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const start = startRef.current;

        if (tool === 'pen') {
          ctx.closePath();
        } else if (tool === 'arrow') {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
          // Arrowhead
          const angle = Math.atan2(pos.y - start.y, pos.x - start.x);
          const headLen = 15;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(
            pos.x - headLen * Math.cos(angle - Math.PI / 6),
            pos.y - headLen * Math.sin(angle - Math.PI / 6),
          );
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(
            pos.x - headLen * Math.cos(angle + Math.PI / 6),
            pos.y - headLen * Math.sin(angle + Math.PI / 6),
          );
          ctx.stroke();
        } else if (tool === 'rect') {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(start.x, start.y, pos.x - start.x, pos.y - start.y);
        }
      },
      [tool, color, getCanvasCoords],
    );

    const handleTextSubmit = useCallback(() => {
      if (!textValue.trim()) {
        setTextInput((prev) => ({ ...prev, visible: false }));
        return;
      }
      saveHistory();
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.font = '20px sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(textValue, textInput.x, textInput.y);
      setTextInput((prev) => ({ ...prev, visible: false }));
      setTextValue('');
    }, [textValue, color, textInput, saveHistory]);

    useImperativeHandle(ref, () => ({
      exportBlob: () => {
        return new Promise<Blob | null>((resolve) => {
          canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png');
        });
      },
    }));

    return (
      <div className="relative flex flex-col items-center gap-2">
        {/* Toolbar */}
        <div className="flex items-center gap-1 bg-background/90 backdrop-blur rounded-xl border border-border/60 px-2 py-1.5 shadow-sm">
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
              <div className="absolute top-full mt-1 left-0 flex gap-1 bg-background border border-border rounded-lg p-1.5 shadow-lg z-10">
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

        {/* Canvas */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[55vh] object-contain rounded-xl cursor-crosshair"
            style={{ display: imgLoaded ? undefined : 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />
          {!imgLoaded && (
            <div className="w-96 h-64 flex items-center justify-center text-muted-foreground text-sm">
              Loading image…
            </div>
          )}
          {/* Inline text input */}
          {textInput.visible && (
            <input
              type="text"
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') setTextInput((prev) => ({ ...prev, visible: false }));
              }}
              onBlur={handleTextSubmit}
              className="absolute bg-transparent border-b-2 text-sm outline-none px-0.5"
              style={{
                left: `${(textInput.x / canvasSize.width) * 100}%`,
                top: `${(textInput.y / canvasSize.height) * 100}%`,
                color,
                borderColor: color,
                minWidth: '60px',
              }}
            />
          )}
        </div>
      </div>
    );
  },
);
