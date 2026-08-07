"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiRequest } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { exportIRMCReportPDF } from '@/lib/export';

interface IrmcFolder {
  id: number;
  name: string;
  description: string | null;
  color: string;
  created_by: number | null;
  created_at: string | null;
  checks_count: number;
}

interface IrmcCheck {
  id: number;
  server_name: string;
  check_date: string;
  screenshot_path: string | null;
  notes: string | null;
  folder_id: number | null;
  status: string;
  created_at: string | null;
  created_by: number | null;
}

interface IrmcStats {
  total: number;
  pass: number;
  warning: number;
  fail: number;
  pending: number;
}

export default function IRMCModule() {
  const toast = useToast();
  const [folders, setFolders] = useState<IrmcFolder[]>([]);
  const [checks, setChecks] = useState<IrmcCheck[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<IrmcFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [showCheckForm, setShowCheckForm] = useState(false);
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [folderForm, setFolderForm] = useState({ name: '', description: '', color: 'blue' });
  const [checkForm, setCheckForm] = useState({ server_name: '', check_date: new Date().toISOString().split('T')[0], notes: '', status: 'pending' });
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState<IrmcStats | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'folder' | 'check'; id: number; name: string } | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingCheck, setEditingCheck] = useState<IrmcCheck | null>(null);
  const [editForm, setEditForm] = useState({ server_name: '', check_date: '', notes: '', status: 'pending', folder_id: '' as string | number });
  const [editFile, setEditFile] = useState<File | null>(null);
  const [showEditFolderForm, setShowEditFolderForm] = useState(false);
  const [editingFolder, setEditingFolder] = useState<IrmcFolder | null>(null);
  const [editFolderForm, setEditFolderForm] = useState({ name: '', description: '', color: 'blue' });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [dataRange, setDataRange] = useState<{ earliest_date: string | null; latest_date: string | null } | null>(null);
  const today = new Date().toISOString().split('T')[0];

  const fetchFolders = useCallback(async () => {
    try {
      const result = await apiRequest('/api/irmc-folders?page=1&page_size=50');
      setFolders(result.data || []);
    } catch {
      setFolders([]);
    }
  }, []);

  const fetchChecks = useCallback(async () => {
    setLoading(true);
    try {
      let url = selectedFolder
        ? `/api/irmc-folders/${selectedFolder.id}/checks?page=${page}&page_size=20`
        : `/api/irmc-check?page=${page}&page_size=20${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`;

      // Add date range filter if provided
      if (fromDate && toDate) {
        url += `${url.includes('?') ? '&' : '?'}from_date=${fromDate}&to_date=${toDate}`;
      }

      const result = await apiRequest(url);
      setChecks(result.data || []);
      setTotalRecords(result.pagination?.total_records || 0);
    } catch {
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }, [page, selectedFolder, statusFilter, fromDate, toDate]);

  const fetchStats = useCallback(async () => {
    try {
      let url = '/api/irmc-check/stats';
      if (fromDate && toDate) {
        url += `?from_date=${fromDate}&to_date=${toDate}`;
      }
      const result = await apiRequest(url);
      setStats(result);
      if (result.data_range) {
        setDataRange(result.data_range);
      }
    } catch {
      setStats(null);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchFolders(); fetchStats(); }, []);
  useEffect(() => { fetchChecks(); }, [fetchChecks]);

  const lastAutoRange = useRef('');
  const handleExportPDF = useCallback(async (force = false) => {
    if (!fromDate || !toDate) {
      alert('Please select both from and to dates');
      return;
    }
    if (fromDate > toDate) {
      alert('From date must be before or equal to to date');
      return;
    }
    const diffDays = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 365) { alert('Date range maximum 365 days'); return; }
    const rangeKey = `${fromDate}_${toDate}`;
    if (!force && lastAutoRange.current === rangeKey) return;
    lastAutoRange.current = rangeKey;
    setReportLoading(true);
    try {
      const data = await apiRequest(`/api/v1/irmc-reports/daily?from_date=${fromDate}&to_date=${toDate}`);
      if (!data.checks || data.checks.length === 0) {
        alert(`No IRMC check data available for ${fromDate} to ${toDate}.`);
        return;
      }
      await exportIRMCReportPDF(data, fromDate, toDate);
    } catch (err: any) {
      console.error('Export failed:', err);
    } finally {
      setReportLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    const t = setTimeout(() => handleExportPDF(), 800);
    return () => clearTimeout(t);
  }, [fromDate, toDate, handleExportPDF]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderForm.name.trim()) return;
    await apiRequest('/api/irmc-folders', {
      method: 'POST',
      body: JSON.stringify(folderForm),
      headers: { 'Content-Type': 'application/json' },
    });
    setShowFolderForm(false);
    setFolderForm({ name: '', description: '', color: 'blue' });
    fetchFolders();
  };

  const handleDeleteFolder = (id: number) => {
    const folder = folders.find(f => f.id === id);
    setDeleteConfirm({ type: 'folder', id, name: folder?.name || `Folder #${id}` });
  };

  const handleEditFolder = (folder: IrmcFolder) => {
    setEditingFolder(folder);
    setEditFolderForm({ name: folder.name, description: folder.description || '', color: folder.color });
    setShowEditFolderForm(true);
    setShowFolderForm(false);
  };

  const handleUpdateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !editFolderForm.name.trim()) return;
    await apiRequest(`/api/irmc-folders/${editingFolder.id}`, {
      method: 'PUT',
      body: JSON.stringify(editFolderForm),
      headers: { 'Content-Type': 'application/json' },
    });
    setShowEditFolderForm(false);
    setEditingFolder(null);
    setEditFolderForm({ name: '', description: '', color: 'blue' });
    fetchFolders();
  };

  const handleCreateCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkForm.server_name.trim()) return;
    const form = new FormData();
    form.append('server_name', checkForm.server_name);
    form.append('check_date', checkForm.check_date);
    form.append('notes', checkForm.notes || '');
    form.append('status', checkForm.status);
    if (selectedFolder) form.append('folder_id', String(selectedFolder.id));
    if (checkFile) form.append('screenshot', checkFile);
    await apiRequest('/api/irmc-check', { method: 'POST', body: form });
    setShowCheckForm(false);
    setCheckForm({ server_name: '', check_date: new Date().toISOString().split('T')[0], notes: '', status: 'pending' });
    setCheckFile(null);
    fetchChecks();
    fetchFolders();
    fetchStats();
  };

  const handleDeleteCheck = (id: number) => {
    const check = checks.find(c => c.id === id);
    setDeleteConfirm({ type: 'check', id, name: check?.server_name || `Check #${id}` });
  };

  const handleEditCheck = (check: IrmcCheck) => {
    setEditingCheck(check);
    setEditForm({
      server_name: check.server_name,
      check_date: check.check_date,
      notes: check.notes || '',
      status: check.status,
      folder_id: check.folder_id || '',
    });
    setEditFile(null);
    setShowEditForm(true);
    setShowCheckForm(false);
  };

  const handleUpdateCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCheck || !editForm.server_name.trim()) return;
    const form = new FormData();
    form.append('server_name', editForm.server_name);
    form.append('check_date', editForm.check_date);
    form.append('notes', editForm.notes || '');
    form.append('status', editForm.status);
    if (editForm.folder_id) form.append('folder_id', String(editForm.folder_id));
    if (editFile) form.append('screenshot', editFile);
    await apiRequest(`/api/irmc-check/${editingCheck.id}`, { method: 'PUT', body: form });
    setShowEditForm(false);
    setEditingCheck(null);
    setEditForm({ server_name: '', check_date: '', notes: '', status: 'pending', folder_id: '' });
    setEditFile(null);
    fetchChecks();
    fetchFolders();
    fetchStats();
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    const endpoint = type === 'folder'
      ? `/api/irmc-folders/${id}`
      : `/api/irmc-check/${id}`;
    await apiRequest(endpoint, { method: 'DELETE' });
    setDeleteConfirm(null);
    if (type === 'folder') {
      if (selectedFolder?.id === id) setSelectedFolder(null);
      fetchFolders();
    }
    fetchChecks();
    if (type === 'check') {
      fetchFolders();
      fetchStats();
    }
  };

  const handlePreviewImage = async (checkId: number) => {
    setPreviewLoading(true);
    try {
      const token = sessionStorage.getItem('sa_auth_token');
      const response = await fetch(`/api/proxy/api/v1/irmc-check/${checkId}/screenshot`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Failed to load image');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewImage(url);
    } catch {
      toast.error('Failed to load screenshot');
    } finally {
      setPreviewLoading(false);
    }
  };

  const totalPages = Math.ceil(totalRecords / 20);

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300',
    green: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300',
    purple: 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300',
    orange: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-300',
    red: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300',
    teal: 'bg-teal-100 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-300',
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pass': return 'Pass';
      case 'warning': return 'Warning';
      case 'fail': return 'Fail';
      default: return 'Pending';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'warning': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      case 'fail': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    }
  };

  if (loading && checks.length === 0) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">IRMC Checks</h1>
          {selectedFolder && (
            <button
              onClick={() => setSelectedFolder(null)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              All Folders
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowFolderForm(!showFolderForm)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
            {showFolderForm ? 'Cancel' : '+ New Folder'}
          </button>
          <button onClick={() => setShowCheckForm(!showCheckForm)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            {showCheckForm ? 'Cancel' : '+ Add Check'}
          </button>
          <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden ml-2">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
              title="List view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
              title="Card view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {stats && !selectedFolder && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-sm text-blue-600 dark:text-blue-400">Total</div>
            <div className="text-3xl font-bold">{stats.total}</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-sm text-green-600 dark:text-green-400">Pass</div>
            <div className="text-3xl font-bold">{stats.pass}</div>
          </div>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="text-sm text-yellow-600 dark:text-yellow-400">Warning</div>
            <div className="text-3xl font-bold">{stats.warning}</div>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-sm text-red-600 dark:text-red-400">Fail</div>
            <div className="text-3xl font-bold">{stats.fail}</div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
            <div className="text-3xl font-bold">{stats.pending}</div>
          </div>
        </div>
      )}

      {showFolderForm && (
        <form onSubmit={handleCreateFolder} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Create Folder</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text" placeholder="Folder name (e.g., 10.150.70.11)" required
              value={folderForm.name} onChange={e => setFolderForm({ ...folderForm, name: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <input
              type="text" placeholder="Description (optional)"
              value={folderForm.description} onChange={e => setFolderForm({ ...folderForm, description: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <select
              value={folderForm.color} onChange={e => setFolderForm({ ...folderForm, color: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="blue">Blue</option>
              <option value="green">Green</option>
              <option value="purple">Purple</option>
              <option value="orange">Orange</option>
              <option value="red">Red</option>
              <option value="teal">Teal</option>
            </select>
          </div>
          <button type="submit" className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
            Create Folder
          </button>
        </form>
      )}

      {showEditFolderForm && editingFolder && (
        <form onSubmit={handleUpdateFolder} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border-l-4 border-purple-500">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
            Edit Folder "{editingFolder.name}"
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text" placeholder="Folder name" required
              value={editFolderForm.name} onChange={e => setEditFolderForm({ ...editFolderForm, name: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <input
              type="text" placeholder="Description (optional)"
              value={editFolderForm.description} onChange={e => setEditFolderForm({ ...editFolderForm, description: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <select
              value={editFolderForm.color} onChange={e => setEditFolderForm({ ...editFolderForm, color: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="blue">Blue</option>
              <option value="green">Green</option>
              <option value="purple">Purple</option>
              <option value="orange">Orange</option>
              <option value="red">Red</option>
              <option value="teal">Teal</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => { setShowEditFolderForm(false); setEditingFolder(null); }}
              className="px-4 py-2 border rounded-lg text-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!selectedFolder && folders.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Folders</h2>
          {viewMode === 'list' ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-10"></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Description</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Checks</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {folders.map(folder => (
                    <tr key={folder.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setSelectedFolder(folder)}>
                      <td className="px-4 py-3">
                        <span className={`inline-block w-3 h-3 rounded-full`} style={{ backgroundColor: folder.color === 'blue' ? '#3b82f6' : folder.color === 'green' ? '#22c55e' : folder.color === 'purple' ? '#a855f7' : folder.color === 'orange' ? '#f97316' : folder.color === 'red' ? '#ef4444' : folder.color === 'teal' ? '#14b8a6' : '#3b82f6' }} />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{folder.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">{folder.description || '--'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">{folder.checks_count}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditFolder(folder); }}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${colorMap[folder.color] || colorMap.blue}`}
                >
                  <div className="flex justify-between items-start">
                    <div onClick={() => setSelectedFolder(folder)} className="flex-1">
                      <div className="font-semibold text-lg">{folder.name}</div>
                      {folder.description && <div className="text-sm opacity-75 mt-1">{folder.description}</div>}
                      <div className="text-sm mt-2 font-medium">{folder.checks_count} check{folder.checks_count !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="flex gap-2 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditFolder(folder); }}
                        className="text-blue-500 hover:text-blue-700 text-sm"
                        title="Edit folder"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                        className="text-red-500 hover:text-red-700 text-sm"
                        title="Delete folder"
                      >
                        X
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCheckForm && (
        <form onSubmit={handleCreateCheck} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
            Add IRMC Check {selectedFolder && `to "${selectedFolder.name}"`}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text" placeholder="Server name / IP" required
              value={checkForm.server_name} onChange={e => setCheckForm({ ...checkForm, server_name: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <input
              type="date" required
              value={checkForm.check_date} onChange={e => setCheckForm({ ...checkForm, check_date: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <select
              value={checkForm.status} onChange={e => setCheckForm({ ...checkForm, status: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="pending">Pending</option>
              <option value="pass">Pass</option>
              <option value="warning">Warning</option>
              <option value="fail">Fail</option>
            </select>
            <input
              type="file" accept="image/*" onChange={e => setCheckFile(e.target.files?.[0] || null)}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={checkForm.notes} onChange={e => setCheckForm({ ...checkForm, notes: e.target.value })}
            className="mt-3 w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            rows={2}
          />
          <button type="submit" className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            Save Check
          </button>
        </form>
      )}

      {showEditForm && editingCheck && (
        <form onSubmit={handleUpdateCheck} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border-l-4 border-blue-500">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
            Edit IRMC Check for "{editingCheck.server_name}"
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text" placeholder="Server name / IP" required
              value={editForm.server_name} onChange={e => setEditForm({ ...editForm, server_name: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <input
              type="date" required
              value={editForm.check_date} onChange={e => setEditForm({ ...editForm, check_date: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <select
              value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="pending">Pending</option>
              <option value="pass">Pass</option>
              <option value="warning">Warning</option>
              <option value="fail">Fail</option>
            </select>
            <input
              type="file" accept="image/*" onChange={e => setEditFile(e.target.files?.[0] || null)}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
            className="mt-3 w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            rows={2}
          />
          {editingCheck.screenshot_path && !editFile && (
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Current screenshot: {editingCheck.screenshot_path.split('/').pop()} (upload new to replace)
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => { setShowEditForm(false); setEditingCheck(null); }}
              className="px-4 py-2 border rounded-lg text-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-4 items-center">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Filter by Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="pass">Pass</option>
            <option value="warning">Warning</option>
            <option value="fail">Fail</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <div className="flex items-center gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">📅 From:</label>
            <input
              type="date"
              max={today}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">To:</label>
            <input
              type="date"
              max={today}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          {dataRange && dataRange.earliest_date && dataRange.latest_date && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Data: {dataRange.earliest_date} to {dataRange.latest_date}
            </div>
          )}
          <button
            onClick={() => handleExportPDF(true)}
            disabled={reportLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
          >
            {reportLoading ? '⏳' : '📄'} PDF Report
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Server</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Screenshot</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {checks.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No checks found</td></tr>
                ) : (
                  checks.map(check => (
                    <tr key={check.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{check.server_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{check.check_date}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(check.status)}`}>
                          {getStatusBadge(check.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {check.screenshot_path ? (
                          <button
                            onClick={() => handlePreviewImage(check.id)}
                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">{check.notes || '--'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => handleEditCheck(check)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCheck(check.id)}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          {checks.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-500 dark:text-gray-400">No checks found</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {checks.map(check => (
                <div key={check.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">{check.server_name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{check.check_date}</div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(check.status)}`}>
                      {getStatusBadge(check.status)}
                    </span>
                  </div>
                  {check.notes && (
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-3 line-clamp-2">{check.notes}</div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div>
                      {check.screenshot_path ? (
                        <button
                          onClick={() => handlePreviewImage(check.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                          View Screenshot
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">No screenshot</span>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleEditCheck(check)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCheck(check.id)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {totalRecords} records
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border disabled:opacity-50 dark:border-gray-600 dark:text-white"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm dark:text-white">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded border disabled:opacity-50 dark:border-gray-600 dark:text-white"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Confirm Delete
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {deleteConfirm.type === 'folder'
                ? `Delete folder "${deleteConfirm.name}"? Checks will be unassigned, not deleted.`
                : `Delete IRMC check for "${deleteConfirm.name}"?`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border rounded-lg text-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4" onClick={() => { URL.revokeObjectURL(previewImage); setPreviewImage(null); }}>
          <div className="relative max-w-5xl max-h-full">
            <button
              onClick={() => { URL.revokeObjectURL(previewImage); setPreviewImage(null); }}
              className="absolute -top-10 right-0 text-white text-2xl hover:text-gray-300"
            >
              X Close
            </button>
            {previewLoading ? (
              <div className="text-white text-center py-20">Loading...</div>
            ) : (
              <img
                src={previewImage}
                alt="IRMC Screenshot"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
