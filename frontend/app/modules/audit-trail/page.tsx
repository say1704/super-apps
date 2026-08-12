"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';

interface AuditFinding {
  id: number;
  finding_number: string;
  source: string;
  iso_standard: string;
  clause: string;
  title: string;
  description: string;
  evidence: string | null;
  severity: string;
  status: string;
  auditor_name: string;
  audit_date: string;
  risk_id: number | null;
  responsible_user_id: number | null;
  due_date: string | null;
  owner_role: string | null;
  created_at: string;
  created_by: number;
  updated_at: string;
  version: number;
  // Intertek format fields
  client_name: string | null;
  site_location: string | null;
  audit_type: string | null;
  scope: string | null;
  criteria: string | null;
  finding_category: string | null;
  root_cause: string | null;
  follow_up_date: string | null;
  verification_effectiveness: string | null;
}

interface CorrectiveAction {
  id: number;
  finding_id: number;
  action_description: string;
  responsible_user_id: number | null;
  due_date: string;
  status: string;
  completion_date: string | null;
  verification_notes: string | null;
  verified_by: number | null;
  verified_at: string | null;
  attachments: string | null;
  created_at: string;
  created_by: number;
  updated_at: string;
  version: number;
  // Intertek format fields
  action_plan: string | null;
  timeline: string | null;
  resources_required: string | null;
  effectiveness_criteria: string | null;
  follow_up_actions: string | null;
}

interface StatsData {
  total: number;
  open: number;
  in_progress: number;
  closed: number;
  overdue: number;
  by_severity: {
    minor: number;
    major: number;
    critical: number;
  };
}

const SOURCES = [
  { value: 'internal', label: 'Internal Audit' },
  { value: 'external', label: 'External Audit' },
  { value: 'surveillance', label: 'Surveillance Audit' },
];

const ISO_STANDARDS = [
  { value: 'ISO 27001:2022', label: 'ISO 27001:2022' },
  { value: 'ISO 9001:2015', label: 'ISO 9001:2015' },
];

