"use client";

import { apiRequest } from "@/lib/auth";
import { useEffect, useState } from 'react';
import ExportButton from '@/components/ExportButton';
import UploadedFileViewer from '@/components/uploaded-file-viewer';

interface IncidentReport {
  id: number;
  incident_date: string;
  server_name: string;
  incident_type: string;
  description: string;
  status: string;
  action_taken: string;
  file_path: string;
  version: number;
}

interface StatsData {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
}

export default function IncidentModule() {
  const [data, setData] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    incident_date: new Date().toISOString().split('T')[0],
    server_name: '',
    incident_type: 'Security',
    description: '',
    status: 'Open',
    action_taken: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | null>(null);
  const [previewItem, setPreviewItem] = useState<IncidentReport | null>(null);
  const [stats, setStats] = useState<StatsData>({ total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 });

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('incident_type', filterType);

      const result = await apiRequest(`/api/incident-report?${params.toString()}`);
      setData(result.data || []);
      setTotalRecords(result.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const result = await apiRequest('/api/incident-report/stats');
      setStats(result);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchStats();
  }, [page, filterStatus, filterType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      form.append(key, String(value));
    });
    if (file) {
      form.append('file', file);
    }

    const url = editingId
      ? `/api/incident-report/${editingId}`
      : '/api/incident-report';
    const method = editingId ? 'PUT' : 'POST';

    await apiRequest(url, { method, body: form });

    setShowForm(false);
    setEditingId(null);
    setFormData({
      incident_date: new Date().toISOString().split('T')[0],
      server_name: '',
      incident_type: 'Security',
      description: '',
      status: 'Open',
      action_taken: '',
    });
    setFile(null);
    fetchData();
    fetchStats();
  };

  const handleEdit = (item: IncidentReport) => {
    setEditingId(item.id);
    setFormData({
      incident_date: item.incident_date,
      server_name: item.server_name,
      incident_type: item.incident_type,
      description: item.description,
      status: item.status,
      action_taken: item.action_taken || '',
    });
    setFile(null);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    await apiRequest(`/api/incident-report/${id}`, { method: 'DELETE' });
    fetchData();
    fetchStats();
  };

  const handlePreview = (item: IncidentReport) => {
    setPreviewItem(item);
    setViewMode('preview');
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const totalPages = Math.ceil(totalRecords / pageSize);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          ⚠️ Incident Report
        </h1>
        <div className="flex gap-2">
          <ExportButton
            data={data}
            filename="incident-report"
            title="Incident Report"
            columns={[
              { key: 'incident_date', label: 'Date' },
              { key: 'server_name', label: 'Server' },
              { key: 'incident_type', label: 'Type' },
              { key: 'status', label: 'Status' },
              { key: 'description', label: 'Description' },
              { key: 'action_taken', label: 'Action Taken' },
            ]}
          />
          <button
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                setEditingId(null);
              } else {
                setEditingId(null);
                setFormData({
                  incident_date: new Date().toISOString().split('T')[0],
                  server_name: '',
                  incident_type: 'Security',
                  description: '',
                  status: 'Open',
                  action_taken: '',
                });
                setFile(null);
                setShowForm(true);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : '+ Add New'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Open</div>
          <div className="text-2xl font-bold text-red-600">{stats.open}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">In Progress</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.in_progress}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Resolved</div>
          <div className="text-2xl font-bold text-blue-600">{stats.resolved}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Closed</div>
          <div className="text-2xl font-bold text-green-600">{stats.closed}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="">All</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Type</label>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="">All</option>
            <option value="Security">Security</option>
            <option value="System">System</option>
            <option value="Network">Network</option>
            <option value="Hardware">Hardware</option>
            <option value="Software">Software</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
            {editingId ? '✏️ Edit Incident Report' : '➕ New Incident Report'}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Incident Date *</label>
              <input
                type="date"
                value={formData.incident_date}
                onChange={(e) => setFormData({ ...formData, incident_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Server Name *</label>
              <input
                type="text"
                value={formData.server_name}
                onChange={(e) => setFormData({ ...formData, server_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Incident Type *</label>
              <select
                value={formData.incident_type}
                onChange={(e) => setFormData({ ...formData, incident_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="Security">Security</option>
                <option value="System">System</option>
                <option value="Network">Network</option>
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {editingId ? 'Replace File (optional)' : 'Upload File'}
              </label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                accept=".pdf,.doc,.docx,.jpg,.png"
              />
              {editingId && previewItem?.file_path && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Current: {previewItem.file_path.split('/').pop()}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              rows={3}
              required
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Action Taken</label>
            <textarea
              value={formData.action_taken}
              onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              rows={2}
            />
          </div>
          <button type="submit" className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            {editingId ? 'Update' : 'Save'}
          </button>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Server</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Description</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Action Taken</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium">File</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.id} className="border-t dark:border-gray-700">
                <td className="px-4 py-3">{item.incident_date}</td>
                <td className="px-4 py-3">{item.server_name}</td>
                <td className="px-4 py-3">{item.incident_type}</td>
                <td className="px-4 py-3 max-w-xs truncate">{item.description}</td>
                <td className="px-4 py-3 max-w-xs truncate">{item.action_taken || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    item.status === 'Open' ? 'bg-red-100 text-red-800' :
                    item.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                    item.status === 'Resolved' ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {item.file_path ? (
                    <button
                      onClick={() => handlePreview(item)}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                    >
                      📄 View
                    </button>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="p-8 text-center text-gray-500">No data available</div>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalRecords)} of {totalRecords} records
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-300"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => handlePageChange(p)}
                className={`px-3 py-1 border rounded ${p === page ? 'bg-blue-600 text-white' : 'dark:border-gray-600 dark:text-gray-300'}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-300"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* PDF/File Preview Modal */}
      {viewMode === 'preview' && previewItem && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => { setViewMode(null); setPreviewItem(null); }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[95vw] h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 border-b px-6 py-3 flex justify-between items-center gap-4 bg-white dark:bg-gray-800">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{previewItem.incident_date}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Server: {previewItem.server_name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Type: {previewItem.incident_type}</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{previewItem.file_path?.split('/').pop()}</h2>
              </div>
              <div className="flex gap-2 shrink-0">
                <a
                  href={`/api/proxy/api/v1/incident-report/${previewItem.id}/file`}
                  download
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Download
                </a>
                <button onClick={() => { setViewMode(null); setPreviewItem(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-2xl text-gray-500">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <UploadedFileViewer
                doc={{ id: previewItem.id, file_path: previewItem.file_path }}
                downloadUrl={`/api/proxy/api/v1/incident-report/${previewItem.id}/file`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
