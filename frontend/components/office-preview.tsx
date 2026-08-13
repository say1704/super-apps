"use client";

import { useEffect, useRef, useState } from 'react';

const PROXY = '/api/proxy';

interface OfficeFilePreviewProps {
  filePath: string;
  downloadUrl?: string;
}

/**
 * Renders Excel (.xlsx/.xls) and Word (.docx/.doc) files inline.
 * - .xlsx / .docx are fetched directly from the static uploads URL.
 * - .xls / .doc are first normalized server-side (LibreOffice) into xlsx/docx,
 *   then rendered the same way.
 */
export default function OfficeFilePreview({ filePath, downloadUrl }: OfficeFilePreviewProps) {
  const [fileType, setFileType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetData, setSheetData] = useState<string[][][]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const docxRef = useRef<HTMLDivElement>(null);

  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const isExcel = ext === 'xlsx' || ext === 'xls';
  const isWord = ext === 'docx' || ext === 'doc';

  useEffect(() => {
    setFileType(ext);
  }, [ext]);

  const getAuthHeader = (): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    if (!isExcel && !isWord) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        let buffer: ArrayBuffer;
        if (ext === 'xlsx' || ext === 'docx') {
          const res = await fetch(`${PROXY}/${filePath}`);
          if (!res.ok) throw new Error('File not found');
          buffer = await res.arrayBuffer();
        } else {
          // .xls / .doc → normalize server-side to xlsx / docx
          const url = `${PROXY}/api/v1/preview/office?file_path=${encodeURIComponent(filePath)}`;
          const res = await fetch(url, { headers: getAuthHeader() });
          if (!res.ok) throw new Error('Conversion request failed');
          buffer = await res.arrayBuffer();
        }

        if (cancelled) return;

        if (isExcel) {
          const { default: ExcelJS } = await import('exceljs');
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(buffer as any);
          if (cancelled) return;
          const names: string[] = [];
          const tables: string[][][] = [];
          wb.eachSheet((ws) => {
            names.push(ws.name);
            const rows: string[][] = [];
            ws.eachRow({ includeEmpty: true }, (row) => {
              const cells: string[] = [];
              const maxCol = Math.min(Math.max(row.cellCount, 1), 60);
              for (let c = 1; c <= maxCol; c++) {
                const cell = row.getCell(c);
                let val: any = cell.value;
                if (val && typeof val === 'object' && 'text' in val) val = val.text;
                cells.push(val === null || val === undefined ? '' : String(val));
              }
              rows.push(cells);
            });
            tables.push(rows);
          });
          setSheetNames(names);
          setSheetData(tables);
          setActiveSheet(0);
        } else if (docxRef.current) {
          const { renderAsync } = await import('docx-preview');
          docxRef.current.innerHTML = '';
          await renderAsync(buffer, docxRef.current, undefined, {
            experimental: true,
            inWrapper: false,
          });
        }
        if (!cancelled) setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load file');
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [filePath, ext]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!isExcel && !isWord) return null;

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="bg-gray-50 dark:bg-gray-750 px-4 py-2 border-b flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Preview ({fileType.toUpperCase()})
        </span>
        {downloadUrl && (
          <a href={downloadUrl} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            📥 Download
          </a>
        )}
      </div>

      {loading && isExcel && (
        <div className="p-10 text-center text-gray-400">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-3" />
          <p>{ext === 'xls' ? 'Mengonversi file...' : 'Membuka file...'}</p>
        </div>
      )}

      {error && isExcel && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-2">⚠️</div>
          <p className="mb-3">{error}</p>
          {downloadUrl && (
            <a href={downloadUrl} className="text-sm text-blue-600 dark:text-blue-400 underline">
              Download file instead
            </a>
          )}
        </div>
      )}

      {!loading && !error && isExcel && (
        <div>
          {sheetNames.length > 1 && (
            <div className="flex gap-1 px-2 pt-2 overflow-x-auto bg-gray-50 dark:bg-gray-800 border-b">
              {sheetNames.map((name, i) => (
                <button
                  key={name}
                  onClick={() => setActiveSheet(i)}
                  className={`px-3 py-1.5 text-xs rounded-t whitespace-nowrap ${
                    i === activeSheet
                      ? 'bg-blue-600 text-white font-medium'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-auto max-h-[60vh]">
            <table className="min-w-full text-xs border-collapse">
              <tbody>
                {(sheetData[activeSheet] || []).map((row, r) => (
                  <tr key={r} className={r === 0 ? 'bg-gray-100 dark:bg-gray-700' : ''}>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={`border border-gray-200 dark:border-gray-700 px-2 py-1 max-w-[300px] truncate ${
                          r === 0 ? 'font-semibold' : ''
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isWord && (
        <div className="relative bg-white overflow-auto max-h-[60vh]">
          <div
            ref={docxRef}
            className="docx-preview p-4 flex flex-col items-center"
            style={{ fontSize: '12px', background: '#fff', color: '#111' }}
          />
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 text-gray-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-3" />
              <p>{ext === 'doc' ? 'Mengonversi file...' : 'Membuka file...'}</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 text-gray-500">
              <div className="text-4xl mb-2">⚠️</div>
              <p className="mb-3">{error}</p>
              {downloadUrl && (
                <a href={downloadUrl} className="text-sm text-blue-600 dark:text-blue-400 underline">
                  Download file instead
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}