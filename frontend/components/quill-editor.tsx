"use client";

import { useEffect, useRef } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';

interface QuillEditorProps {
  value: string;
  onChange: (html: string) => void;
}

export default function QuillEditor({ value, onChange }: QuillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || quillRef.current) return;

    let cleanup = false;

    const loadQuill = async () => {
      const Quill = (await import('quill')).default;
      if (cleanup || !containerRef.current) return;

      quillRef.current = new Quill(containerRef.current, {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ align: [] }],
            ['blockquote', 'code-block'],
            ['link', 'image'],
            ['clean'],
          ],
        },
        placeholder: 'Start writing your document...',
      });

      // Set initial content
      if (value) {
        quillRef.current.root.innerHTML = sanitizeHtml(value);
      }

      // Listen for changes
      quillRef.current.on('text-change', () => {
        if (quillRef.current) {
          onChange(quillRef.current.root.innerHTML);
        }
      });
    };

    loadQuill();

    return () => {
      cleanup = true;
      if (quillRef.current) {
        quillRef.current = null;
      }
    };
  }, []);

  // Update content when value prop changes (e.g., on edit)
  useEffect(() => {
    if (quillRef.current && value !== quillRef.current.root.innerHTML) {
      quillRef.current.root.innerHTML = sanitizeHtml(value);
    }
  }, [value]);

  return <div ref={containerRef} className="min-h-[300px]" />;
}
