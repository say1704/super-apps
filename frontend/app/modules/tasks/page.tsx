"use client";

import React, { useState, useEffect } from 'react';
import { Task, Sprint, Stats, SortField, SortOrder, ActivityEntry } from './types';
import { createTask, getTaskStats, getTasks, updateTask, deleteTask, bulkDeleteTasks, bulkUpdateStatus } from './api';
import { printTable, exportToCSV } from '@/lib/export';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import TaskTable from './TaskTable';
import TaskChatModal from './TaskChatModal';
import BurndownPanel from './BurndownPanel';

export default function TasksModule() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: '', status: '', priority: '', assignee: '', tags: '', from_date: '', to_date: ''
  });

  // Sort
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Bulk
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Sprint
  const [showSprint, setShowSprint] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    title: '', description: '', status: 'todo', assignee: '',
    priority: 'medium', due_date: '', tags: '', estimated_hours: '', actual_hours: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, page_size: pageSize, sort_by: sortField, sort_order: sortOrder };
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status_filter = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.assignee) params.assignee = filters.assignee;
      if (filters.tags) params.tags = filters.tags;
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;
      const res = await getTasks(params);
      setData(res.data || []);
    } catch (err: any) {
      console.error('fetch error', err);
      toast.error('Failed to load tasks');
    }
    finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try { setStats(await getTaskStats()); } catch (err: any) { console.error('stats error', err); }
  };

  useEffect(() => { fetchData(); fetchStats(); }, [filters, page, pageSize, sortField, sortOrder]);

  const isOverdue = (task: Task) => {
    if (!task.due_date || task.status === 'done') return false;
    return new Date(task.due_date) < new Date(new Date().toDateString());
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as SortField);
      setSortOrder('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === data.length && data.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map(t => t.id));
    }
  };

  const toggleSelectTask = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleExportCSV = () => {
    const headers = [
      { key: 'id', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority' }, { key: 'assignee', label: 'Assignee' }, { key: 'due_date', label: 'Due' },
      { key: 'estimated_hours', label: 'Est Hours' }, { key: 'actual_hours', label: 'Actual Hours' },
      { key: 'tags', label: 'Tags' }, { key: 'created_at', label: 'Created' },
    ];
    const csvData = data.map(t => ({ ...t, due_date: t.due_date || '', created_at: new Date(t.created_at).toLocaleDateString() }));
    exportToCSV(csvData, 'project-tasks', headers);
  };

  const handleExportPDF = () => {
    if (!selectedTask) return;
    printTable([
      { id: selectedTask.id, title: selectedTask.title, status: selectedTask.status,
        priority: selectedTask.priority, assignee: selectedTask.assignee,
        due_date: selectedTask.due_date || 'N/A', estimated_hours: selectedTask.estimated_hours || 'N/A',
        actual_hours: selectedTask.actual_hours || 'N/A', description: selectedTask.description }
    ], `Task #${selectedTask.id}: ${selectedTask.title}`, [
      { key: 'id', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'description', label: 'Description' },
      { key: 'status', label: 'Status' }, { key: 'priority', label: 'Priority' }, { key: 'assignee', label: 'Assignee' },
      { key: 'due_date', label: 'Due Date' }, { key: 'estimated_hours', label: 'Estimated Hours' },
      { key: 'actual_hours', label: 'Actual Hours' },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createTask(formData);
      toast.success('Task created successfully');
      setShowForm(false);
      setFormData({ title: '', description: '', status: 'todo', assignee: '', priority: 'medium', due_date: '', tags: '', estimated_hours: '', actual_hours: '' });
      fetchData(); fetchStats();
    } catch (err: any) {
      console.error('create error', err);
      toast.error(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    const task = data.find(t => t.id === id);
    try {
      await updateTask(id, { status }, task?.version);
      setSelectedTask(prev => prev && prev.id === id ? { ...prev, status: status as 'todo' | 'doing' | 'done' } : prev);
      fetchData(); fetchStats();
    } catch (err: any) {
      console.error('status change error', err);
      toast.error(err.message || 'Failed to update status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this task?')) return;
    setDeletingId(id);
    try {
      await deleteTask(id);
      toast.success('Task deleted');
      if (selectedTask?.id === id) setSelectedTask(null);
      fetchData(); fetchStats();
    } catch (err: any) {
      console.error('delete error', err);
      toast.error(err.message || 'Failed to delete task');
    } finally {
      setDeletingId(null);
    }
  };

  // Bulk delete/status via api
  const bulkDelete = async () => {
    if (!selectedIds.length || !confirm(`Delete ${selectedIds.length} tasks?`)) return;
    try {
      await bulkDeleteTasks(selectedIds);
      toast.success(`${selectedIds.length} tasks deleted`);
      setSelectedIds([]);
      fetchData(); fetchStats();
    } catch (err: any) {
      console.error('bulk delete error', err);
      toast.error(err.message || 'Failed to delete tasks');
    }
  };

  const bulkStatus = async (status: string) => {
    if (!selectedIds.length) return;
    if (!confirm(`Move ${selectedIds.length} tasks to "${status}"?`)) return;
    try {
      await bulkUpdateStatus(selectedIds, status);
      toast.success(`${selectedIds.length} tasks updated to "${status}"`);
      setSelectedIds([]);
      fetchData(); fetchStats();
    } catch (err: any) {
      console.error('bulk status error', err);
      toast.error(err.message || 'Failed to update tasks');
    }
  };

  if (loading && !data.length) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  const totalPages = Math.ceil((stats?.total || 0) / pageSize);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">✅ Project Tasks</h1>
        {user?.role !== 'superadmin' && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Menampilkan task Anda dan yang di-assign ke Anda</p>}
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExportCSV} className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">📊 CSV</button>
          <button onClick={() => setShowFilters(!showFilters)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${showFilters ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white hover:bg-gray-700'}`}>🔍 Filters</button>
          <button onClick={() => setShowSprint(!showSprint)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${showSprint ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white hover:bg-purple-600'}`}>📈 Sprint</button>
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Task</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-white' },
            { label: 'To Do', value: stats.todo, color: 'text-gray-700 dark:text-gray-300' },
            { label: 'Doing', value: stats.doing, color: 'text-blue-600' },
            { label: 'Done', value: stats.done, color: 'text-green-600' },
            { label: 'High', value: stats.high_priority, color: 'text-red-600' },
            { label: 'Overdue', value: stats.overdue, color: 'text-orange-600' },
            { label: 'Rate', value: `${stats.completion_rate}%`, color: 'text-purple-600' },
            { label: 'Showing', value: data.length, color: 'text-gray-900 dark:text-white' },
          ].map((s, i) => (
            <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-blue-800 dark:text-blue-200 font-medium">{selectedIds.length} selected</span>
          <div className="flex gap-2">
            {['todo', 'doing', 'done'].map(s => (
              <button key={s} onClick={() => bulkStatus(s)} className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 capitalize">{s}</button>
            ))}
            <button onClick={bulkDelete} className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">Delete</button>
            <button onClick={() => setSelectedIds([])} className="px-2 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500">Clear</button>
          </div>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-3">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white">New Task</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Title *</label>
              <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Assignee</label>
              <input value={formData.assignee} onChange={e => setFormData({ ...formData, assignee: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Priority</label>
              <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Status</label>
              <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="todo">To Do</option><option value="doing">Doing</option><option value="done">Done</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Due Date</label>
              <input type="date" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Est. Hours</label>
              <input value={formData.estimated_hours} onChange={e => setFormData({ ...formData, estimated_hours: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="8" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Tags</label>
              <input value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Description</label>
            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" rows={2} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="px-4 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button>
            <button type="button" onClick={() => setShowForm(false)} disabled={submitting} className="px-4 py-1.5 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50">Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Search</label>
              <input value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(1); }} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Title/description..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Status</label>
              <select value={filters.status} onChange={e => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="">All</option><option value="todo">To Do</option><option value="doing">Doing</option><option value="done">Done</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Priority</label>
              <select value={filters.priority} onChange={e => { setFilters({ ...filters, priority: e.target.value }); setPage(1); }} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Assignee</label>
              <input value={filters.assignee} onChange={e => { setFilters({ ...filters, assignee: e.target.value }); setPage(1); }} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Assignee name..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Tags</label>
              <input value={filters.tags} onChange={e => { setFilters({ ...filters, tags: e.target.value }); setPage(1); }} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="tag1,tag2..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">From Date</label>
              <input type="date" value={filters.from_date} onChange={e => { setFilters({ ...filters, from_date: e.target.value }); setPage(1); }} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">To Date</label>
              <input type="date" value={filters.to_date} onChange={e => { setFilters({ ...filters, to_date: e.target.value }); setPage(1); }} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={() => { setFilters({ search: '', status: '', priority: '', assignee: '', tags: '', from_date: '', to_date: '' }); setPage(1); }} className="px-3 py-1.5 bg-gray-500 text-white rounded text-sm hover:bg-gray-600">Clear All</button>
          </div>
        </div>
      )}

      {/* Page Size + Pagination Top */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-400">Per page:</label>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-xs text-gray-500 dark:text-gray-400">{stats?.total || 0} total</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">« Prev</button>
          <span className="text-sm text-gray-600 dark:text-gray-400">{page} / {totalPages || 1}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">Next »</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <TaskTable
          tasks={data}
          selectedIds={selectedIds}
          toggleSelectAll={toggleSelectAll}
          toggleSelectTask={toggleSelectTask}
          onSelectRow={setSelectedTask}
          selectedRowId={selectedTask?.id || null}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          isOverdue={isOverdue}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          deletingId={deletingId}
          currentUserId={user?.id || null}
          isSuperadmin={user?.role === 'superadmin'}
        />
      </div>

      {/* Chat Modal */}
      {selectedTask && (
        <TaskChatModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onRefresh={() => { fetchData(); fetchStats(); }}
        />
      )}

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">««</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">«</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4));
            const p = start + i;
            if (p > totalPages) return null;
            return (
              <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 text-sm rounded ${p === page ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'}`}>{p}</button>
            );
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">»</button>
          <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">»»</button>
        </div>
      )}
    </div>
  );
}
