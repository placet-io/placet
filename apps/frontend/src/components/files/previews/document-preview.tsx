'use client';

import { useEffect, useRef, useState } from 'react';
import { PreviewError, PreviewLoader } from './text-preview';

interface DocumentPreviewProps {
  fileId: string;
  mimeType: string;
}

export function DocumentPreview({ fileId, mimeType }: DocumentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDocx =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword';

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);

    fetch(`/api/files/${fileId}/download`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(async (buffer) => {
        if (isDocx) {
          const docxPreview = await import('docx-preview');
          container.innerHTML = '';
          await docxPreview.renderAsync(buffer, container, undefined, {
            className: 'docx-preview',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: false,
            trimXmlDeclaration: true,
            debug: false,
          });
        } else {
          // ODT: extract styled content from content.xml inside the ZIP
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(buffer);
          const contentXml = await zip.file('content.xml')?.async('text');
          if (!contentXml) throw new Error('No content.xml found in document');

          const parser = new DOMParser();
          const doc = parser.parseFromString(contentXml, 'application/xml');
          const paragraphs = doc.getElementsByTagNameNS(
            'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
            'p',
          );

          const htmlParts: string[] = [];
          for (let i = 0; i < paragraphs.length; i++) {
            const text = paragraphs[i].textContent?.trim();
            if (text) htmlParts.push(`<p>${escapeHtml(text)}</p>`);
          }
          container.innerHTML = htmlParts.join('\n') || '<p><em>Document is empty</em></p>';
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fileId, mimeType, isDocx]);

  if (error) return <PreviewError message={error} />;

  return (
    <>
      {loading && <PreviewLoader />}
      <div
        ref={containerRef}
        className="w-full max-h-[65vh] overflow-auto bg-white rounded"
        style={{ display: loading ? 'none' : 'block' }}
      />
    </>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
