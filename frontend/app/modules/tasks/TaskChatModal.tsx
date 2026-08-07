"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Task, TaskNote, WorklogEntry } from './types';
import { updateTask, getWorklogs, createWorklog, getTaskNotes, createTaskNote, deleteTaskNote } from './api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { useOptimisticLock } from '@/hooks/useOptimisticLock';
import ConflictModal from '@/components/ConflictModal';
import Lightbox from '@/components/Lightbox';

interface TaskChatModalProps {
  task: Task;
  onClose: () => void;
  onRefresh: () => void;
  onOpenWorklog?: (worklogId: number) => void;
}

interface ChatMessage {
  id: string;
  type: 'note' | 'worklog';
  message: string;
  hours?: string;
  photoUrls: string[];
  createdAt: string;
  createdBy: number;
  authorName: string;
}

function Avatar({ name, isSelf }: { name: string; isSelf: boolean }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  return (
    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
      isSelf ? 'bg-blue-700 text-blue-100' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
    }`}>
      {initials}
    </div>
  );
}

function RelativeTime({ date }: { date: string }) {
  const [text, setText] = useState('');
  const [full, setFull] = useState('');

  useEffect(() => {
    const d = new Date(date);
    setFull(d.toLocaleString());
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) setText('just now');
    else if (diffMin < 60) setText(`${diffMin}m ago`);
    else if (diffHr < 24) setText(`${diffHr}h ago`);
    else if (diffDay < 7) setText(`${diffDay}d ago`);
    else setText(d.toLocaleDateString());
  }, [date]);

  return (
    <span title={full} className="cursor-default">
      {text}
    </span>
  );
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export default function TaskChatModal({ task, onClose, onRefresh, onOpenWorklog }: TaskChatModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputMessage, setInputMessage] = useState('');
  const [inputHours, setInputHours] = useState('');
  const [inputPhotos, setInputPhotos] = useState<File[]>([]);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  const [editingTask, setEditingTask] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const [taskFormData, setTaskFormData] = useState({
    title: task.title,
    description: task.description,
    status: task.status,
    assignee: task.assignee,
    priority: task.priority,
    due_date: task.due_date || '',
    tags: task.tags || '',
    estimated_hours: task.estimated_hours || '',
    actual_hours: task.actual_hours || '',
  });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { getVersion, handleSuccess } = useOptimisticLock({
    onConflict: () => setShowConflict(true),
  });

  const handleReload = useCallback(() => {
    setShowConflict(false);
    setEditingTask(false);
    onRefresh();
  }, [onRefresh]);

  const handleDiscard = useCallback(() => {
    setShowConflict(false);
    setEditingTask(false);
  }, []);

  const isOverdue = (t: Task) => {
    if (!t.due_date || t.status === 'done') return false;
    return new Date(t.due_date) < new Date(new Date().toDateString());
  };

  const daysUntilDue = (t: Task) => {
    if (!t.due_date) return { text: '—', className: 'text-gray-500' };
    const due = new Date(t.due_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (t.status === 'done') return { text: `Done on ${t.completed_at ? new Date(t.completed_at).toLocaleDateString() : 'N/A'}`, className: 'text-green-600 dark:text-green-400' };
    if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, className: 'text-red-600 dark:text-red-400 font-bold' };
    if (diff === 0) return { text: 'Due today', className: 'text-orange-600 dark:text-orange-400 font-bold' };
    return { text: `${diff}d remaining`, className: diff <= 3 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400' };
  };

  const timeInfo = () => {
    if (!task.estimated_hours && !task.actual_hours) return null;
    const est = parseFloat(task.estimated_hours) || 0;
    const act = parseFloat(task.actual_hours) || 0;
    const diff = act - est;
    return { estimated: task.estimated_hours, actual: task.actual_hours, diff, overBudget: diff > 0 };
  };

  const parsePhotoUrls = (photoUrlsStr: string | undefined): string[] => {
    if (!photoUrlsStr) return [];
    try {
      const parsed = JSON.parse(photoUrlsStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const loadMessages = async () => {
    setLoading(true);
    try {
      const [notesRes, worklogsRes] = await Promise.all([
        getTaskNotes(task.id),
        getWorklogs(task.id),
      ]);

      const notes: ChatMessage[] = (notesRes.data || []).map((n: TaskNote) => ({
        id: `note-${n.id}`,
        type: 'note' as const,
        message: n.message,
        hours: n.hours || undefined,
        photoUrls: parsePhotoUrls(n.photo_urls),
        createdAt: n.created_at,
        createdBy: n.created_by,
        authorName: n.author_name || 'Unknown',
      }));

      const worklogs: ChatMessage[] = (worklogsRes.data || worklogsRes || []).map((w: WorklogEntry) => ({
        id: `worklog-${w.id}`,
        type: 'worklog' as const,
        message: w.description,
        hours: w.hours,
        photoUrls: parsePhotoUrls((w as any).photo_urls),
        createdAt: w.created_at,
        createdBy: (w as any).created_by || 0,
        authorName: (w as any).author_name || 'Unknown',
      }));

      const combined = [...notes, ...worklogs].sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setMessages(combined);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [task.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setTaskFormData({
      title: task.title,
      description: task.description,
      status: task.status,
      assignee: task.assignee,
      priority: task.priority,
      due_date: task.due_date || '',
      tags: task.tags || '',
      estimated_hours: task.estimated_hours || '',
      actual_hours: task.actual_hours || '',
    });
    setEditingTask(false);
    setShowDesc(false);
  }, [task.id]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    setSubmitting(true);
    try {
      const noteData: Record<string, any> = { message: inputMessage.trim() };
      if (inputHours) noteData.hours = inputHours;
      if (inputPhotos.length > 0) noteData.photos = inputPhotos;

      await createTaskNote(task.id, noteData);
      setInputMessage('');
      setInputHours('');
      setInputPhotos([]);
      await loadMessages();
      onRefresh();
    } catch (err: any) {
      console.error('Failed to send message:', err);
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!confirm('Delete this note?')) return;
    try {
      await deleteTaskNote(task.id, noteId);
      await loadMessages();
      onRefresh();
    } catch (err: any) {
      console.error('Failed to delete note:', err);
      toast.error(err.message || 'Failed to delete note');
    }
  };

  const handleSaveTask = async () => {
    try {
      const version = getVersion(String(task.id));
      const res = await updateTask(task.id, taskFormData, version);
      handleSuccess(String(task.id), res.version || (task.version || 0) + 1);
      setEditingTask(false);
      onRefresh();
    } catch (e: any) {
      if (e.message === 'Conflict') return;
      console.error('Failed to update task:', e);
      toast.error(e.message || 'Failed to update task');
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setInputPhotos(prev => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setInputPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const ti = timeInfo();
  const dueInfo = daysUntilDue(task);
  const isCurrentUser = (createdBy: number) => createdBy === user?.id;
  const currentUserInitials = getInitials(user?.full_name || user?.username || '?');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b border-gray-200 dark:border-gray-700 ${isOverdue(task) ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-800'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-bold text-xl text-gray-900 dark:text-white truncate">
                  #{task.id} {task.title}
                </h3>
                {isOverdue(task) && task.status !== 'done' && (
                  <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded text-xs font-bold animate-pulse whitespace-nowrap">
                    OVERDUE
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  task.status === 'todo' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
                  task.status === 'doing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                  'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                }`}>
                  {task.status === 'todo' ? 'To Do' : task.status === 'doing' ? 'In Progress' : 'Done'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  task.priority === 'urgent' ? 'bg-red-200 text-red-800 dark:bg-red-900/70 dark:text-red-200' :
                  task.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' :
                  task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                  'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                }`}>
                  {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </span>
                <span className={`text-xs font-medium ${dueInfo.className}`}>{dueInfo.text}</span>
                {ti && ti.estimated && (
                  <span className={`text-xs font-medium ${ti.overBudget ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {ti.actual}h / {ti.estimated}h
                  </span>
                )}
                {task.assignee && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Assigned to <span className="font-medium text-gray-700 dark:text-gray-300">{task.assignee}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowDesc(!showDesc)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  showDesc
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Description
              </button>
              <button
                onClick={() => setEditingTask(!editingTask)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  editingTask
                    ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Edit
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {showDesc && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {task.description || <span className="text-gray-400 italic">No description</span>}
              </p>
            </div>
          )}

          {editingTask && (
            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Title</label>
                  <input value={taskFormData.title} onChange={e => setTaskFormData({ ...taskFormData, title: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Assignee</label>
                  <input value={taskFormData.assignee} onChange={e => setTaskFormData({ ...taskFormData, assignee: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Priority</label>
                  <select value={taskFormData.priority} onChange={e => setTaskFormData({ ...taskFormData, priority: e.target.value as any })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
                  <select value={taskFormData.status} onChange={e => setTaskFormData({ ...taskFormData, status: e.target.value as any })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="todo">To Do</option><option value="doing">In Progress</option><option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Due Date</label>
                  <input type="date" value={taskFormData.due_date} onChange={e => setTaskFormData({ ...taskFormData, due_date: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Est. Hours</label>
                  <input value={taskFormData.estimated_hours} onChange={e => setTaskFormData({ ...taskFormData, estimated_hours: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Actual Hours</label>
                  <input value={taskFormData.actual_hours} onChange={e => setTaskFormData({ ...taskFormData, actual_hours: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tags</label>
                  <input value={taskFormData.tags} onChange={e => setTaskFormData({ ...taskFormData, tags: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="tag1, tag2" />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                  <textarea value={taskFormData.description} onChange={e => setTaskFormData({ ...taskFormData, description: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows={2} />
                </div>
                <div className="md:col-span-4 flex gap-2 justify-end">
                  <button onClick={handleSaveTask} className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">Save</button>
                  <button onClick={() => setEditingTask(false)} className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-500"></div>
                <span className="text-sm">Loading messages...</span>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-lg font-medium mb-1">No messages yet</p>
              <p className="text-sm">Start the conversation by adding a note below</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {messages.map((msg, idx) => {
                const self = isCurrentUser(msg.createdBy);
                const showAvatar = idx === 0 || !isCurrentUser(messages[idx - 1]?.createdBy) || messages[idx - 1]?.type !== msg.type;
                return (
                  <div key={msg.id} className={`flex items-end gap-2 ${self ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-4' : 'mt-1'}`}>
                    {!self && showAvatar && <Avatar name={msg.authorName} isSelf={false} />}
                    {!self && !showAvatar && <div className="w-8" />}

                    <div className={`max-w-[65%] group ${self ? 'order-1' : ''}`}>
                      {/* Type badge */}
                      {showAvatar && (
                        <div className={`flex items-center gap-1.5 mb-1 ${self ? 'justify-end' : 'justify-start'}`}>
                          {msg.type === 'worklog' && onOpenWorklog ? (
                            <button
                              onClick={() => onOpenWorklog(parseInt(msg.id.split('-')[1]))}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800 transition-colors cursor-pointer"
                            >
                              Worklog
                            </button>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                              msg.type === 'worklog'
                                ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                            }`}>
                              {msg.type === 'worklog' ? 'Worklog' : 'Note'}
                            </span>
                          )}
                          {msg.hours && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                              {msg.hours}h
                            </span>
                          )}
                        </div>
                      )}

                      {/* Bubble */}
                      <div className={`px-4 py-2.5 ${
                        self
                          ? 'bg-blue-600 text-white rounded-2xl rounded-br-md'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>

                        {msg.photoUrls.length > 0 && (
                          <div className={`mt-2 grid gap-1 ${msg.photoUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            {msg.photoUrls.map((url, i) => (
                              <img
                                key={i}
                                src={`/api/proxy/${url}`}
                                alt={`Photo ${i + 1}`}
                                className="rounded-lg cursor-pointer hover:opacity-90 max-h-40 w-full object-cover"
                                onClick={() => { setLightboxPhotos(msg.photoUrls); setLightboxIndex(i); }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Timestamp + delete */}
                      <div className={`flex items-center gap-2 mt-1 ${self ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          <RelativeTime date={msg.createdAt} />
                        </span>
                        {msg.type === 'note' && self && (
                          <button
                            onClick={() => handleDeleteNote(parseInt(msg.id.split('-')[1]))}
                            className="text-[11px] text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {self && showAvatar && (
                      <div className="w-8 h-8 rounded-full bg-blue-700 text-blue-100 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {currentUserInitials}
                      </div>
                    )}
                    {self && !showAvatar && <div className="w-8" />}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          {inputPhotos.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {inputPhotos.map((photo, i) => (
                <div key={i} className="relative group aspect-square w-14 h-14">
                  <img src={URL.createObjectURL(photo)} alt={photo.name} className="w-full h-full object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                  <button type="button" onClick={() => removePhoto(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">&times;</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <textarea
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder="Type a message..."
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl dark:bg-gray-700 dark:text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                rows={2}
              />
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  value={inputHours}
                  onChange={e => setInputHours(e.target.value)}
                  placeholder="Hours"
                  className="w-20 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  step="0.5"
                  min="0"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Photo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <div className="flex-1" />
                <button
                  onClick={handleSendMessage}
                  disabled={submitting || !inputMessage.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {lightboxPhotos.length > 0 && (
        <Lightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => { setLightboxPhotos([]); setLightboxIndex(0); }}
        />
      )}
      <ConflictModal isOpen={showConflict} onReload={handleReload} onDiscard={handleDiscard} />
    </div>
  );
}
