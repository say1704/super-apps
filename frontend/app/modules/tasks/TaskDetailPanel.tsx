"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Task, WorklogEntry } from './types';
import { updateTask, getWorklogs, createWorklog, deleteWorklog } from './api';
import { printTable } from '@/lib/export';
import { useOptimisticLock } from '@/hooks/useOptimisticLock';
import ConflictModal from '@/components/ConflictModal';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  onRefresh: () => void;
  onExportPDF: () => void;
}

export default function TaskDetailPanel({ task, onClose, onRefresh, onExportPDF }: TaskDetailProps) {
  const [editing, setEditing] = useState(false);
  const [showWorklogForm, setShowWorklogForm] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  const [worklogs, setWorklogs] = useState<WorklogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'worklogs' | 'history'>('details');
  const [formData, setFormData] = useState({
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
  const [wlForm, setWlForm] = useState({ date: new Date().toISOString().split('T')[0], hours: '', description: '' });

  const { getVersion, handleSuccess } = useOptimisticLock({
    onConflict: () => setShowConflict(true),
  });

  const handleReload = useCallback(() => {
    setShowConflict(false);
    setEditing(false);
    onRefresh();
  }, [onRefresh]);

  const handleDiscard = useCallback(() => {
    setShowConflict(false);
    setEditing(false);
  }, []);

  const isOverdue = (t: Task) => {
    if (!t.due_date || t.status === 'done') return false;
    return new Date(t.due_date) < new Date(new Date().toDateString());
  };

  const daysUntilDue = (t: Task): { text: string; className: string } => {
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

  useEffect(() => {
    loadWorklogs();
  }, [task.id]);

  useEffect(() => {
    setFormData({
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
    setActiveTab('details');
    setEditing(false);
    setShowWorklogForm(false);
  }, [task.id]);

  const loadWorklogs = async () => {
    try {
      const res = await getWorklogs(task.id);
      setWorklogs(res.data || res);
    } catch {
      setWorklogs([]);
    }
  };

  const handleSave = async () => {
    try {
      const version = getVersion(String(task.id));
      const res = await updateTask(task.id, formData, version);
      handleSuccess(String(task.id), res.version || (task.version || 0) + 1);
      setEditing(false);
      onRefresh();
    } catch (e: any) {
      if (e.message === 'Conflict') return;
      console.error('Failed to update task:', e);
    }
  };

  const handleAddWorklog = async () => {
    if (!wlForm.hours || !wlForm.description) return;
    try {
      await createWorklog({ ...wlForm, task_id: task.id });
      setWlForm({ date: new Date().toISOString().split('T')[0], hours: '', description: '' });
      setShowWorklogForm(false);
      loadWorklogs();
      onRefresh();
    } catch (e) {
      console.error('Failed to add worklog:', e);
    }
  };

  const handleDeleteWorklog = async (id: number) => {
    if (!confirm('Delete this worklog?')) return;
    await deleteWorklog(id);
    loadWorklogs();
    onRefresh();
  };

  const ti = timeInfo();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`px-6 py-4 border-b ${isOverdue(task) ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-800'} border-gray-200 dark:border-gray-700`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
            {isOverdue(task) && task.status !== 'done' && (
              <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded text-xs font-bold animate-pulse">
                ⚠️ OVERDUE
              </span>
            )}
            {task.title}
          </h3>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            task.status === 'todo' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
            task.status === 'doing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
            'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
          }`}>
            {task.status === 'todo' ? 'To Do' : task.status === 'doing' ? 'Doing' : 'Done'}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            task.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
            'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
          }`}>
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
          </span>
          <span className={`text-xs font-semibold ${daysUntilDue(task).className}`}>
            {daysUntilDue(task).text}
          </span>
          {ti && ti.estimated && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${ti.overBudget ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
              {ti.actual}h / {ti.estimated}h {ti.overBudget ? `(over +${ti.diff}h)` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="px-6 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-2 flex-wrap">
        <button onClick={() => setEditing(!editing)} className={`px-3 py-1 text-xs rounded font-medium ${editing ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
          {editing ? '✏️ Editing...' : '✏️ Edit'}
        </button>
        <button onClick={onExportPDF} className="px-3 py-1 text-xs rounded font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900">
          📄 PDF
        </button>
        <button onClick={() => printTable([{ ...task }], `Task #${task.id}: ${task.title}`)} className="px-3 py-1 text-xs rounded font-medium bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900">
          🖨 Print
        </button>
        <div className="flex-1" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {(['details', 'worklogs', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-800">
        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Description</label>
              {editing ? (
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  rows={3}
                />
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300">{task.description || '—'}</p>
              )}
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              {editing ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Title *</label>
                    <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Assignee</label>
                    <input value={formData.assignee} onChange={e => setFormData({ ...formData, assignee: e.target.value })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Priority</label>
                    <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value as 'low' | 'medium' | 'high' })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Status</label>
                    <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as 'todo' | 'doing' | 'done' })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm">
                      <option value="todo">To Do</option>
                      <option value="doing">Doing</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Due Date</label>
                    <input type="date" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Tags</label>
                    <input value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Estimated Hours</label>
                    <input value={formData.estimated_hours} onChange={e => setFormData({ ...formData, estimated_hours: e.target.value })} placeholder="e.g., 8" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Actual Hours</label>
                    <input value={formData.actual_hours} onChange={e => setFormData({ ...formData, actual_hours: e.target.value })} placeholder="e.g., 6" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
                  </div>
                  <div className="col-span-2">
                    {editing && (
                      <button onClick={handleSave} className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                        💾 Save Changes
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Assignee</span>
                    <p className="text-sm text-gray-900 dark:text-white mt-0.5">{task.assignee || '—'}</p></div>
                  <div><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Due Date</span>
                    <p className="text-sm text-gray-900 dark:text-white mt-0.5">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}</p></div>
                  <div><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Estimated Hours</span>
                    <p className="text-sm text-gray-900 dark:text-white mt-0.5">{task.estimated_hours || '—'}</p></div>
                  <div><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actual Hours</span>
                    <p className="text-sm text-gray-900 dark:text-white mt-0.5">{task.actual_hours || '—'}</p></div>
                  <div><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Created</span>
                    <p className="text-sm text-gray-900 dark:text-white mt-0.5">{new Date(task.created_at).toLocaleString()}</p></div>
                  <div><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Updated</span>
                    <p className="text-sm text-gray-900 dark:text-white mt-0.5">{new Date(task.updated_at).toLocaleString()}</p></div>
                  {task.completed_at && (
                    <div><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Completed</span>
                      <p className="text-sm text-gray-900 dark:text-white mt-0.5">{new Date(task.completed_at).toLocaleString()}</p></div>
                  )}
                  {task.tags && (
                    <div><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tags</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {task.tags.split(',').map((t, i) => (
                          <span key={i} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded text-xs">#{t.trim()}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Time Tracking Summary */}
            {ti && (
              <div className={`mt-4 p-3 rounded-lg border ${ti.overBudget ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Time Tracking</span>
                  {ti.overBudget && (
                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded text-xs font-bold">
                      OVER BUDGET (+{ti.diff}h)
                    </span>
                  )}
                </div>
                <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${ti.overBudget ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${ti.estimated ? Math.min((parseFloat(ti.actual) / parseFloat(ti.estimated)) * 100, 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {ti.actual}h of {ti.estimated}h estimated
                  {ti.estimated && ti.actual ? ` (${Math.round((parseFloat(ti.actual) / parseFloat(ti.estimated)) * 100)}%)` : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'worklogs' && (
          <div className="space-y-3">
            {!showWorklogForm ? (
              <button onClick={() => setShowWorklogForm(true)} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                + Log Time
              </button>
            ) : (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Date</label>
                    <input type="date" value={wlForm.date} onChange={e => setWlForm({ ...wlForm, date: e.target.value })} className="w-full px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Hours</label>
                    <input type="number" value={wlForm.hours} onChange={e => setWlForm({ ...wlForm, hours: e.target.value })} className="w-full px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., 4" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Description</label>
                  <textarea value={wlForm.description} onChange={e => setWlForm({ ...wlForm, description: e.target.value })} className="w-full px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" rows={2} />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddWorklog} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Save</button>
                  <button onClick={() => setShowWorklogForm(false)} className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600">Cancel</button>
                </div>
              </div>
            )}

            {worklogs.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Date</th>
                    <th className="text-left py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Hours</th>
                    <th className="text-left py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Description</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {worklogs.map(wl => (
                    <tr key={wl.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2">{new Date(wl.date).toLocaleDateString()}</td>
                      <td className="py-2 font-medium">{wl.hours}h</td>
                      <td className="py-2 text-gray-600 dark:text-gray-400">{wl.description}</td>
                      <td className="py-2">
                        <button onClick={() => handleDeleteWorklog(wl.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No worklogs yet</p>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">Activity logs are tracked in the main Activity Log module. View full history:</p>
            <a href="/modules/activity-log" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 text-sm hover:underline">🔗 Open Activity Log →</a>
            <div className={`p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50`}>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <p>• Created: {new Date(task.created_at).toLocaleString()}</p>
                <p>• Updated: {new Date(task.updated_at).toLocaleString()}</p>
                {task.completed_at && <p>• Completed: {new Date(task.completed_at).toLocaleString()}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
      <ConflictModal isOpen={showConflict} onReload={handleReload} onDiscard={handleDiscard} />
    </div>
  );
}
