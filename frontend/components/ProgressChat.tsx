"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { apiRequest } from '@/lib/auth';
import { useToast } from '@/components/toast';
import Lightbox from '@/components/Lightbox';

interface ProgressEntry {
  id: number;
  worklog_id: number;
  message: string;
  photo_urls: string[];
  created_at: string;
}

interface ProgressChatProps {
  worklogId: number;
  entries: ProgressEntry[];
  onAdd: (entry: ProgressEntry) => void;
  onDelete: (entryId: number) => void;
  canModify: boolean;
}

export default function ProgressChat({ worklogId, entries, onAdd, onDelete, canModify }: ProgressChatProps) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create preview URLs for selected photos and revoke on cleanup
  const photoPreviews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => {
    return () => {
      photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPreviews]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [entries.length]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return 'Today';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleSend = async () => {
    if (!message.trim() && photos.length === 0) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('message', message.trim());
      for (const photo of photos) {
        form.append('photos', photo);
      }
      const result = await apiRequest(`/api/worklog/${worklogId}/progress`, {
        method: 'POST',
        body: form,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onAdd(result);
      setMessage('');
      setPhotos([]);
      setTimeout(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send update');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (entryId: number) => {
    if (!confirm('Delete this progress update?')) return;
    try {
      await apiRequest(`/api/worklog/${worklogId}/progress/${entryId}`, { method: 'DELETE' });
      onDelete(entryId);
      toast.success('Update deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const openLightbox = (urls: string[], index: number) => {
    setLightboxPhotos(urls);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  let lastDate = '';

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900/30">
      {/* Chat Messages */}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm font-medium">No progress updates yet</p>
            <p className="text-xs mt-1">Add your first update below</p>
          </div>
        )}

        {entries.map((entry, idx) => {
          const entryDate = formatDate(entry.created_at);
          const showDate = entryDate !== lastDate;
          lastDate = entryDate;

          return (
            <div key={`${entry.id}-${idx}`}>
              {showDate && (
                <div className="flex items-center justify-center my-4">
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  <span className="text-xs text-gray-400 dark:text-gray-500 px-3">{entryDate}</span>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                </div>
              )}
              <div
                className="flex flex-col"
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="bg-white dark:bg-gray-800 rounded-xl rounded-bl-sm px-3.5 py-2.5 max-w-[85%] shadow-sm border border-gray-100 dark:border-gray-700/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                      {formatTime(entry.created_at)}
                    </span>
                    {canModify && hoveredId === entry.id && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="text-[11px] text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {entry.message && (
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{entry.message}</p>
                  )}
                  {(entry.photo_urls?.length ?? 0) > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      {entry.photo_urls.map((url: string, idx: number) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity border border-gray-100 dark:border-gray-700"
                          onClick={() => openLightbox(entry.photo_urls, idx)}
                        >
                          <img src={`/api/proxy/${url}`} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      {canModify && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
          {photos.length > 0 && (
            <div className="flex gap-1.5 px-3 pt-2 overflow-x-auto">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
                  <img src={photoPreviews[idx]} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                    className="absolute top-0 right-0 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 p-2 items-end">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              title="Attach photo"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => {
                if (e.target.files) {
                  setPhotos([...photos, ...Array.from(e.target.files)]);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 dark:focus:border-blue-500 placeholder-gray-400 dark:placeholder-gray-500 max-h-20 transition-colors"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={sending || (!message.trim() && photos.length === 0)}
              className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 shadow-sm"
              title="Send update"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
