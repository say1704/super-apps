"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiRequest, useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { useThemeDetector } from '@/hooks/useTheme';
import ExportButton from '@/components/ExportButton';
import WorklogModal from './components/WorklogModal';
import Lightbox from '@/components/Lightbox';
import ProgressChat from '@/components/ProgressChat';
import TaskChatModal from '../tasks/TaskChatModal';

const CATEGORIES = ['General', 'Meeting', 'Development', 'Maintenance', 'Support', 'Documentation', 'Training', 'Other'];

export default function WorklogModule() {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedWorklog, setSelectedWorklog] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [checklistItems, setChecklistItems] = useState<any[]>([]);
  const [newChecklistName, setNewChecklistName] = useState('');
  const [newChecklistNotes, setNewChecklistNotes] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null);
  const [editingChecklistId, setEditingChecklistId] = useState<number | null>(null);
  const [editChecklistName, setEditChecklistName] = useState('');
  const [editChecklistNotes, setEditChecklistNotes] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [progressEntries, setProgressEntries] = useState<any[]>([]);
  const [linkedTask, setLinkedTask] = useState<any>(null);

  const [page, setPage] = useState(1);
  const [page_size, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    page: 1, page_size: 20, total_records: 0, total_pages: 0, has_next: false, has_prev: false,
  });

  const [sort_by, setSortBy] = useState('created_at');
  const [sort_order, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [filters, setFilters] = useState({
    start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    status: '',
    category: '',
    tags: '',
  });

  const isDark = useThemeDetector();
  const toast = useToast();

  const fetchAllData = async (filterOverrides: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    if (filterOverrides.start_date || filters.start_date) params.append('start_date', filterOverrides.start_date || filters.start_date);
    if (filterOverrides.end_date || filters.end_date) params.append('end_date', filterOverrides.end_date || filters.end_date);
    if (filterOverrides.status || filters.status) params.append('status', filterOverrides.status || filters.status);
    if (filterOverrides.category || filters.category) params.append('category', filterOverrides.category || filters.category);
    if (filterOverrides.tags || filters.tags) params.append('tags', filterOverrides.tags || filters.tags);
    params.append('page', '1');
    params.append('page_size', '10000');
    if (filterOverrides.sort_by || sort_by) params.append('sort_by', filterOverrides.sort_by || sort_by);
    if (filterOverrides.sort_order || sort_order) params.append('sort_order', filterOverrides.sort_order || sort_order);
    const result = await apiRequest(`/api/worklog?${params.toString()}`);
    return result.data || [];
  };

  const [exportData, setExportData] = useState<any[]>([]);

  const exportColumns = useMemo(() => [
    { key: 'date', label: 'Date' },
    { key: 'time', label: 'Time' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'category', label: 'Category' },
    { key: 'tags', label: 'Tags' },
    { key: 'estimated_time', label: 'Estimated' },
    { key: 'actual_time', label: 'Actual' },
    { key: 'notes', label: 'Notes' },
  ], []);

  const fetchExportData = useCallback(async () => {
    try {
      const allData = await fetchAllData();
      setExportData(allData);
    } catch {
      // silent
    }
  }, [filters, sort_by, sort_order]);

  useEffect(() => {
    fetchExportData();
  }, [fetchExportData]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.status) params.append('status', filters.status);
      if (filters.category) params.append('category', filters.category);
      if (filters.tags) params.append('tags', filters.tags);
      params.append('page', page.toString());
      params.append('page_size', page_size.toString());
      params.append('sort_by', sort_by);
      params.append('sort_order', sort_order);

      const result = await apiRequest(`/api/worklog?${params.toString()}`);
      setData(result.data || []);
      setPagination(result.pagination || { page: 1, page_size, total_records: 0, total_pages: 0, has_next: false, has_prev: false });
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load worklog entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      const result = await apiRequest(`/api/worklog/stats?${params.toString()}`);
      setStats(result);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      const result = await apiRequest('/api/project-tasks?status_filter=todo&status_filter=doing');
      setTasks(result.data || result);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchChecklist = async (worklogId: number) => {
    try {
      const result = await apiRequest(`/api/worklog/${worklogId}/checklist`);
      setChecklistItems(result.items || []);
    } catch (error) {
      console.error('Error fetching checklist:', error);
    }
  };

  const fetchProgress = async (worklogId: number) => {
    try {
      const result = await apiRequest(`/api/worklog/${worklogId}/progress`);
      setProgressEntries(result.entries || []);
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  };

  const openLinkedTask = async (taskId: number) => {
    try {
      const result = await apiRequest(`/api/project-tasks/by-ids?ids=${taskId}`);
      const task = result.data?.[0];
      if (task) setLinkedTask(task);
    } catch (error) {
      console.error('Error fetching linked task:', error);
    }
  };

  const addChecklistItem = async () => {
    if (!newChecklistName.trim() || !selectedWorklog) return;
    try {
      const result = await apiRequest(`/api/worklog/${selectedWorklog.id}/checklist`, {
        method: 'POST',
        body: JSON.stringify({ name: newChecklistName.trim(), notes: newChecklistNotes.trim() || null }),
      });
      setChecklistItems([...checklistItems, result]);
      setNewChecklistName('');
      setNewChecklistNotes('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add checklist item');
    }
  };

  const toggleChecklistItem = async (itemId: number) => {
    if (!selectedWorklog) return;
    try {
      const result = await apiRequest(`/api/worklog/${selectedWorklog.id}/checklist/${itemId}/toggle`, { method: 'PATCH' });
      setChecklistItems(checklistItems.map(i => i.id === itemId ? result : i));
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle item');
    }
  };

  const updateChecklistItem = async (itemId: number) => {
    if (!selectedWorklog) return;
    try {
      const result = await apiRequest(`/api/worklog/${selectedWorklog.id}/checklist/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editChecklistName.trim(), notes: editChecklistNotes.trim() || null }),
      });
      setChecklistItems(checklistItems.map(i => i.id === itemId ? result : i));
      setEditingChecklistId(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update item');
    }
  };

  const deleteChecklistItem = async (itemId: number) => {
    if (!selectedWorklog) return;
    if (!confirm('Delete this checklist item?')) return;
    try {
      await apiRequest(`/api/worklog/${selectedWorklog.id}/checklist/${itemId}`, { method: 'DELETE' });
      setChecklistItems(checklistItems.filter(i => i.id !== itemId));
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete item');
    }
  };

  useEffect(() => {
    fetchData();
    fetchStats();
    fetchTasks();
  }, [filters, page, page_size, sort_by, sort_order]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedWorklog(null);
        setEditingChecklistId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSuccess = () => {
    fetchData();
    fetchStats();
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setDrawerOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this worklog entry?')) return;
    try {
      await apiRequest(`/api/worklog/${id}`, { method: 'DELETE' });
      toast.success('Worklog deleted successfully!');
      if (selectedWorklog?.id === id) setSelectedWorklog(null);
      fetchData();
      fetchStats();
    } catch (error) {
      toast.error('Failed to delete worklog');
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const statusCycle = ['in_progress', 'done', 'cancelled'];
    const currentIndex = statusCycle.indexOf(currentStatus);
    if (currentIndex === -1) return;
    const newStatus = statusCycle[(currentIndex + 1) % statusCycle.length];

    setData(data.map(item => item.id === id ? { ...item, status: newStatus } : item));

    try {
      const form = new FormData();
      form.append('status', newStatus);
      await apiRequest(`/api/worklog/${id}/status`, { method: 'PATCH', body: form });
      const label = newStatus === 'done' ? 'Done' : newStatus === 'cancelled' ? 'Cancelled' : 'In Progress';
      toast.success(`Status changed to ${label}`);
      fetchData();
      fetchStats();
    } catch (error) {
      toast.error('Failed to update status');
      setData(data.map(item => item.id === id ? { ...item, status: currentStatus } : item));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) { toast.warning('No items selected'); return; }
    if (!confirm(`Delete ${selectedIds.length} selected items?`)) return;
    try {
      await apiRequest('/api/worklog/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `ids=${selectedIds.join(',')}`,
      });
      toast.success(`Deleted ${selectedIds.length} items!`);
      setSelectedIds([]);
      fetchData();
      fetchStats();
    } catch (error) {
      toast.error('Failed to delete items');
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (selectedIds.length === 0) { toast.warning('No items selected'); return; }
    try {
      await apiRequest('/api/worklog/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `ids=${selectedIds.join(',')}&status=${status}`,
      });
      toast.success(`Updated ${selectedIds.length} items to ${status}!`);
      setSelectedIds([]);
      fetchData();
      fetchStats();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === data.length ? [] : data.map(x => x.id));
  };

  const handleSort = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    setSortBy(sortBy);
    setSortOrder(sortOrder);
    setPage(1);
  };

  const renderSortIndicator = (column: string) => {
    if (sort_by !== column) return null;
    return sort_order === 'desc' ? '🔽' : '🔼';
  };

  const statusColors = (status: string) => {
    if (status === 'done') return 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300';
    if (status === 'cancelled') return 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300';
    return 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300';
  };

  const openLightbox = (photos: string[], index: number) => {
    setLightboxPhotos(photos);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleDeletePhoto = async (worklogId: number, photoIndex: number) => {
    try {
      const item = data.find(d => d.id === worklogId);
      if (!item) return;
      const updatedPhotos = [...(item.photo_urls || [])];
      updatedPhotos.splice(photoIndex, 1);
      const form = new FormData();
      form.append('date', item.date);
      form.append('time', item.time || '');
      form.append('description', item.description);
      form.append('status', item.status);
      form.append('category', item.category || 'General');
      form.append('tags', item.tags || '');
      form.append('estimated_time', item.estimated_time || '');
      form.append('actual_time', item.actual_time || '');
      form.append('notes', item.notes || '');
      if (item.task_id) form.append('task_id', String(item.task_id));
      form.append('remove_photo_indexes', String(photoIndex));
      await apiRequest(`/api/worklog/${worklogId}`, {
        method: 'PUT',
        body: form,
        headers: item.version ? { 'X-Resource-Version': String(item.version) } : undefined,
      });
      toast.success('Photo deleted');
      fetchData();
      if (selectedWorklog?.id === worklogId) {
        setSelectedWorklog({ ...selectedWorklog, photo_urls: updatedPhotos });
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete photo');
    }
  };

  const allSelectedOnPage = data.length > 0 && data.every(t => selectedIds.includes(t.id));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Worklog</h1>
          {user?.role !== 'superadmin' && <p className="text-sm text-gray-500 dark:text-gray-400">Menampilkan data Anda</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.length > 0 && (
            <>
              <button onClick={handleBulkDelete} className="px-4 py-2 rounded-lg font-medium bg-red-600 text-white text-sm">Delete ({selectedIds.length})</button>
              <button onClick={() => handleBulkStatus('done')} className="px-4 py-2 rounded-lg font-medium bg-green-600 text-white text-sm">Mark Done ({selectedIds.length})</button>
              <button onClick={() => handleBulkStatus('cancelled')} className="px-4 py-2 rounded-lg font-medium bg-red-600 text-white text-sm">Mark Cancelled ({selectedIds.length})</button>
              <button onClick={() => handleBulkStatus('in_progress')} className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white text-sm">Mark In Progress ({selectedIds.length})</button>
            </>
          )}
          <ExportButton data={exportData} filename="worklog_report" columns={exportColumns} title="Worklog Report" />
          <button onClick={() => { setEditingItem(null); setDrawerOpen(true); }} className="px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white text-sm">+ Add New</button>
        </div>
      </div>

      {/* Statistics Dashboard */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <StatCard title="Total" value={stats.total} color="blue" isDark={isDark} />
          <StatCard title="Done" value={stats.done} color="green" isDark={isDark} />
          <StatCard title="In Progress" value={stats.in_progress} color="orange" isDark={isDark} />
          <StatCard title="Cancelled" value={stats.cancelled} color="red" isDark={isDark} />
          <StatCard title="Categories" value={stats.categories?.length || 0} color="purple" isDark={isDark} />
          <StatCard title="Est. Hours" value={`${stats.total_estimated_hours}h`} color="teal" isDark={isDark} />
          <StatCard title="Actual Hours" value={`${stats.total_actual_hours}h`} color="cyan" isDark={isDark} />
        </div>
      )}

      {/* Filters (Collapsible) */}
      <div className="mb-6 rounded-lg shadow bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
          <svg className={`w-5 h-5 text-gray-500 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {filtersOpen && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">From Date</label>
                <input type="date" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">To Date</label>
                <input type="date" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Status</label>
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="">All</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Category</label>
                <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="">All</option>
                  {CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tags</label>
                <input type="text" value={filters.tags} onChange={(e) => setFilters({ ...filters, tags: e.target.value })} placeholder="Search tags..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-end">
                <button onClick={() => setFilters({ start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], end_date: new Date().toISOString().split('T')[0], status: '', category: '', tags: '' })} className="w-full px-4 py-2 rounded-lg font-medium bg-gray-500 hover:bg-gray-600 text-white text-sm">Reset</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading worklog entries...</p>
            </div>
          </div>
        )}
        {!loading && (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left w-10">
                    <input type="checkbox" checked={allSelectedOnPage} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 dark:border-gray-500 text-blue-600" />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('date', sort_order === 'desc' ? 'asc' : 'desc')}>
                    <div className="flex items-center gap-2"><span>Date/Time</span>{renderSortIndicator('date')}</div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('description', sort_order === 'desc' ? 'asc' : 'desc')}>
                    <div className="flex items-center gap-2"><span>Description</span>{renderSortIndicator('description')}</div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('category', sort_order === 'desc' ? 'asc' : 'desc')}>
                    <div className="flex items-center gap-2"><span>Category</span>{renderSortIndicator('category')}</div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Photos</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('status', sort_order === 'desc' ? 'asc' : 'desc')}>
                    <div className="flex items-center gap-2"><span>Status</span>{renderSortIndicator('status')}</div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" onClick={() => { setSelectedWorklog(item); fetchChecklist(item.id); fetchProgress(item.id); }}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(e) => { if (!e.target.checked) toggleSelect(item.id); else setSelectedIds(prev => prev.includes(item.id) ? prev : [...prev, item.id]); }} className="w-4 h-4 rounded border-gray-300 dark:border-gray-500 text-blue-600" onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      <div className="text-sm">{item.date}</div>
                      <div className="text-xs text-gray-500">{item.time}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white max-w-[300px]">
                      <div className="text-sm truncate" title={item.description}>{item.description}</div>
                      {item.notes && <div className="text-xs text-gray-500 mt-0.5 truncate">{item.notes}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">{item.category || 'General'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {item.photo_urls && item.photo_urls.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openLightbox(item.photo_urls, 0); }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {item.photo_urls.length}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {item.estimated_time && <div className="text-xs">Est: {item.estimated_time}</div>}
                      {item.actual_time && <div className="text-xs text-gray-500">Act: {item.actual_time}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 select-none ${statusColors(item.status)}`}
                        onClick={(e) => { e.stopPropagation(); handleToggleStatus(item.id, item.status); }}
                        title="Click to toggle status"
                      >
                        {item.status === 'done' ? 'Done' : item.status === 'cancelled' ? 'Cancelled' : 'In Progress'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {(user?.role === 'superadmin' || item.user_id === user?.id) && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm" title="Edit">Edit</button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm" title="Delete">Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">No worklog entries found. Try adjusting your filters.</div>
            )}
          </>
        )}

        {/* Pagination */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Showing {data.length} of {pagination.total_records} entries</span>
            <div className="flex items-center gap-2">
              <select value={page_size} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <button onClick={() => setPage(1)} disabled={!pagination.has_prev} className="px-2 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">First</button>
              <button onClick={() => setPage(page - 1)} disabled={!pagination.has_prev} className="px-2 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Prev</button>
              <span className="text-sm px-2 text-gray-700 dark:text-gray-300">Page {page} of {pagination.total_pages || 1}</span>
              <button onClick={() => setPage(page + 1)} disabled={!pagination.has_next} className="px-2 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Next</button>
              <button onClick={() => setPage(pagination.total_pages)} disabled={!pagination.has_next} className="px-2 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Last</button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedWorklog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedWorklog(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            {/* Header - fixed */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Worklog Detail</h2>
              <button onClick={() => setSelectedWorklog(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Scrollable content */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Date</label>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedWorklog.date}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Time</label>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedWorklog.time}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Description</label>
                <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap">{selectedWorklog.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Category</label>
                  <p className="mt-1"><span className="px-2 py-1 rounded text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">{selectedWorklog.category || 'General'}</span></p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Status</label>
                  <p className="mt-1">
                    <span className={`px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 select-none ${statusColors(selectedWorklog.status)}`}
                      onClick={() => { handleToggleStatus(selectedWorklog.id, selectedWorklog.status); setSelectedWorklog({ ...selectedWorklog, status: selectedWorklog.status === 'in_progress' ? 'done' : selectedWorklog.status === 'done' ? 'cancelled' : 'in_progress' }); }}>
                      {selectedWorklog.status === 'done' ? 'Done' : selectedWorklog.status === 'cancelled' ? 'Cancelled' : 'In Progress'}
                    </span>
                  </p>
                </div>
              </div>
              {selectedWorklog.tags && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Tags</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedWorklog.tags.split(',').map((tag: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">#{tag.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {selectedWorklog.estimated_time && (
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Estimated Time</label>
                    <p className="font-medium text-gray-900 dark:text-white">{selectedWorklog.estimated_time}</p>
                  </div>
                )}
                {selectedWorklog.actual_time && (
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Actual Time</label>
                    <p className="font-medium text-gray-900 dark:text-white">{selectedWorklog.actual_time}</p>
                  </div>
                )}
              </div>
              {selectedWorklog.task_id && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Task</label>
                  <p className="mt-1">
                    <button
                      onClick={() => openLinkedTask(selectedWorklog.task_id)}
                      className="px-2 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors cursor-pointer"
                    >
                      #{selectedWorklog.task_id} — Open Task
                    </button>
                  </p>
                </div>
              )}
              {selectedWorklog.notes && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Notes</label>
                  <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap">{selectedWorklog.notes}</p>
                </div>
              )}

              {/* Photo Gallery */}
              {selectedWorklog.photo_urls && selectedWorklog.photo_urls.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">Photos ({selectedWorklog.photo_urls.length})</label>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedWorklog.photo_urls.map((url: string, index: number) => (
                      <div key={index} className="relative group aspect-square rounded-lg overflow-hidden cursor-pointer" onClick={() => openLightbox(selectedWorklog.photo_urls, index)}>
                        <img src={`/api/proxy/${url}`} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress Chat Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress Updates</label>
                  {progressEntries.length > 0 && (
                    <span className="text-xs text-gray-500">{progressEntries.length} update{progressEntries.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="h-[400px] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
                  <ProgressChat
                    worklogId={selectedWorklog.id}
                    entries={progressEntries}
                    onAdd={(entry) => {
                      setProgressEntries([...progressEntries, entry]);
                      fetchData();
                    }}
                    onDelete={(entryId) => {
                      setProgressEntries(progressEntries.filter(e => e.id !== entryId));
                    }}
                    canModify={user?.role === 'superadmin' || selectedWorklog.user_id === user?.id}
                  />
                </div>
              </div>

              {/* Checklist Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Checklist</label>
                  {checklistItems.length > 0 && (
                    <span className="text-xs text-gray-500">{checklistItems.filter((i: any) => i.is_completed).length}/{checklistItems.length} completed</span>
                  )}
                </div>
                {checklistItems.length > 0 && (
                  <div className="mb-4">
                    <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${checklistItems.length > 0 ? (checklistItems.filter((i: any) => i.is_completed).length / checklistItems.length) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{Math.round((checklistItems.filter((i: any) => i.is_completed).length / (checklistItems.length || 1)) * 100)}% complete</p>
                  </div>
                )}
                <div className="space-y-2 mb-3">
                  {checklistItems.map((item: any) => (
                    <div key={item.id} className={`flex items-start gap-2 p-2 rounded-lg ${item.is_completed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                      <input type="checkbox" checked={item.is_completed} onChange={() => toggleChecklistItem(item.id)} className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-gray-500 text-green-600 cursor-pointer" />
                      <div className="flex-1 min-w-0">
                        {editingChecklistId === item.id ? (
                          <div className="space-y-1">
                            <input type="text" value={editChecklistName} onChange={(e) => setEditChecklistName(e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" onKeyDown={(e) => { if (e.key === 'Enter') updateChecklistItem(item.id); if (e.key === 'Escape') setEditingChecklistId(null); }} />
                            <input type="text" value={editChecklistNotes} onChange={(e) => setEditChecklistNotes(e.target.value)} placeholder="Notes (optional)" className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" onKeyDown={(e) => { if (e.key === 'Enter') updateChecklistItem(item.id); if (e.key === 'Escape') setEditingChecklistId(null); }} />
                            <div className="flex gap-1">
                              <button onClick={() => updateChecklistItem(item.id)} className="text-xs px-2 py-0.5 bg-green-600 text-white rounded">Save</button>
                              <button onClick={() => setEditingChecklistId(null)} className="text-xs px-2 py-0.5 bg-gray-500 text-white rounded">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className={`text-sm ${item.is_completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>{item.name}</span>
                            {item.notes && <span className="text-xs text-gray-500 dark:text-gray-400">— {item.notes}</span>}
                            {(user?.role === 'superadmin' || selectedWorklog.user_id === user?.id) && (
                              <div className="flex gap-1 ml-auto">
                                <button onClick={() => { setEditingChecklistId(item.id); setEditChecklistName(item.name); setEditChecklistNotes(item.notes || ''); }} className="text-xs px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded">Edit</button>
                                <button onClick={() => deleteChecklistItem(item.id)} className="text-xs px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded">Delete</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {(user?.role === 'superadmin' || selectedWorklog.user_id === user?.id) && (
                  <div className="flex gap-2">
                    <input type="text" value={newChecklistName} onChange={(e) => setNewChecklistName(e.target.value)} placeholder="New checklist item" className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(); }} />
                    <button onClick={addChecklistItem} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium">Add</button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer - fixed */}
            {(user?.role === 'superadmin' || selectedWorklog.user_id === user?.id) && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 flex-shrink-0">
                <button onClick={() => { handleEdit(selectedWorklog); setSelectedWorklog(null); }} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">Edit</button>
                <button onClick={() => { handleDelete(selectedWorklog.id); setSelectedWorklog(null); }} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Delete</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Form */}
      <WorklogModal
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingItem(null); }}
        editingItem={editingItem}
        onSuccess={handleSuccess}
        tasks={tasks}
      />

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Linked Task Modal */}
      {linkedTask && (
        <TaskChatModal
          task={linkedTask}
          onClose={() => setLinkedTask(null)}
          onRefresh={() => { fetchData(); fetchStats(); }}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, color, isDark }: { title: string; value: number | string; color: string; isDark: boolean }) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
    purple: 'from-purple-500 to-purple-600',
    teal: 'from-teal-500 to-teal-600',
    cyan: 'from-cyan-500 to-cyan-600',
  };
  return (
    <div className={`rounded-lg p-4 bg-gradient-to-br ${colorMap[color] || colorMap.blue} text-white shadow`}>
      <div className="text-sm font-medium opacity-90">{title}</div>
      <div className="text-2xl font-bold mt-1 truncate" title={String(value)}>{value}</div>
    </div>
  );
}
