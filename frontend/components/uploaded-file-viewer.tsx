"use client";

import { useEffect, useState } from 'react';

const PROXY = '/api/proxy';

interface UploadedFileViewerProps {
  doc: {
    id: number;
    file_path: string | null;
  };
  downloadUrl?: string;
}

/**
 * Use static uploads URL for iframe/img (no auth possible),
 * but keep auth-gated /download endpoint for anchor href links.
 */
function getStaticUrl(filePath: string): string {
  // filePath format: "uploads/documents/uuid_filename.ext" or "uploads/forms/uuid_filename.ext"
  return `${PROXY}/${filePath}`;
}

export default function UploadedFileViewer({ doc, downloadUrl }: UploadedFileViewerProps) {
  const [fileType, setFileType] = useState<string>('');
  const [textContent, setTextContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fileUrl = doc.file_path ? getStaticUrl(doc.file_path) : '';

  useEffect(() => {
    const ext = doc.file_path?.split('.').pop()?.toLowerCase() || '';
    setFileType(ext);

    if (['txt', 'md', 'csv', 'log', 'json', 'xml', 'html', 'yml', 'yaml', 'py', 'sh', 'conf', 'cfg', 'ini'].includes(ext)) {
      fetch(fileUrl)
        .then(r => { if (!r.ok) throw new Error('Not found'); return r.text(); })
        .then(t => { setTextContent(t); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [doc.id, doc.file_path, fileUrl]);

  // PDF — embed via static file URL
  if (fileType === 'pdf') {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-b">
          <span className="text-xs text-gray-500 dark:text-gray-400">Preview (PDF)</span>
        </div>
        <iframe
          src={fileUrl}
          className="w-full border-0"
          style={{ height: 'calc(95vh - 180px)', minHeight: '600px' }}
          title="PDF Preview"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(fileType)) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-b">
          <span className="text-xs text-gray-500 dark:text-gray-400">Preview (Image)</span>
        </div>
        <div className="flex justify-center p-4 bg-gray-100 dark:bg-gray-900">
          <img src={fileUrl} alt={doc.file_path || ''} className="max-w-full max-h-[600px] rounded" />
        </div>
      </div>
    );
  }

  // HTML files
  if (['html', 'htm'].includes(fileType)) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-b">
          <span className="text-xs text-gray-500 dark:text-gray-400">Preview (HTML)</span>
        </div>
        <iframe
          src={fileUrl}
          className="w-full border-0"
          style={{ height: 'calc(95vh - 180px)', minHeight: '600px' }}
          title="HTML Preview"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // Text-based files
  if (['txt', 'md', 'csv', 'log', 'json', 'xml', 'yml', 'yaml', 'py', 'sh', 'conf', 'cfg', 'ini'].includes(fileType)) {
    if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-b">
          <span className="text-xs text-gray-500 dark:text-gray-400">Preview ({fileType.toUpperCase()})</span>
        </div>
        <pre className="p-4 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap font-mono">
          {textContent}
        </pre>
      </div>
    );
  }

  // DOCX / XLSX — cannot preview inline
  if (['docx', 'xlsx', 'xls'].includes(fileType)) {
    return (
      <div className="border rounded-lg p-8 text-center bg-gray-50 dark:bg-gray-800">
        <div className="text-5xl mb-4">{fileType.startsWith('doc') ? '📘' : '📊'}</div>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Cannot preview {fileType.toUpperCase()} inline. Use the Download button above.
        </p>
      </div>
    );
  }

  // Fallback
  return (
    <div className="border rounded-lg p-8 text-center bg-gray-50 dark:bg-gray-800">
      <div className="text-5xl mb-4">📎</div>
      <p className="text-gray-600 dark:text-gray-300 mb-4">
        Preview not available for {fileType.toUpperCase()} files. Use the Download button above.
      </p>
    </div>
  );
}
