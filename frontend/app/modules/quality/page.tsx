"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';

interface QualityObjective {
  id: number;
  name: string;
  category: string;
  description: string | null;
  tracking_type: string;
  period: string;
  target_value: number | null;
  target_unit: string | null;
  evidence_types: string | null;
  checklist_items: string | null;
  is_active: boolean;
  owner_role: string | null;
  created_at: string;
  created_by: number | null;
}

interface StatsData {
  total_objectives: number;
  active_objectives: number;
  total_entries: number;
  by_category: Record<string, number>;
  by_tracking_type: Record<string, number>;
}

const CATEGORIES = ['security', 'service', 'availability', 'compliance', 'performance', 'other'];
const TRACKING_TYPES = [
  { value: 'counter', label: 'Counter (hitung kejadian)' },
  { value: 'boolean', label: 'Boolean (pass/fail)' },
  { value: 'percentage', label: 'Percentage (%)' },
  { value: 'multi_checklist', label: 'Multi Checklist' },
  { value: 'score', label: 'Score (nilai)' },
];
const PERIODS = [
  { value: 'per_event', label: 'Per Kejadian' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Tahunan' },
];

const EMPTY_FORM = {
  name: '', category: 'security', tracking_type: 'counter',
  description: '', period: 'monthly', target_value: '' as string | number,
  target_unit: '', evidence_types: 'text', checklist_items: '',
};

export default function QualityObjectivesPage() {
  const [data, setData] = useState<QualityObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QualityObjective | null>(null);
  const [fd, setFd] = useState({ ...EMPTY_FORM });

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [stats, setStats] = useState<StatsData>({ total_objectives: 0, active_objectives: 0, total_entries: 0, by_category: {}, by_tracking_type: {} });

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      if (filterCategory) params.set('category', filterCategory);
      if (filterType) params.set('tracking_type', filterType);
      const result = await apiRequest(`/api/quality-objectives?${params.toString()}`);
      setData(result.data || []);
      setTotalRecords(result.pagination?.total || 0);
    } catch { setData([]); } finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try { setStats(await apiRequest('/api/quality-objectives/stats')); } catch {}
  };

  useEffect(() => { fetchData(); fetchStats(); }, [page, filterCategory, filterType]);

  const openCreate = () => { setEditing(null); setFd({ ...EMPTY_FORM }); setShowForm(true); };

  const openEdit = (o: QualityObjective) => {
    setEditing(o);
    setFd({
      name: o.name, category: o.category, tracking_type: o.tracking_type,
      description: o.description || '', period: o.period,
      target_value: o.target_value ?? '', target_unit: o.target_unit || '',
      evidence_types: o.evidence_types || 'text',
      checklist_items: o.checklist_items ? JSON.parse(o.checklist_items).join('\n') : '',
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = new FormData();
    f.append('name', fd.name);
    f.append('category', fd.category);
    f.append('tracking_type', fd.tracking_type);
    if (fd.description) f.append('description', fd.description);
    f.append('period', fd.period);
    if (fd.target_value !== '' && fd.target_value !== null) f.append('target_value', String(fd.target_value));
    if (fd.target_unit) f.append('target_unit', fd.target_unit);
    f.append('evidence_types', fd.evidence_types);
    if (fd.tracking_type === 'multi_checklist' && fd.checklist_items) {
      const items = fd.checklist_items.split('\n').map(s => s.trim()).filter(Boolean);
      f.append('checklist_items', JSON.stringify(items));
    }
    const url = editing ? `/api/quality-objectives/${editing.id}` : '/api/quality-objectives';
    await apiRequest(url, { method: editing ? 'PUT' : 'POST', body: f });
    closeForm(); fetchData(); fetchStats();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus objective ini beserta semua entries-nya?')) return;
    await apiRequest(`/api/quality-objectives/${id}`, { method: 'DELETE' });
    fetchData(); fetchStats();
  };

  const toggleActive = async (o: QualityObjective) => {
    const f = new FormData();
    f.append('is_active', String(!o.is_active));
    await apiRequest(`/api/quality-objectives/${o.id}`, { method: 'PUT', body: f });
    fetchData();
  };

  const totalPages = Math.ceil(totalRecords / pageSize);
  const typeLabel = (t: string) => TRACKING_TYPES.find(x => x.value === t)?.label || t;
  const periodLabel = (p: string) => PERIODS.find(x => x.value === p)?.label || p;
  const catColors: Record<string, string> = {
    security: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    service: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    availability: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    compliance: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    performance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <div className="p-4 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quality Objectives</h1>
        <div className="flex gap-2">
          <a href="/modules/quality-entries" className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm">
            Entries
          </a>
          <a href="/modules/quality-report" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
            Report
          </a>
          <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            + Objective
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Objectives</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_objectives}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
          <p className="text-2xl font-bold text-green-600">{stats.active_objectives}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Entries</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total_entries}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Categories</p>
          <p className="text-2xl font-bold text-purple-600">{Object.keys(stats.by_category).length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm">
          <option value="">All Types</option>
          {TRACKING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Category</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Period</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Target</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No objectives found</td></tr>
              ) : data.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white select-none">{o.name}</div>
                    {o.description && <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{o.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${catColors[o.category] || catColors.other}`}>
                      {o.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{typeLabel(o.tracking_type)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{periodLabel(o.period)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {o.target_value != null ? `${o.target_value} ${o.target_unit || ''}`.trim() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(o)}
                      className={`px-2 py-1 rounded-full text-xs font-medium ${o.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {o.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/modules/quality-entries?objective_id=${o.id}`}
                      className="text-blue-600 hover:text-blue-800 mr-3 text-xs">Entries</a>
                    <button onClick={() => openEdit(o)} className="text-yellow-600 hover:text-yellow-800 mr-3 text-xs">Edit</button>
                    <button onClick={() => handleDelete(o.id)} className="text-red-600 hover:text-red-800 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages} ({totalRecords} records)
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 dark:border-gray-600 dark:text-white">Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 dark:border-gray-600 dark:text-white">Next</button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editing ? 'Edit Objective' : 'New Objective'}
              </h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input type="text" required value={fd.name} onChange={e => setFd({ ...fd, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
                  <select value={fd.category} onChange={e => setFd({ ...fd, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tracking Type *</label>
                  <select value={fd.tracking_type} onChange={e => setFd({ ...fd, tracking_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {TRACKING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea value={fd.description} onChange={e => setFd({ ...fd, description: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Period</label>
                  <select value={fd.period} onChange={e => setFd({ ...fd, period: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evidence Types</label>
                  <select value={fd.evidence_types} onChange={e => setFd({ ...fd, evidence_types: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="text">Text only</option>
                    <option value="text,file">Text + File</option>
                    <option value="text,url">Text + URL</option>
                    <option value="text,file,url">Text + File + URL</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Value</label>
                  <input type="number" step="any" value={fd.target_value}
                    onChange={e => setFd({ ...fd, target_value: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Unit</label>
                  <input type="text" value={fd.target_unit} placeholder="%, requests, etc"
                    onChange={e => setFd({ ...fd, target_unit: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>
              {fd.tracking_type === 'multi_checklist' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Checklist Items (one per line)
                  </label>
                  <textarea value={fd.checklist_items} onChange={e => setFd({ ...fd, checklist_items: e.target.value })}
                    rows={4} placeholder={"Firewall rules\nPassword policy\nAccess control\nLog review"}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                <button type="button" onClick={closeForm}
                  className="px-4 py-2 border rounded-lg text-gray-700 dark:text-gray-300 dark:border-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
