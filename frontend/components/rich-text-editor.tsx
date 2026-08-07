"use client";

import { useRef, useEffect, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdating = useRef(false);

  const exec = useCallback((command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  // Sync initial value
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML && !isUpdating.current) {
      editorRef.current.innerHTML = sanitizeHtml(value);
    }
  }, [value]);

  const Btn = ({ cmd, label, title, value: v }: { cmd: string; label: string; title: string; value?: string }) => (
    <button type="button" onClick={() => exec(cmd, v)} className="px-2 py-1 text-sm rounded bg-white dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-white border border-gray-200 dark:border-gray-600" title={title}>
      {label}
    </button>
  );

  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 border-b bg-gray-50 dark:bg-gray-700">
        <Btn cmd="bold" label="𝗕" title="Bold" />
        <Btn cmd="italic" label="𝐼" title="Italic" />
        <Btn cmd="underline" label="𝑈̲" title="Underline" />
        <Btn cmd="strikeThrough" label="𝑆̶" title="Strikethrough" />
        <span className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <Btn cmd="formatBlock" value="h1" label="H1" title="Heading 1" />
        <Btn cmd="formatBlock" value="h2" label="H2" title="Heading 2" />
        <Btn cmd="formatBlock" value="h3" label="H3" title="Heading 3" />
        <span className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <Btn cmd="insertUnorderedList" label="• List" title="Bullet list" />
        <Btn cmd="insertOrderedList" label="1. List" title="Numbered list" />
        <Btn cmd="formatBlock" value="blockquote" label="❝ Quote" title="Blockquote" />
        <Btn cmd="formatBlock" value="pre" label="⟨/⟩ Code" title="Code block" />
        <span className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <Btn cmd="justifyLeft" label="⫷" title="Align left" />
        <Btn cmd="justifyCenter" label="⫿" title="Align center" />
        <Btn cmd="justifyRight" label="⫸" title="Align right" />
        <span className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <Btn cmd="createLink" label="🔗 Link" title="Insert link" />
        <button type="button" onClick={() => {
          const url = prompt('Image URL:');
          if (url) exec('insertImage', url);
        }} className="px-2 py-1 text-sm rounded bg-white dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-white border border-gray-200 dark:border-gray-600" title="Insert image">🖼️</button>
        <Btn cmd="removeFormat" label="🧹 Clean" title="Remove formatting" />
      </div>
      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="min-h-[250px] p-4 text-gray-900 dark:text-white outline-none prose dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
        onInput={() => { if (editorRef.current) onChange(editorRef.current.innerHTML); }}
        style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}
      />
    </div>
  );
}
