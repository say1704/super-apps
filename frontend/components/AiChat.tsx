"use client";

import { useState, useRef, useEffect } from 'react';
import { apiRequest } from '@/lib/auth';

const STORAGE_KEY = 'ai_chat_history';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PendingAction {
  module: string;
  action: string;
  data: Record<string, unknown>;
  filters: Record<string, unknown>;
  description?: string;
  filter_description?: string;
}

interface ChatResponse {
  response: string;
  pending_action?: PendingAction | null;
}

function loadHistory(): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {}
}

export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages, pendingAction]);

  const addMessage = (msg: Message) => {
    setMessages(prev => {
      const next = [...prev, msg];
      saveHistory(next);
      return next;
    });
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput('');
    addMessage({ role: 'user', content: trimmed });
    setLoading(true);

    if (pendingAction) {
      if (trimmed.toLowerCase() === 'ya' || trimmed.toLowerCase() === 'y' || trimmed.toLowerCase() === 'yes') {
        try {
          const result: ChatResponse = await apiRequest('/ai/confirm', { method: 'POST' });
          addMessage({ role: 'assistant', content: result.response });
        } catch (err: any) {
          addMessage({ role: 'assistant', content: err.message || 'Gagal mengonfirmasi.' });
        }
      } else {
        try {
          const result: ChatResponse = await apiRequest('/ai/cancel', { method: 'POST' });
          addMessage({ role: 'assistant', content: result.response });
        } catch (err: any) {
          addMessage({ role: 'assistant', content: err.message || 'Gagal membatalkan.' });
        }
      }
      setPendingAction(null);
      setLoading(false);
      return;
    }

    try {
      const result: ChatResponse = await apiRequest('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed, history: messages }),
        headers: { 'Content-Type': 'application/json' },
      });
      addMessage({ role: 'assistant', content: result.response });
      if (result.pending_action) {
        setPendingAction(result.pending_action);
      }
    } catch (err: any) {
      addMessage({ role: 'assistant', content: err.message || 'Gagal memproses pesan.' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result: ChatResponse = await apiRequest('/ai/confirm', { method: 'POST' });
      addMessage({ role: 'assistant', content: result.response });
    } catch (err: any) {
      addMessage({ role: 'assistant', content: err.message || 'Gagal mengonfirmasi.' });
    } finally {
      setPendingAction(null);
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const result: ChatResponse = await apiRequest('/ai/cancel', { method: 'POST' });
      addMessage({ role: 'assistant', content: result.response });
    } catch (err: any) {
      addMessage({ role: 'assistant', content: err.message || 'Gagal membatalkan.' });
    } finally {
      setPendingAction(null);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setPendingAction(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-96 h-[32rem] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-600 dark:bg-blue-700 text-white flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <span className="font-semibold text-sm">AI Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="p-1 rounded-lg hover:bg-blue-500/50 transition-colors"
                title="Hapus percakapan"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-blue-500/50 transition-colors"
                title="Tutup"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 text-center px-4">
                <span className="text-4xl mb-3">🤖</span>
                <p className="text-sm font-medium">Tanya AI Assistant</p>
                <p className="text-xs mt-1">Tanya tentang data aplikasi, atau minta untuk menambah/mengubah/menghapus data.</p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Pending action bar */}
            {pendingAction && !loading && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-3">
                <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  {pendingAction.description}
                </p>
                {pendingAction.filter_description && (
                  <p className="text-xs text-yellow-700 dark:text-yellow-300/70 mb-2">
                    {pendingAction.filter_description}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleConfirm}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                  >
                    ✅ Ya
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                  >
                    ❌ Tidak
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
            <div className="flex gap-2 p-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ketik pesan... (Enter untuk kirim)"
                rows={1}
                disabled={loading}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 dark:focus:border-blue-500 placeholder-gray-400 dark:placeholder-gray-500 max-h-20 transition-colors disabled:opacity-50"
              />
              <button
                onClick={() => handleSend(input)}
                disabled={loading || !input.trim()}
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 shadow-sm"
                title="Kirim"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg flex items-center justify-center text-white text-2xl transition-all hover:scale-105 active:scale-95"
        title={open ? 'Tutup AI Assistant' : 'Buka AI Assistant'}
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>
    </>
  );
}