const SEVERITIES = [
  { value: 'minor', label: 'Minor', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'major', label: 'Major', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
];

const STATUSES = [
  { value: 'open', label: 'Open', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'closed', label: 'Closed', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
];

const ACTION_STATUSES = [
  { value: 'pending', label: 'Pending', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'verified', label: 'Verified', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'closed', label: 'Closed', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
];

const EMPTY_FORM = {
  source: 'internal',
  iso_standard: 'ISO 27001:2022',
  clause: '',
  title: '',
  description: '',
  evidence: '',
  severity: 'minor',
  status: 'open',
  auditor_name: '',
  audit_date: new Date().toISOString().split('T')[0],
  risk_id: '',
  responsible_user_id: '',
  due_date: '',
  // Intertek format fields
  client_name: '',
  site_location: '',
  audit_type: '',
  scope: '',
  criteria: '',
  finding_category: '',
  root_cause: '',
  follow_up_date: '',
  verification_effectiveness: '',
};

const EMPTY_ACTION_FORM = {
  action_description: '',
  due_date: new Date().toISOString().split('T')[0],
  responsible_user_id: '',
  status: 'pending',
  // Intertek format fields
  action_plan: '',
  timeline: '',
  resources_required: '',
  effectiveness_criteria: '',
  follow_up_actions: '',
};

export default function AuditTrailPage() {
  const [data, setData] = useState<AuditFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AuditFinding | null>(null);
  const [fd, setFd] = useState({ ...EMPTY_FORM });

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filterSource, setFilterSource] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [stats, setStats] = useState<StatsData>({
    total: 0, open: 0, in_progress: 0, closed: 0, overdue: 0,
    by_severity: { minor: 0, major: 0, critical: 0 }
  });

  // Detail modal state
  const [showDetail, setShowDetail] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<AuditFinding | null>(null);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [showActionForm, setShowActionForm] = useState(false);
  const [editingAction, setEditingAction] = useState<CorrectiveAction | null>(null);
  const [actionFd, setActionFd] = useState({ ...EMPTY_ACTION_FORM });

  // Risk assessment dropdown
  const [risks, setRisks] = useState<Array<{ id: number; nama_isu: string; proses_bisnis: string }>>([]);

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      if (filterSource) params.set('source', filterSource);
      if (filterSeverity) params.set('severity', filterSeverity);
      if (filterStatus) params.set('status', filterStatus);
      const result = await apiRequest(`/api/audit-trail/findings?${params.toString()}`);
      setData(result.data || []);
      setTotalRecords(result.pagination?.total || 0);
    } catch { setData([]); } finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try { setStats(await apiRequest('/api/audit-trail/stats')); } catch {}
  };

  const fetchRisks = async () => {
    try {
      const result = await apiRequest('/api/audit-trail/risks');
      setRisks(result.data || []);
    } catch {}
  };

  useEffect(() => { fetchData(); fetchStats(); fetchRisks(); }, [page, filterSource, filterSeverity, filterStatus]);

  const openCreate = () => { setEditing(null); setFd({ ...EMPTY_FORM }); setShowForm(true); };

  const openEdit = (f: AuditFinding) => {
    setEditing(f);
    setFd({
      source: f.source,
      iso_standard: f.iso_standard,
      clause: f.clause,
      title: f.title,
      description: f.description,
      evidence: f.evidence || '',
      severity: f.severity,
      status: f.status,
      auditor_name: f.auditor_name,
      audit_date: f.audit_date,
      risk_id: f.risk_id ? String(f.risk_id) : '',
      responsible_user_id: f.responsible_user_id ? String(f.responsible_user_id) : '',
      due_date: f.due_date || '',
      // Intertek format fields
      client_name: f.client_name || '',
      site_location: f.site_location || '',
      audit_type: f.audit_type || '',
      scope: f.scope || '',
      criteria: f.criteria || '',
      finding_category: f.finding_category || '',
      root_cause: f.root_cause || '',
      follow_up_date: f.follow_up_date || '',
      verification_effectiveness: f.verification_effectiveness || '',
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: any = {
      source: fd.source,
      iso_standard: fd.iso_standard,
      clause: fd.clause,
      title: fd.title,
      description: fd.description,
      severity: fd.severity,
      status: fd.status,
      auditor_name: fd.auditor_name,
      audit_date: fd.audit_date,
    };
    if (fd.evidence) body.evidence = fd.evidence;
    if (fd.risk_id) body.risk_id = parseInt(fd.risk_id);
    if (fd.responsible_user_id) body.responsible_user_id = parseInt(fd.responsible_user_id);
    if (fd.due_date) body.due_date = fd.due_date;
    
    // Intertek format fields
    if (fd.client_name) body.client_name = fd.client_name;
    if (fd.site_location) body.site_location = fd.site_location;
    if (fd.audit_type) body.audit_type = fd.audit_type;
    if (fd.scope) body.scope = fd.scope;
    if (fd.criteria) body.criteria = fd.criteria;
    if (fd.finding_category) body.finding_category = fd.finding_category;
    if (fd.root_cause) body.root_cause = fd.root_cause;
    if (fd.follow_up_date) body.follow_up_date = fd.follow_up_date;
    if (fd.verification_effectiveness) body.verification_effectiveness = fd.verification_effectiveness;

    const url = editing ? `/api/audit-trail/findings/${editing.id}` : '/api/audit-trail/findings';
    await apiRequest(url, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    closeForm(); fetchData(); fetchStats();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus audit finding ini?')) return;
    await apiRequest(`/api/audit-trail/findings/${id}`, { method: 'DELETE' });
    fetchData(); fetchStats();
  };

  const openDetail = async (f: AuditFinding) => {
    setSelectedFinding(f);
    setShowDetail(true);
    // Fetch corrective actions
    try {
      const result = await apiRequest(`/api/audit-trail/findings/${f.id}/corrective-actions`);
      setCorrectiveActions(result.data || []);
    } catch { setCorrectiveActions([]); }
  };

  const closeDetail = () => {
    setShowDetail(false);
    setSelectedFinding(null);
    setCorrectiveActions([]);
  };

  const openActionCreate = () => {
    setEditingAction(null);
    setActionFd({ ...EMPTY_ACTION_FORM });
    setShowActionForm(true);
  };

  const openActionEdit = (a: CorrectiveAction) => {
    setEditingAction(a);
    setActionFd({
      action_description: a.action_description,
      due_date: a.due_date,
      responsible_user_id: a.responsible_user_id ? String(a.responsible_user_id) : '',
      status: a.status,
      // Intertek format fields
      action_plan: a.action_plan || '',
      timeline: a.timeline || '',
      resources_required: a.resources_required || '',
      effectiveness_criteria: a.effectiveness_criteria || '',
      follow_up_actions: a.follow_up_actions || '',
    });
    setShowActionForm(true);
  };

  const closeActionForm = () => {
    setShowActionForm(false);
    setEditingAction(null);
  };

  const submitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinding) return;

    const body: any = {
      action_description: actionFd.action_description,
      due_date: actionFd.due_date,
      status: actionFd.status,
    };
    if (actionFd.responsible_user_id) body.responsible_user_id = parseInt(actionFd.responsible_user_id);
    
    // Intertek format fields
    if (actionFd.action_plan) body.action_plan = actionFd.action_plan;
    if (actionFd.timeline) body.timeline = actionFd.timeline;
    if (actionFd.resources_required) body.resources_required = actionFd.resources_required;
    if (actionFd.effectiveness_criteria) body.effectiveness_criteria = actionFd.effectiveness_criteria;
    if (actionFd.follow_up_actions) body.follow_up_actions = actionFd.follow_up_actions;

    const url = editingAction
      ? `/api/audit-trail/corrective-actions/${editingAction.id}`
      : `/api/audit-trail/findings/${selectedFinding.id}/corrective-actions`;
    await apiRequest(url, { method: editingAction ? 'PUT' : 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    closeActionForm();
    // Refresh corrective actions
    const result = await apiRequest(`/api/audit-trail/findings/${selectedFinding.id}/corrective-actions`);
    setCorrectiveActions(result.data || []);
  };

  const handleVerifyAction = async (actionId: number) => {
    const notes = prompt('Verification notes (optional):');
    const body: any = {};
    if (notes) body.verification_notes = notes;
    await apiRequest(`/api/audit-trail/corrective-actions/${actionId}/verify`, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
    // Refresh corrective actions
    if (selectedFinding) {
      const result = await apiRequest(`/api/audit-trail/findings/${selectedFinding.id}/corrective-actions`);
      setCorrectiveActions(result.data || []);
    }
  };

  const handleDeleteAction = async (actionId: number) => {
    if (!confirm('Hapus corrective action ini?')) return;
    await apiRequest(`/api/audit-trail/corrective-actions/${actionId}`, { method: 'DELETE' });
    // Refresh corrective actions
    if (selectedFinding) {
      const result = await apiRequest(`/api/audit-trail/findings/${selectedFinding.id}/corrective-actions`);
      setCorrectiveActions(result.data || []);
    }
  };

  const totalPages = Math.ceil(totalRecords / pageSize);
  const severityColor = (s: string) => SEVERITIES.find(x => x.value === s)?.color || '';
  const statusColor = (s: string) => STATUSES.find(x => x.value === s)?.color || '';
  const isOverdue = (f: AuditFinding) => {
    if (!f.due_date || f.status === 'closed') return false;
    return new Date(f.due_date) < new Date();
  };

  const exportCSV = async () => {
    const params = new URLSearchParams();
    if (filterSource) params.set('source', filterSource);
    if (filterSeverity) params.set('severity', filterSeverity);
    if (filterStatus) params.set('status', filterStatus);
    
    const response = await fetch(`/api/audit-trail/export/csv?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
    });
    
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_findings_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  const exportPDF = async () => {
    const params = new URLSearchParams();
    if (filterSource) params.set('source', filterSource);
    if (filterSeverity) params.set('severity', filterSeverity);
    if (filterStatus) params.set('status', filterStatus);

    try {
      const result = await apiRequest(`/api/audit-trail/export/data?${params.toString()}`);
      if (!result.data || result.data.length === 0) {
        alert('Tidak ada data untuk diekspor dengan filter saat ini');
        return;
      }
      const { exportAuditTrailPDF } = await import('@/lib/export');
      await exportAuditTrailPDF(result, {
        source: filterSource,
        severity: filterSeverity,
        status: filterStatus,
      });
    } catch (err: any) {
      alert('Gagal membuat laporan PDF: ' + (err.message || 'Unknown error'));
    }
  };

  return (
    <div className="p-4 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Trail</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
            📥 Export CSV
          </button>
          <button onClick={exportPDF} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
            📄 Export PDF
          </button>
          <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            + New Finding
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Findings</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Open</p>
          <p className="text-2xl font-bold text-red-600">{stats.open}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">In Progress</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.in_progress}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Closed</p>
          <p className="text-2xl font-bold text-green-600">{stats.closed}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Overdue</p>
          <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm">
          <option value="">All Sources</option>
          {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterSeverity} onChange={e => { setFilterSeverity(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm">
          <option value="">All Severities</option>
          {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Finding #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">ISO Standard</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Severity</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Auditor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Due Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No findings found</td></tr>
              ) : (
                data.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(f)} className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline">
                        {f.finding_number}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{f.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{f.clause}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{f.iso_standard}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColor(f.severity)}`}>
                        {f.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(f.status)}`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{f.auditor_name}</td>
                    <td className="px-4 py-3 text-xs">
                      {f.due_date ? (
                        <span className={isOverdue(f) ? 'text-red-600 font-bold' : ''}>
                          {new Date(f.due_date).toLocaleDateString('id-ID')}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(f)} className="text-blue-600 hover:text-blue-800 text-xs">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(f.id)} className="text-red-600 hover:text-red-800 text-xs">
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

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 border rounded disabled:opacity-50 dark:border-gray-600 dark:text-white">
            Previous
          </button>
          <span className="px-3 py-1 dark:text-white">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1 border rounded disabled:opacity-50 dark:border-gray-600 dark:text-white">
            Next
          </button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4 dark:text-white">
                {editing ? 'Edit Finding' : 'New Finding'}
              </h2>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Source</label>
                    <select value={fd.source} onChange={e => setFd({ ...fd, source: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">ISO Standard</label>
                    <select value={fd.iso_standard} onChange={e => setFd({ ...fd, iso_standard: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {ISO_STANDARDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Clause</label>
                    <input type="text" value={fd.clause} onChange={e => setFd({ ...fd, clause: e.target.value })}
                      placeholder="e.g., 9.2.2" required
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Severity</label>
                    <select value={fd.severity} onChange={e => setFd({ ...fd, severity: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Title</label>
                  <input type="text" value={fd.title} onChange={e => setFd({ ...fd, title: e.target.value })}
                    required className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Description</label>
                  <textarea value={fd.description} onChange={e => setFd({ ...fd, description: e.target.value })}
                    rows={3} required
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Evidence (optional)</label>
                  <textarea value={fd.evidence} onChange={e => setFd({ ...fd, evidence: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Auditor Name</label>
                    <input type="text" value={fd.auditor_name} onChange={e => setFd({ ...fd, auditor_name: e.target.value })}
                      required className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Audit Date</label>
                    <input type="date" value={fd.audit_date} onChange={e => setFd({ ...fd, audit_date: e.target.value })}
                      required className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Status</label>
                    <select value={fd.status} onChange={e => setFd({ ...fd, status: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Due Date (optional)</label>
                    <input type="date" value={fd.due_date} onChange={e => setFd({ ...fd, due_date: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>

                {/* Intertek Format Fields */}
                <div className="border-t dark:border-gray-700 pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-3 dark:text-white">Intertek Format Details</h3>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">Client Name</label>
                      <input type="text" value={fd.client_name} onChange={e => setFd({ ...fd, client_name: e.target.value })}
                        placeholder="e.g., PT ABC"
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">Site Location</label>
                      <input type="text" value={fd.site_location} onChange={e => setFd({ ...fd, site_location: e.target.value })}
                        placeholder="e.g., Jakarta Office"
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">Audit Type</label>
                      <select value={fd.audit_type} onChange={e => setFd({ ...fd, audit_type: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <option value="">-- Select --</option>
                        <option value="initial">Initial Certification</option>
                        <option value="surveillance">Surveillance Audit</option>
                        <option value="recertification">Recertification Audit</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">Finding Category</label>
                      <select value={fd.finding_category} onChange={e => setFd({ ...fd, finding_category: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <option value="">-- Select --</option>
                        <option value="conformity">Conformity</option>
                        <option value="non_conformity">Non-Conformity</option>
                        <option value="observation">Observation</option>
                        <option value="ofi">Opportunity for Improvement</option>
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Scope</label>
                    <textarea value={fd.scope} onChange={e => setFd({ ...fd, scope: e.target.value })}
                      rows={2} placeholder="Audit scope details"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Criteria</label>
                    <textarea value={fd.criteria} onChange={e => setFd({ ...fd, criteria: e.target.value })}
                      rows={2} placeholder="Standards/criteria used"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Root Cause Analysis</label>
                    <textarea value={fd.root_cause} onChange={e => setFd({ ...fd, root_cause: e.target.value })}
                      rows={2} placeholder="Root cause of the finding"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">Follow-up Date</label>
                      <input type="date" value={fd.follow_up_date} onChange={e => setFd({ ...fd, follow_up_date: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Verification of Effectiveness</label>
                    <textarea value={fd.verification_effectiveness} onChange={e => setFd({ ...fd, verification_effectiveness: e.target.value })}
                      rows={2} placeholder="How effectiveness will be verified"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Related Risk Assessment (optional)</label>
                  <select value={fd.risk_id} onChange={e => setFd({ ...fd, risk_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="">-- No related risk --</option>
                    {risks.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.nama_isu} - {r.proses_bisnis}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    {editing ? 'Update' : 'Create'}
                  </button>
                  <button type="button" onClick={closeForm} className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 dark:bg-gray-600 dark:text-white">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showDetail && selectedFinding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold dark:text-white">
                  {selectedFinding.finding_number} - {selectedFinding.title}
                </h2>
                <button onClick={closeDetail} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl">
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Source</p>
                  <p className="dark:text-white">{selectedFinding.source}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">ISO Standard</p>
                  <p className="dark:text-white">{selectedFinding.iso_standard}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Clause</p>
                  <p className="dark:text-white">{selectedFinding.clause}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Severity</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColor(selectedFinding.severity)}`}>
                    {selectedFinding.severity}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(selectedFinding.status)}`}>
                    {selectedFinding.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Auditor</p>
                  <p className="dark:text-white">{selectedFinding.auditor_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Audit Date</p>
                  <p className="dark:text-white">{new Date(selectedFinding.audit_date).toLocaleDateString('id-ID')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Due Date</p>
                  <p className={`dark:text-white ${isOverdue(selectedFinding) ? 'text-red-600 font-bold' : ''}`}>
                    {selectedFinding.due_date ? new Date(selectedFinding.due_date).toLocaleDateString('id-ID') : '-'}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</p>
                <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedFinding.description}</p>
              </div>

              {selectedFinding.evidence && (
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evidence</p>
                  <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedFinding.evidence}</p>
                </div>
              )}

              {/* Intertek Format Details */}
              {(selectedFinding.client_name || selectedFinding.site_location || selectedFinding.audit_type || 
                selectedFinding.scope || selectedFinding.criteria || selectedFinding.finding_category || 
                selectedFinding.root_cause || selectedFinding.follow_up_date || selectedFinding.verification_effectiveness) && (
                <div className="border-t dark:border-gray-700 pt-4 mb-6">
                  <h3 className="text-lg font-bold dark:text-white mb-4">Intertek Format Details</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {selectedFinding.client_name && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Client Name</p>
                        <p className="dark:text-white">{selectedFinding.client_name}</p>
                      </div>
                    )}
                    {selectedFinding.site_location && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Site Location</p>
                        <p className="dark:text-white">{selectedFinding.site_location}</p>
                      </div>
                    )}
                    {selectedFinding.audit_type && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Audit Type</p>
                        <p className="dark:text-white">{selectedFinding.audit_type}</p>
                      </div>
                    )}
                    {selectedFinding.finding_category && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Finding Category</p>
                        <p className="dark:text-white">{selectedFinding.finding_category}</p>
                      </div>
                    )}
                  </div>
                  {selectedFinding.scope && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Scope</p>
                      <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedFinding.scope}</p>
                    </div>
                  )}
                  {selectedFinding.criteria && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Criteria</p>
                      <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedFinding.criteria}</p>
                    </div>
                  )}
                  {selectedFinding.root_cause && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Root Cause Analysis</p>
                      <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedFinding.root_cause}</p>
                    </div>
                  )}
                  {selectedFinding.follow_up_date && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Follow-up Date</p>
                      <p className="dark:text-white">{new Date(selectedFinding.follow_up_date).toLocaleDateString('id-ID')}</p>
                    </div>
                  )}
                  {selectedFinding.verification_effectiveness && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Verification of Effectiveness</p>
                      <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedFinding.verification_effectiveness}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold dark:text-white">Corrective Actions</h3>
                  <button onClick={openActionCreate} className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    + Add Action
                  </button>
                </div>

                {correctiveActions.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No corrective actions yet</p>
                ) : (
                  <div className="space-y-3">
                    {correctiveActions.map(action => (
                      <div key={action.id} className="border dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{action.action_description}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Due: {new Date(action.due_date).toLocaleDateString('id-ID')}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${ACTION_STATUSES.find(s => s.value === action.status)?.color || ''}`}>
                            {action.status}
                          </span>
                        </div>
                        {action.verification_notes && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                            <span className="font-medium">Verification:</span> {action.verification_notes}
                          </p>
                        )}
                        <div className="flex gap-2 mt-3">
                          {action.status !== 'verified' && action.status !== 'closed' && (
                            <button onClick={() => handleVerifyAction(action.id)} className="text-blue-600 hover:text-blue-800 text-xs">
                              Verify
                            </button>
                          )}
                          <button onClick={() => openActionEdit(action)} className="text-blue-600 hover:text-blue-800 text-xs">
                            Edit
                          </button>
                          <button onClick={() => handleDeleteAction(action.id)} className="text-red-600 hover:text-red-800 text-xs">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showActionForm && selectedFinding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4 dark:text-white">
                {editingAction ? 'Edit Corrective Action' : 'New Corrective Action'}
              </h2>
              <form onSubmit={submitAction} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Action Description</label>
                  <textarea value={actionFd.action_description} onChange={e => setActionFd({ ...actionFd, action_description: e.target.value })}
                    rows={3} required
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Due Date</label>
                    <input type="date" value={actionFd.due_date} onChange={e => setActionFd({ ...actionFd, due_date: e.target.value })}
                      required className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Status</label>
                    <select value={actionFd.status} onChange={e => setActionFd({ ...actionFd, status: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Intertek Format Fields for Corrective Action */}
                <div className="border-t dark:border-gray-700 pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-3 dark:text-white">Intertek Format Details</h3>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Action Plan</label>
                    <textarea value={actionFd.action_plan} onChange={e => setActionFd({ ...actionFd, action_plan: e.target.value })}
                      rows={3} placeholder="Detailed action plan"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Timeline</label>
                    <textarea value={actionFd.timeline} onChange={e => setActionFd({ ...actionFd, timeline: e.target.value })}
                      rows={2} placeholder="Implementation timeline"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Resources Required</label>
                    <textarea value={actionFd.resources_required} onChange={e => setActionFd({ ...actionFd, resources_required: e.target.value })}
                      rows={2} placeholder="Resources needed (people, budget, tools)"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Effectiveness Criteria</label>
                    <textarea value={actionFd.effectiveness_criteria} onChange={e => setActionFd({ ...actionFd, effectiveness_criteria: e.target.value })}
                      rows={2} placeholder="How to measure effectiveness"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Follow-up Actions</label>
                    <textarea value={actionFd.follow_up_actions} onChange={e => setActionFd({ ...actionFd, follow_up_actions: e.target.value })}
                      rows={2} placeholder="Follow-up actions needed"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    {editingAction ? 'Update' : 'Create'}
                  </button>
                  <button type="button" onClick={closeActionForm} className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 dark:bg-gray-600 dark:text-white">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
