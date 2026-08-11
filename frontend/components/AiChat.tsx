"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/auth';

const STORAGE_KEY = 'ai_chat_history';

interface QueryData {
  type: 'count' | 'list';
  count: number;
  modul: string;
  samples?: Record<string, unknown>[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  query_data?: QueryData | null;
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
  query_data?: QueryData | null;
}

interface Suggestion {
  icon: string;
  text: string;
  action: string;
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
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(30);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fullContentRef = useRef('');

  const fetchSuggestions = useCallback(async () => {
    try {
      const result = await apiRequest('/ai/suggest', { method: 'POST' });
      setSuggestions(result.suggestions || []);
    } catch {
      // silent
    }
  }, []);

  const startNewConversation = async () => {
    setConversationId(null);
    setMessages([]);
    setPendingAction(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      fetchSuggestions();
    }
  }, [open, fetchSuggestions]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages, pendingAction, undoAvailable]);

  const startUndoTimer = () => {
    setUndoCountdown(30);
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    undoTimerRef.current = setInterval(() => {
      setUndoCountdown(prev => {
        if (prev <= 1) {
          if (undoTimerRef.current) clearInterval(undoTimerRef.current);
          setUndoAvailable(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleUndo = async () => {
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    setUndoAvailable(false);
    setLoading(true);
    try {
      const result: ChatResponse = await apiRequest('/ai/action/undo', { method: 'POST' });
      addMessage({ role: 'assistant', content: result.response });
    } catch (err: any) {
      addMessage({ role: 'assistant', content: err.message || 'Gagal undo.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    handleSend(suggestion.action);
  };

  const addMessage = (msg: Omit<Message, 'timestamp'>) => {
    const now = new Date();
    const ts = now.toLocaleString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
    setMessages(prev => {
      const next = [...prev, { ...msg, timestamp: ts }];
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
          if (result.response.startsWith('✅')) {
            setUndoAvailable(true);
            startUndoTimer();
          }
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

    // All other messages → SSE streaming endpoint
    const storedToken = typeof window !== 'undefined'
      ? sessionStorage.getItem('sa_auth_token')
      : null;

    const now = new Date();
    const ts = now.toLocaleString('id-ID', {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
    });

    fullContentRef.current = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: ts }]);

    try {
      const response = await fetch('/api/proxy/api/v1/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();

          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);

            if (parsed.token !== undefined) {
              fullContentRef.current += parsed.token;
              setMessages(prev => {
                const updated = [...prev];
                if (updated.length > 0) {
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullContentRef.current };
                }
                return updated;
              });
            }

            if (parsed.response !== undefined) {
              fullContentRef.current = parsed.response;
              setMessages(prev => {
                const updated = [...prev];
                if (updated.length > 0) {
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullContentRef.current };
                }
                return updated;
              });
            }

            if (parsed.pending_action) {
              setPendingAction(parsed.pending_action);
            }

            if (parsed.conversation_id !== undefined) {
              setConversationId(parsed.conversation_id);
            }

            if (parsed.query_data !== undefined) {
              setMessages(prev => {
                const updated = [...prev];
                if (updated.length > 0) {
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = { ...last, query_data: parsed.query_data };
                }
                return updated;
              });
            }

            if (parsed.error) {
              fullContentRef.current = parsed.error;
              setMessages(prev => {
                const updated = [...prev];
                if (updated.length > 0) {
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullContentRef.current };
                }
                return updated;
              });
            }
          } catch {}
        }
      }

      setMessages(prev => {
        saveHistory(prev);
        return prev;
      });
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: err.message || 'Gagal memproses pesan.' };
        saveHistory(updated);
        return updated;
      });
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
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                  {msg.query_data && (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex items-center gap-2 mb-1">
                        {msg.query_data.type === 'count' ? (
                          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{msg.query_data.count}</span>
                        ) : (
                          <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                            {msg.query_data.count} data
                          </span>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400">{msg.query_data.modul}</span>
                      </div>
                      {msg.query_data.samples && msg.query_data.samples.length > 0 && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                          {msg.query_data.samples.map((s, si) => (
                            <div key={si} className="truncate">
                              {Object.values(s).filter(v => v !== null && v !== undefined).join(' — ')}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {msg.content && (
                  <div className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                    {msg.timestamp}
                  </div>
                  )}
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

            {/* Undo bar */}
            {undoAvailable && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                    Aksi berhasil. Batalkan dalam {undoCountdown}s
                  </p>
                  <button
                    onClick={handleUndo}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                  >
                    ↩️ Undo
                  </button>
                </div>
              </div>
            )}

            {/* Suggestions */}
            {messages.length === 0 && !loading && suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium px-1">Saran untuk Anda:</p>
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(s)}
                    className="w-full text-left bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-2.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <span className="text-sm">{s.icon} {s.text}</span>
                  </button>
                ))}
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
