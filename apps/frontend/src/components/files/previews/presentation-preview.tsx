'use client';

import { useEffect, useState } from 'react';
import { PreviewError, PreviewLoader } from './text-preview';

interface PresentationPreviewProps {
  fileId: string;
}

export function PresentationPreview({ fileId }: PresentationPreviewProps) {
  const { slides, loading, error } = usePresentationSlides(fileId);

  if (loading) return <PreviewLoader />;
  if (error || !slides) return <PreviewError message={error} />;

  return (
    <div className="w-full max-h-[65vh] overflow-auto p-4 space-y-4">
      {slides.map((slide, i) => (
        <div key={i} className="p-4 rounded-xl bg-white dark:bg-muted/20 border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">Slide {i + 1}</p>
          {slide.length > 0 ? (
            <div className="space-y-1">
              {slide.map((text, j) => (
                <p key={j} className="text-sm text-foreground">
                  {text}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No text content</p>
          )}
        </div>
      ))}
      {slides.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No slides found in presentation
        </p>
      )}
    </div>
  );
}

function usePresentationSlides(fileId: string) {
  const [slides, setSlides] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    fetch(`/api/files/${fileId}/download`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(async (buffer) => {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(buffer);

        const slideFiles = Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
            const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
            return numA - numB;
          });

        const parsed: string[][] = [];
        const parser = new DOMParser();

        for (const file of slideFiles) {
          const xml = await zip.file(file)!.async('text');
          const doc = parser.parseFromString(xml, 'application/xml');
          // Extract text from <a:t> elements
          const textElements = doc.getElementsByTagNameNS(
            'http://schemas.openxmlformats.org/drawingml/2006/main',
            't',
          );
          const texts: string[] = [];
          for (let i = 0; i < textElements.length; i++) {
            const text = textElements[i].textContent?.trim();
            if (text) texts.push(text);
          }
          parsed.push(texts);
        }

        return parsed;
      })
      .then((result) => {
        setSlides(result);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fileId]);

  return { slides, loading, error };
}
