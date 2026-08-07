"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '@/lib/auth';

interface QualityObjective {
  id: number; name: string; tracking_type: string; period: string;
  target_value: number | null; target_unit: string | null;
  checklist_items: string | null; evidence_types: string | null;
}

interface QualityEntry {
  id: number; objective_id: number; entry_date: string; entry_period: string;
  value: number | null; status: string | null; checklist_result: string | null;
  description: string | null; evidence_text: string | null;
  evidence_file: string | null; evidence_url: string | null;
  checked_by: number | null; created_at: string;
}

const TRACKING_LABELS: Record<string, string> = {
  counter: 'Counter', boolean: 'Pass/Fail', percentage: 'Percentage',
  multi_checklist: 'Checklist', score: 'Score',
};

function QualityEntriesContent() {
  const searchParams = useSearchParams();
  const [objectives, setObjectives] = useState<QualityObjective[]>([]);
  const [entries, setEntries] = useState<QualityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QualityEntry | null>(null);
  const [selectedObj, setSelectedObj] = useState<QualityObjective | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filterObjId, setFilterObjId] = useState<string>(searchParams.get('objective_id') || '');
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));

  const [fd, setFd] = useState({
    objective_id: '', entry_date: new Date().toISOString().split('T')[0],
    value: '', status: '', description: '', evidence_text: '', evidence_url: '',
    checklist_result: {} as Record<string, string>,
  });
  const [file, setFile] = useState<File | null>(null);

  const fetchObjectives = async () => {
    try {
      const r = await apiRequest('/api/quality-objectives?page_size=100&is_active=true');
      setObjectives(r.data || []);
    } catch {}
  };

  const fetchEntries = async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      if (filterObjId) params.set('objective_id', filterObjId);
      if (filterYear) params.set('year', filterYear);
      const r = await apiRequest(`/api/quality-entries?${params.toString()}`);
      setEntries(r.data || []);
      setTotalRecords(r.pagination?.total || 0);
    } catch { setEntries([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetchObjectives(); }, []);
  useEffect(() => { fetchEntries(); }, [page, filterObjId, filterYear]);

  useEffect(() => {
    if (filterObjId) {
      const obj = objectives.find(o => o.id === Number(filterObjId));
      setSelectedObj(obj || null);
      setFd(prev => ({ ...prev, objective_id: filterObjId }));
    }
  }, [filterObjId, objectives]);

  const getChecklistItems = (obj: QualityObjective | null): string[] => {
    if (!obj?.checklist_items) return [];
    try { return JSON.parse(obj.checklist_items); } catch { return []; }
  };

  const openCreate = () => {
    setEditing(null);
    const checklist = getChecklistItems(selectedObj);
    const defaultChecklist: Record<string, string> = {};
    checklist.forEach(item => { defaultChecklist[item] = 'pass'; });
    setFd({
      objective_id: filterObjId, entry_date: new Date().toISOString().split('T')[0],
      value: '', status: '', description: '', evidence_text: '', evidence_url: '',
      checklist_result: defaultChecklist,
    });
    setFile(null);
    setShowForm(true);
  };

  const openEdit = (e: QualityEntry) => {
    setEditing(e);
    const obj = objectives.find(o => o.id === e.objective_id);
    setSelectedObj(obj || null);
    let checklistResult: Record<string, string> = {};
    if (e.checklist_result) {
      try { checklistResult = JSON.parse(e.checklist_result); } catch {}
    }
    setFd({
      objective_id: String(e.objective_id), entry_date: e.entry_date,
      value: e.value?.toString() || '', status: e.status || '',
      description: e.description || '', evidence_text: e.evidence_text || '',
      evidence_url: e.evidence_url || '', checklist_result: checklistResult,
    });
    setFile(null);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); setFile(null); };

  const handleObjChange = (objId: string) => {
    setFd({ ...fd, objective_id: objId });
    const obj = objectives.find(o => o.id === Number(objId));
    setSelectedObj(obj || null);
    if (obj) {
      const checklist = getChecklistItems(obj);
      const defaultChecklist: Record<string, string> = {};
      checklist.forEach(item => { defaultChecklist[item] = 'pass'; });
      setFd(prev => ({ ...prev, objective_id: objId, checklist_result: defaultChecklist }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = new FormData();
    f.append('objective_id', fd.objective_id);
    f.append('entry_date', fd.entry_date);
    if (fd.value) f.append('value', fd.value);
    if (fd.status) f.append('status', fd.status);
    if (fd.description) f.append('description', fd.description);
    if (fd.evidence_text) f.append('evidence_text', fd.evidence_text);
    if (fd.evidence_url) f.append('evidence_url', fd.evidence_url);
    if (selectedObj?.tracking_type === 'multi_checklist' && Object.keys(fd.checklist_result).length > 0) {
      f.append('checklist_result', JSON.stringify(fd.checklist_result));
      const allPass = Object.values(fd.checklist_result).every(v => v === 'pass');
      f.append('status', allPass ? 'pass' : 'fail');
    }
    if (file) f.append('file', file);
    const url = editing ? `/api/quality-entries/${editing.id}` : '/api/quality-entries';
    await apiRequest(url, { method: editing ? 'PUT' : 'POST', body: f });
    closeForm(); fetchEntries();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus entry ini?')) return;
    await apiRequest(`/api/quality-entries/${id}`, { method: 'DELETE' });
    fetchEntries();
  };

  const totalPages = Math.ceil(totalRecords / pageSize);
  const objName = (id: number) => objectives.find(o => o.id === id)?.name || `#${id}`;
  const objType = (id: number) => objectives.find(o => o.id === id)?.tracking_type || '';

  const statusBadge = (status: string | null) => {
    if (!status) return null;
    const colors: Record<string, string> = {
      pass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      fail: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.partial}`}>{status}</span>;
  };

  return (
    <div className="p-4 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quality Entries</h1>
          <a href="/modules/quality" className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to Objectives</a>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
          + Log Entry
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterObjId} onChange={e => { setFilterObjId(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm">
          <option value="">All Objectives</option>
          {objectives.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={filterYear} onChange={e => { setFilterYear(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm">
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y =>
            <option key={y} value={y}>{y}</option>
          )}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Objective</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Value</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Description</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Evidence</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No entries found</td></tr>
              ) : entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{e.entry_date}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{objName(e.objective_id)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{TRACKING_LABELS[objType(e.objective_id)] || ''}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {e.value != null ? e.value : '-'}
                  </td>
                  <td className="px-4 py-3">{statusBadge(e.status)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{e.description || '-'}</td>
                  <td className="px-4 py-3">
                    {e.evidence_file && (
                      <a href={`/api/quality-entries/${e.id}/evidence`} target="_blank"
                        className="text-blue-600 hover:text-blue-800 text-xs">File</a>
                    )}
                    {e.evidence_url && (
                      <a href={e.evidence_url} target="_blank" rel="noopener"
                        className="text-blue-600 hover:text-blue-800 text-xs ml-2">URL</a>
                    )}
                    {!e.evidence_file && !e.evidence_url && <span className="text-gray-400 text-xs">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(e)} className="text-yellow-600 hover:text-yellow-800 mr-3 text-xs">Edit</button>
                    <button onClick={() => handleDelete(e.id)} className="text-red-600 hover:text-red-800 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages} ({totalRecords} records)</span>
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
                {editing ? 'Edit Entry' : 'Log New Entry'}
              </h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Objective *</label>
                <select required value={fd.objective_id} onChange={e => handleObjChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <option value="">Select objective...</option>
                  {objectives.map(o => <option key={o.id} value={o.id}>{o.name} ({TRACKING_LABELS[o.tracking_type]})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</label>
                <input type="date" required value={fd.entry_date}
                  onChange={e => setFd({ ...fd, entry_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>

              {selectedObj?.tracking_type === 'counter' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Count</label>
                  <input type="number" step="1" min="0" value={fd.value}
                    onChange={e => setFd({ ...fd, value: e.target.value })}
                    placeholder="1"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              )}

              {selectedObj?.tracking_type === 'boolean' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Result *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="status" value="pass" checked={fd.status === 'pass'}
                        onChange={() => setFd({ ...fd, status: 'pass' })} />
                      <span className="text-green-600 font-medium">Pass</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="status" value="fail" checked={fd.status === 'fail'}
                        onChange={() => setFd({ ...fd, status: 'fail' })} />
                      <span className="text-red-600 font-medium">Fail</span>
                    </label>
                  </div>
                </div>
              )}

              {selectedObj?.tracking_type === 'percentage' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Value (%) {selectedObj.target_value != null && <span className="text-gray-400">- Target: {`>= ${selectedObj.target_value}${selectedObj.target_unit || '%'}`}</span>}
                  </label>
                  <input type="number" step="0.01" min="0" max="100" value={fd.value}
                    onChange={e => setFd({ ...fd, value: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              )}

              {selectedObj?.tracking_type === 'score' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Score {selectedObj.target_value != null && <span className="text-gray-400">- Target: {`>= ${selectedObj.target_value} ${selectedObj.target_unit || ''}`}</span>}
                  </label>
                  <input type="number" step="0.1" value={fd.value}
                    onChange={e => setFd({ ...fd, value: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              )}

              {selectedObj?.tracking_type === 'multi_checklist' && getChecklistItems(selectedObj).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Checklist</label>
                  <div className="space-y-2">
                    {getChecklistItems(selectedObj).map(item => (
                      <div key={item} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                        <select value={fd.checklist_result[item] || 'pass'}
                          onChange={e => setFd({ ...fd, checklist_result: { ...fd.checklist_result, [item]: e.target.value } })}
                          className="px-2 py-1 border rounded text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white">
                          <option value="pass">Pass</option>
                          <option value="fail">Fail</option>
                          <option value="partial">Partial</option>
                          <option value="na">N/A</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description / Notes</label>
                <textarea value={fd.description} onChange={e => setFd({ ...fd, description: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>

              {selectedObj?.evidence_types?.includes('text') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evidence Text</label>
                  <textarea value={fd.evidence_text} onChange={e => setFd({ ...fd, evidence_text: e.target.value })}
                    rows={2} placeholder="Additional evidence notes..."
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              )}

              {selectedObj?.evidence_types?.includes('file') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evidence File</label>
                  <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" />
                  {editing?.evidence_file && <p className="text-xs text-gray-500 mt-1">Current file will be replaced</p>}
                </div>
              )}

              {selectedObj?.evidence_types?.includes('url') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evidence URL</label>
                  <input type="url" value={fd.evidence_url}
                    onChange={e => setFd({ ...fd, evidence_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                <button type="button" onClick={closeForm}
                  className="px-4 py-2 border rounded-lg text-gray-700 dark:text-gray-300 dark:border-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editing ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function QualityEntriesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
      <QualityEntriesContent />
    </Suspense>
  );
}
