"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';
import { useToast } from '@/components/toast';
import ExportButton from '@/components/ExportButton';
import UploadedFileViewer from '@/components/uploaded-file-viewer';

interface FormItem {
  id: number;
  form_type: string;
  file_name: string;
  upload_date: string;
  pic: string | null;
  notes: string | null;
  file_path: string;
  folder_id: number | null;
  created_by: number;
  owner_role: string;
}

interface FolderItem {
  id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
  owner_role: string;
  created_by: number | null;
}

interface FolderTreeNode {
  id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
  children: FolderTreeNode[];
  file_count: number;
}

interface FormTypeItem {
  id: number;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  owner_role: string;
}

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
};

export default function FormsModule() {
  const toast = useToast();
  const [data, setData] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('');
  const [formData, setFormData] = useState({
    form_type: '',
    upload_date: new Date().toISOString().split('T')[0],
    pic: '',
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [editingItem, setEditingItem] = useState<FormItem | null>(null);

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string>('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  const [formTypes, setFormTypes] = useState<FormTypeItem[]>([]);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<FormTypeItem | null>(null);
  const [creatingType, setCreatingType] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: '', description: '', color: 'blue', icon: '📄' });
  const [submittingType, setSubmittingType] = useState(false);

  const [viewingItem, setViewingItem] = useState<FormItem | null>(null);

  const fetchFolders = async () => {
    try {
      const [treeRes, listRes] = await Promise.all([
        apiRequest('/api/form-folders/tree'),
        apiRequest('/api/form-folders'),
      ]);
      setFolderTree(treeRes || []);
      setFolders(listRes || []);
    } catch (error: any) {
      console.error('Failed to fetch folders:', error);
    }
  };

  const fetchFormTypes = async () => {
    try {
      const res = await apiRequest('/api/form-types');
      const active = (res || []).filter((t: FormTypeItem) => t.is_active);
      setFormTypes(active);
      if (active.length > 0 && !formData.form_type) {
        setFormData(prev => ({ ...prev, form_type: active[0].name }));
      }
    } catch (error: any) {
      console.error('Failed to fetch form types:', error);
      setFormTypes([
        { id: 1, name: 'Change', description: 'Change request forms', color: 'blue', icon: '📝', sort_order: 0, is_active: true, owner_role: '' },
        { id: 2, name: 'Destruction', description: 'Document destruction forms', color: 'purple', icon: '🗑️', sort_order: 1, is_active: true, owner_role: '' },
      ]);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/api/form-uploads?page=${page}&page_size=${pageSize}`;
      if (selectedFolderId !== null) url += `&folder_id=${selectedFolderId}`;
      if (searchQuery.trim()) url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      if (selectedTypeFilter) url += `&form_type=${encodeURIComponent(selectedTypeFilter)}`;
      const result = await apiRequest(url);
      setData(result.data || []);
      setTotalRecords(result.pagination?.total_records || 0);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch form uploads');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFolders(); fetchFormTypes(); }, []);
  useEffect(() => { fetchData(); }, [page, selectedFolderId, searchQuery, selectedTypeFilter]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      toast.error('Folder name is required');
      return;
    }
    setCreatingFolder(true);
    try {
      const body: any = { name: newFolderName.trim() };
      if (newFolderParent) body.parent_id = parseInt(newFolderParent);
      await apiRequest('/api/form-folders', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
      toast.success('Folder created');
      setShowFolderModal(false);
      setNewFolderName('');
      setNewFolderParent('');
      fetchFolders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (id: number) => {
    if (!confirm('Delete this folder? It must be empty (no files or subfolders).')) return;
    try {
      await apiRequest(`/api/form-folders/${id}`, { method: 'DELETE' });
      toast.success('Folder deleted');
      if (selectedFolderId === id) setSelectedFolderId(null);
      fetchFolders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete folder');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !editingItem) {
      toast.error('Please select a file');
      return;
    }
    setSubmitting(true);
    try {
      if (editingItem) {
        const form = new FormData();
        form.append('form_type', formData.form_type);
        form.append('upload_date', formData.upload_date);
        form.append('pic', formData.pic);
        form.append('notes', formData.notes);
        if (selectedFolderId !== null) {
          form.append('folder_id', String(selectedFolderId));
        }
        if (file) {
          form.append('file', file);
        }

        await apiRequest(`/api/form-uploads/${editingItem.id}`, {
          method: 'PUT',
          body: form,
        });

        toast.success('Form updated successfully');
      } else {
        const form = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
          form.append(key, value);
        });
        form.append('file', file!);
        if (selectedFolderId !== null) {
          form.append('folder_id', String(selectedFolderId));
        }

        await apiRequest('/api/form-uploads', {
          method: 'POST',
          body: form,
        });

        toast.success('Form uploaded successfully');
      }
      setShowForm(false);
      setEditingItem(null);
      setFormData({
        form_type: formTypes[0]?.name || '',
        upload_date: new Date().toISOString().split('T')[0],
        pic: '',
        notes: '',
      });
      setFile(null);
      setPage(1);
      fetchData();
      fetchFolders();
    } catch (error: any) {
      toast.error(error.message || (editingItem ? 'Failed to update form' : 'Failed to upload form'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    setDeletingId(id);
    try {
      await apiRequest(`/api/form-uploads/${id}`, {
        method: 'DELETE',
      });
      toast.success('Form deleted');
      fetchData();
      fetchFolders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete form');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = async (item: FormItem) => {
    setEditingItem(item);
    setFormData({
      form_type: item.form_type,
      upload_date: item.upload_date,
      pic: item.pic || '',
      notes: item.notes || '',
    });
    setFile(null);
    setShowForm(true);
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeForm.name.trim()) {
      toast.error('Type name is required');
      return;
    }
    setSubmittingType(true);
    try {
      if (editingType) {
        await apiRequest(`/api/form-types/${editingType.id}`, {
          method: 'PUT',
          body: JSON.stringify(typeForm),
          headers: { 'Content-Type': 'application/json' },
        });
        toast.success('Form type updated');
      } else {
        await apiRequest('/api/form-types', {
          method: 'POST',
          body: JSON.stringify(typeForm),
          headers: { 'Content-Type': 'application/json' },
        });
        toast.success('Form type created');
      }
      setCreatingType(false);
      setEditingType(null);
      setTypeForm({ name: '', description: '', color: 'blue', icon: '📄' });
      fetchFormTypes();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save form type');
    } finally {
      setSubmittingType(false);
    }
  };

  const handleDeleteType = async (id: number, name: string) => {
    if (!confirm(`Delete form type "${name}"? It must have no files.`)) return;
    try {
      await apiRequest(`/api/form-types/${id}`, { method: 'DELETE' });
      toast.success('Form type deleted');
      fetchFormTypes();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete form type');
    }
  };

  const openEditType = (t: FormTypeItem) => {
    setEditingType(t);
    setCreatingType(false);
    setTypeForm({ name: t.name, description: t.description || '', color: t.color, icon: t.icon });
  };

  const openNewType = () => {
    setEditingType(null);
    setCreatingType(true);
    setTypeForm({ name: '', description: '', color: 'blue', icon: '📄' });
  };

  const openTypeManager = () => {
    setShowTypeModal(true);
    setCreatingType(false);
    setEditingType(null);
  };

  const closeTypeForm = () => {
    setCreatingType(false);
    setEditingType(null);
    setTypeForm({ name: '', description: '', color: 'blue', icon: '📄' });
  };

  const toggleFolder = (id: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getFolderName = (folderId: number | null) => {
    if (!folderId) return 'Uncategorized';
    const folder = folders.find(f => f.id === folderId);
    return folder ? folder.name : 'Unknown';
  };

  const getTypeBadge = (typeName: string) => {
    const ft = formTypes.find(t => t.name === typeName);
    const colorClass = ft ? (COLOR_MAP[ft.color] || COLOR_MAP.gray) : COLOR_MAP.gray;
    const icon = ft ? ft.icon : '📄';
    return (
      <span className={`px-2 py-1 rounded text-xs ${colorClass}`}>
        {icon} {typeName}
      </span>
    );
  };

  const renderFolderTree = (nodes: FolderTreeNode[], depth: number = 0) => {
    return nodes.map(node => (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
            selectedFolderId === node.id ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            setSelectedFolderId(selectedFolderId === node.id ? null : node.id);
            setPage(1);
          }}
        >
          {node.children.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleFolder(node.id); }}
              className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {expandedFolders.has(node.id) ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="truncate flex-1">{node.name}</span>
          <span className="text-xs text-gray-400 ml-1">({node.file_count})</span>
        </div>
        {expandedFolders.has(node.id) && node.children.length > 0 && (
          <div>{renderFolderTree(node.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  if (loading && data.length === 0) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div className="flex gap-4">
      {/* Folder Sidebar */}
      <div className="w-56 flex-shrink-0">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Folders</h2>
            <button
              onClick={() => setShowFolderModal(true)}
              className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              title="New Folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
          <div
            className={`py-1 px-2 rounded cursor-pointer text-sm mb-1 hover:bg-gray-100 dark:hover:bg-gray-700 ${
              selectedFolderId === null ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-700 dark:text-gray-300'
            }`}
            onClick={() => { setSelectedFolderId(null); setPage(1); }}
          >
            <svg className="w-4 h-4 text-gray-400 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            All Files
          </div>
          {renderFolderTree(folderTree)}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Form Uploads</h1>
          <div className="flex gap-2">
            <button
              onClick={openTypeManager}
              className="px-3 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600 text-sm"
            >
              Manage Types
            </button>
            <ExportButton
              data={data}
              filename="form-uploads"
              title="Form Uploads"
              columns={[
                { key: 'form_type', label: 'Type' },
                { key: 'file_name', label: 'File Name' },
                { key: 'upload_date', label: 'Date' },
                { key: 'pic', label: 'PIC' },
                { key: 'notes', label: 'Notes' },
              ]}
            />
            <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {showForm ? 'Cancel' : '+ Add New'}
            </button>
          </div>
        </div>

        {/* Search + Filter Bar */}
        <div className="mb-4 flex gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              placeholder="Search by filename..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
            />
          </div>
          <select
            value={selectedTypeFilter}
            onChange={(e) => { setSelectedTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm min-w-[160px]"
          >
            <option value="">All Types</option>
            {formTypes.map(t => (
              <option key={t.id} value={t.name}>{t.icon} {t.name}</option>
            ))}
          </select>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Form Type *</label>
                <select value={formData.form_type} onChange={(e) => setFormData({ ...formData, form_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700">
                  {formTypes.map(t => (
                    <option key={t.id} value={t.name}>{t.icon} {t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Upload Date *</label>
                <input type="date" value={formData.upload_date} onChange={(e) => setFormData({ ...formData, upload_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PIC</label>
                <input type="text" value={formData.pic} onChange={(e) => setFormData({ ...formData, pic: e.target.value })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Folder</label>
                <select
                  value={selectedFolderId ?? ''}
                  onChange={(e) => setSelectedFolderId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700"
                >
                  <option value="">No folder (Uncategorized)</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700" rows={2} />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Upload File *</label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700" required />
            </div>
            <button type="submit" disabled={submitting} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {submitting ? 'Uploading...' : 'Save'}
            </button>
          </form>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Form Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium">File Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Folder</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Upload Date</th>
                <th className="px-4 py-3 text-left text-sm font-medium">PIC</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Notes</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id} className="border-t dark:border-gray-700">
                  <td className="px-4 py-3">{getTypeBadge(item.form_type)}</td>
                  <td className="px-4 py-3">{item.file_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{getFolderName(item.folder_id)}</span>
                  </td>
                  <td className="px-4 py-3">{item.upload_date}</td>
                  <td className="px-4 py-3">{item.pic || '-'}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{item.notes || '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleEdit(item)} className="text-green-600 hover:text-green-800 mr-3">Edit</button>
                    <button onClick={() => setViewingItem(item)} className="text-blue-600 hover:text-blue-800 mr-3">View</button>
                    <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="text-red-600 hover:text-red-800 disabled:opacity-50">
                      {deletingId === item.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 && <div className="p-8 text-center text-gray-500">No data available</div>}
          {totalRecords > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-700">
              <span className="text-sm text-gray-500">
                Showing {data.length} of {totalRecords} entries
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm rounded border disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm dark:text-gray-300">Page {page}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * pageSize >= totalRecords}
                  className="px-3 py-1 text-sm rounded border disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFolderModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Create New Folder</h2>
            <form onSubmit={handleCreateFolder}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Folder Name *</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g., Q1 2026 Forms"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  autoFocus
                  maxLength={100}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Parent Folder (optional)</label>
                <select
                  value={newFolderParent}
                  onChange={(e) => setNewFolderParent(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="">None (root level)</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowFolderModal(false); setNewFolderName(''); setNewFolderParent(''); }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingFolder ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Form Types Modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowTypeModal(false); setCreatingType(false); setEditingType(null); }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[520px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              {editingType ? 'Edit Form Type' : creatingType ? 'New Form Type' : 'Manage Form Types'}
            </h2>

            {!creatingType && !editingType && (
              <div className="mb-4">
                <div className="space-y-2">
                  {formTypes.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{t.icon}</span>
                        <span className="font-medium text-sm">{t.name}</span>
                        {t.description && <span className="text-xs text-gray-400">— {t.description}</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditType(t)} className="p-1 text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                        <button onClick={() => handleDeleteType(t.id, t.name)} className="p-1 text-red-600 hover:text-red-800 text-sm">Delete</button>
                      </div>
                    </div>
                  ))}
                  {formTypes.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No form types yet</p>}
                </div>
                <button
                  onClick={openNewType}
                  className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  + Add New Type
                </button>
              </div>
            )}

            {(creatingType || editingType) && (
              <form onSubmit={handleSaveType}>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Name *</label>
                  <input
                    type="text"
                    value={typeForm.name}
                    onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    maxLength={100}
                    autoFocus
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Description</label>
                  <input
                    type="text"
                    value={typeForm.description}
                    onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    maxLength={500}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Color</label>
                    <select
                      value={typeForm.color}
                      onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    >
                      {Object.keys(COLOR_MAP).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Icon</label>
                    <input
                      type="text"
                      value={typeForm.icon}
                      onChange={(e) => setTypeForm({ ...typeForm, icon: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      maxLength={20}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeTypeForm}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingType || !typeForm.name.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                  >
                    {submittingType ? 'Saving...' : editingType ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {viewingItem && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setViewingItem(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[95vw] h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 border-b px-6 py-3 flex justify-between items-center gap-4 bg-white dark:bg-gray-800">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  {getTypeBadge(viewingItem.form_type)}
                  <span className="text-sm text-gray-500 dark:text-gray-400">{viewingItem.upload_date}</span>
                  {viewingItem.pic && <span className="text-xs text-gray-400 dark:text-gray-500">PIC: {viewingItem.pic}</span>}
                  {viewingItem.notes && <span className="text-xs text-gray-400 dark:text-gray-500">Notes: {viewingItem.notes}</span>}
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{viewingItem.file_name}</h2>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setViewingItem(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-2xl text-gray-500">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <UploadedFileViewer
                doc={{ id: viewingItem.id, file_path: viewingItem.file_path }}
                downloadUrl={`/api/proxy/api/v1/form-uploads/${viewingItem.id}/file`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
