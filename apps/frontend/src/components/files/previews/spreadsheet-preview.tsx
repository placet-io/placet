'use client';

import { useEffect, useState } from 'react';
import { PreviewError, PreviewLoader } from './text-preview';

interface SpreadsheetPreviewProps {
  fileId: string;
  mimeType: string;
}

interface TableData {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

const MAX_PREVIEW_ROWS = 200;

export function SpreadsheetPreview({ fileId, mimeType }: SpreadsheetPreviewProps) {
  const { data, loading, error } = useSpreadsheetData(fileId, mimeType);

  if (loading) return <PreviewLoader />;
  if (error || !data) return <PreviewError message={error} />;

  return (
    <div className="w-full max-h-[65vh] overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr>
            {data.headers.map((h, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 font-medium text-muted-foreground border-b border-border whitespace-nowrap"
              >
                {h || `Column ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-1.5 border-b border-border/50 text-foreground whitespace-nowrap max-w-[300px] truncate"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.totalRows > MAX_PREVIEW_ROWS && (
        <p className="text-xs text-muted-foreground text-center py-3">
          Showing {MAX_PREVIEW_ROWS} of {data.totalRows} rows
        </p>
      )}
    </div>
  );
}

function useSpreadsheetData(fileId: string, mimeType: string) {
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    fetch(`/api/files/${fileId}/download`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const isCsv = mimeType === 'text/csv';
        if (isCsv) {
          return parseCsv(await res.text());
        }
        const buffer = await res.arrayBuffer();
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
          header: 1,
          defval: '',
        });
        return toTableData(rows);
      })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fileId, mimeType]);

  return { data, loading, error };
}

function parseCsv(text: string): TableData {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const delimiter = detectDelimiter(lines[0] || '');
  const rows = lines.map((line) => splitCsvLine(line, delimiter));
  return toTableData(rows);
}

function detectDelimiter(line: string): string {
  const semicolons = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  const tabs = (line.match(/\t/g) || []).length;
  if (tabs > semicolons && tabs > commas) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function toTableData(rows: string[][]): TableData {
  if (rows.length === 0) return { headers: [], rows: [], totalRows: 0 };
  const headers = rows[0].map(String);
  const totalRows = rows.length - 1;
  const dataRows = rows.slice(1, MAX_PREVIEW_ROWS + 1).map((r) => r.map(String));
  return { headers, rows: dataRows, totalRows };
}
