"use client";

import { useEffect, useState, useMemo } from 'react';
import { apiRequest, useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import ExportButton from '@/components/ExportButton';
import RichTextEditor from '@/components/rich-text-editor';
import UploadedFileViewer from '@/components/uploaded-file-viewer';
import { sanitizeHtml } from '@/lib/sanitize';

const PROXY = '/api/proxy/api/v1';

interface DocumentItem {
  id: number;
  title: string;
  category: string;
  doc_type: string;
  file_path: string | null;
  content_html: string | null;
  summary: string | null;
  tags: string | null;
  version: number;
  status: string;
  download_count: number;
  view_count: number;
  approved_by: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  creator_role: string | null;
}

interface DocStats {
  total: number;
  by_category: Record<string, number>;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
}

interface DocVersion {
  id: number;
  document_id: number;
  version_number: number;
  content_html: string | null;
  file_path: string | null;
  summary: string | null;
  changed_by: number | null;
  change_note: string | null;
  created_at: string;
}

const CATEGORIES_HARDCODED = ['SOP', 'Work Instruction', 'Maintenance Report', 'KB Article', 'Policy', 'Other'];

interface CategoryItem {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sort_order: number;
  is_active: number;
}
const STATUSES = [
  { value: '', label: 'All Status' },
  { value: 'draft', label: '📝 Draft' },
  { value: 'pending_approval', label: '⏳ Pending Approval' },
  { value: 'approved', label: '✅ Approved' },
  { value: 'rejected', label: '❌ Rejected' },
  { value: 'archived', label: '📦 Archived' },
];
const STATUS_ICONS: Record<string, string> = {
  'draft': '📝', 'pending_approval': '⏳', 'approved': '✅', 'rejected': '❌', 'archived': '📦',
};
const docStatusColors: Record<string, string> = {
  'draft': '#6b7280', 'pending_approval': '#f59e0b', 'approved': '#059669', 'rejected': '#dc2626', 'archived': '#6366f1',
};
const DOC_TYPES = [
  { value: 'text', label: '📝 Rich Text' },
  { value: 'markdown', label: '📋 Markdown' },
  { value: 'uploaded', label: '📎 Upload File' },
];
const CATEGORY_ICONS: Record<string, string> = {
  'SOP': '📜',
  'Work Instruction': '🔧',
  'Maintenance Report': '🔍',
  'KB Article': '📖',
  'Policy': '📌',
  'Other': '📄',
};

export default function DocumentationModule() {
  const { user } = useAuth();
  const [data, setData] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [stats, setStats] = useState<DocStats | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryItem | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catIcon, setCatIcon] = useState('📁');
  const [catColor, setCatColor] = useState('#6b7280');
  const [catSortOrder, setCatSortOrder] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [changeNote, setChangeNote] = useState('');
  const [editMode, setEditMode] = useState(false); // true = new, false = edit
  const [viewMode, setViewMode] = useState<'preview' | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const toast = useToast();

  // Pagination
  const [page, setPage] = useState(1);
  const [page_size, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<any>(null);

  // Sorting
  const [sort_by, setSortBy] = useState('updated_at');
  const [sort_order, setSortOrder] = useState('desc');

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Form
  const [formData, setFormData] = useState({
    title: '',
    category: 'SOP',
    doc_type: 'text' as string,
    summary: '',
    tags: '',
    content_html: '',
    content_markdown: '',
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: page_size.toString(),
        sort_by,
        sort_order,
      });
      if (search) params.set('search', search);
      if (filterCategory) params.set('category', filterCategory);
      if (filterType) params.set('doc_type', filterType);
      if (statusFilter) params.set('status', statusFilter);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const result: any = await apiRequest(`/api/documents?${params.toString()}`);
      setData(result.data || []);
      setPagination(result.pagination || null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const result: any = await apiRequest('/api/documents/stats');
      setStats(result);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const result = await apiRequest('/api/documents/categories');
      setCategories(result);
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load categories');
    }
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) { toast.error('Category name required'); return; }
    try {
      const payload = {
        name: catName, description: catDesc, icon: catIcon,
        color: catColor, sort_order: catSortOrder,
      };
      if (editingCat) {
        await apiRequest(`/api/documents/categories/${editingCat.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success('Category updated');
      } else {
        await apiRequest('/api/documents/categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Category created');
      }
      setShowCatModal(false);
      resetCatForm();
      fetchCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save category');
    }
  };

  const handleEditCategory = (cat: CategoryItem) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatDesc(cat.description || '');
    setCatIcon(cat.icon);
    setCatColor(cat.color);
    setCatSortOrder(cat.sort_order);
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Delete this category? Documents using it will be unaffected.')) return;
    try {
      const res: any = await apiRequest(`/api/documents/categories/${id}`, { method: 'DELETE' });
      toast.success(res.message || 'Category deleted');
      fetchCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete category');
    }
  };

  const resetCatForm = () => {
    setCatName(''); setCatDesc(''); setCatIcon('📁');
    setCatColor('#6b7280'); setCatSortOrder(0); setEditingCat(null);
  };

  useEffect(() => {
    fetchData();
    fetchStats();
    fetchCategories();
  }, [page, page_size, sort_by, sort_order, search, filterCategory, filterType, startDate, endDate]);

  const handleEdit = (doc: DocumentItem) => {
    setEditingId(doc.id);
    setFormData({
      title: doc.title,
      category: doc.category,
      doc_type: doc.doc_type,
      summary: doc.summary || '',
      tags: doc.tags || '',
      content_html: doc.content_html || '',
      content_markdown: doc.content_html || '',
    });
    setShowForm(true);
    setUploadFile(null);
    setChangeNote('');
  };

  const handleDuplicate = async (id: number) => {
    try {
      await duplicateDoc(id);
      toast.success('Document duplicated');
      fetchData();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || 'Failed to duplicate');
    }
  };

  const handleSubmitForApproval = async (id: number) => {
    try {
      await submitForApproval(id);
      toast.success('Document submitted for approval');
      fetchData();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveDoc(id);
      toast.success('Document approved');
      fetchData();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt('Rejection reason:');
    if (reason === null) return;
    try {
      await rejectDoc(id, reason || 'No reason provided');
      toast.success('Document rejected');
      fetchData();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    }
  };

  const handleShowVersions = async (id: number) => {
    try {
      const v = await loadVersions(id);
      setVersions(v);
      setShowVersionHistory(true);
    } catch {
      toast.error('Failed to load version history');
    }
  };

  const handlePrint = (doc: DocumentItem) => {
    // For uploaded files, open the static file URL directly for print
    if (doc.doc_type === 'uploaded' && doc.file_path) {
      // file_path format: "uploads/documents/uuid_filename.ext" → mounted at /uploads/documents/
      const fileUrl = `/api/proxy/${doc.file_path}`;
      window.open(fileUrl, '_blank');
      return;
    }

    // For text/markdown, render HTML content
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Popup blocked — please allow popups'); return; }
    const safeTitle = escapeHtml(doc.title || '');
    const safeCategory = escapeHtml(doc.category || '');
    const safeVersion = escapeHtml(String(doc.version ?? ''));
    const safeStatus = escapeHtml(doc.status || '');
    const safeUpdated = escapeHtml(doc.updated_at?.split('T')[0] || '');
    const safeSummary = doc.summary ? `<p><em>${escapeHtml(doc.summary)}</em></p>` : '';
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>${safeTitle}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:auto}
      h1{font-size:24px;border-bottom:2px solid #333;padding-bottom:8px}
      .meta{color:#666;font-size:14px;margin-bottom:20px}
      table{border-collapse:collapse;width:100%;margin:10px 0}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f0f0f0}</style></head><body>
      <h1>${safeTitle}</h1>
      <div class="meta">Category: ${safeCategory} | Version: ${safeVersion} | Status: ${safeStatus} | Updated: ${safeUpdated}</div>
      ${safeSummary}
      ${sanitizeHtml(doc.content_html || '<p>No content</p>')}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 800);
  };

  const getAuthHeader = (): Record<string, string> => {
    const token = sessionStorage.getItem('sa_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Escape HTML to prevent XSS in markdown source
  const escapeHtml = (text: string) => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  };

  // Simple markdown -> HTML for live preview (with XSS protection)
  const markdownToHtml = (md: string) => {
    if (!md) return '';
    // First escape all HTML to prevent XSS
    let html = escapeHtml(md)
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs font-mono my-2 overflow-x-auto"><code>$2</code></pre>')
      // Headers
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-3 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
      // Bold + italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Tables
      .replace(/^(\|.+\|)$/gm, (match) => {
        const cells = match.split('|').filter(c => c.trim());
        if (cells.every(c => /^[-]+$/.test(c.trim()))) return '<!--table-separator-->';
        return '<tr>' + cells.map(c => `<td class="border px-2 py-1">${c.trim()}</td>`).join('') + '</tr>';
      })
      // Lists
      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
      // Links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 underline" target="_blank" rel="noopener noreferrer">$1</a>')
      // Line breaks (preserve)
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');

    // Wrap tables
    html = html.replace(/((?:<tr>.*<\/tr>(?:<br\/>)?)+)/g, '<table class="border-collapse w-full my-2">$1</table>');
    return html;
  };

  // API helper functions
  const loadVersions = async (id: number) => {
    const res = await fetch(`${PROXY}/documents/${id}/versions`, { headers: getAuthHeader() });
    if (!res.ok) throw new Error('Failed to load versions');
    return res.json();
  };

  const duplicateDoc = async (id: number) => {
    const res = await fetch(`${PROXY}/documents/${id}/duplicate`, { method: 'POST', headers: getAuthHeader() });
    if (!res.ok) throw new Error('Failed to duplicate');
    return res.json();
  };

  const submitForApproval = async (id: number) => {
    const res = await fetch(`${PROXY}/documents/${id}/submit`, { method: 'POST', headers: getAuthHeader() });
    if (!res.ok) throw new Error('Failed to submit');
    return res.json();
  };

  const approveDoc = async (id: number) => {
    const res = await fetch(`${PROXY}/documents/${id}/approve`, { method: 'POST', headers: getAuthHeader() });
    if (!res.ok) throw new Error('Failed to approve');
    return res.json();
  };

  const rejectDoc = async (id: number, rejectionReason: string) => {
    const form = new FormData();
    form.append('reason', rejectionReason);
    const res = await fetch(`${PROXY}/documents/${id}/reject`, { method: 'POST', headers: getAuthHeader(), body: form });
    if (!res.ok) throw new Error('Failed to reject');
    return res.json();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const form = new FormData();
      form.append('title', formData.title);
      form.append('category', formData.category);
      form.append('doc_type', formData.doc_type);
      form.append('summary', formData.summary);
      form.append('tags', formData.tags);
      if (formData.doc_type === 'text') form.append('content_html', formData.content_html);
      if (formData.doc_type === 'markdown') form.append('content_html', formData.content_markdown);
      if (formData.doc_type === 'uploaded' && uploadFile) form.append('file', uploadFile);
      if (changeNote) form.append('change_note', changeNote);

      if (editingId) {
        await apiRequest(`/api/documents/${editingId}`, { method: 'PUT', body: form });
        toast.success('Document updated successfully');
      } else {
        await apiRequest('/api/documents', { method: 'POST', body: form });
        toast.success('Document created successfully');
      }
      resetForm();
      fetchData();
      fetchStats();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save document');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this document?')) return;
    try {
      await apiRequest(`/api/documents/${id}`, { method: 'DELETE' });
      toast.success('Document deleted');
      fetchData();
      fetchStats();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} documents?`)) return;
    try {
      const ids = selectedIds.join(',');
      await apiRequest(`/api/documents/bulk-delete?ids=${ids}`, { method: 'POST' });
      toast.success(`${selectedIds.length} documents deleted`);
      setSelectedIds([]);
      fetchData();
      fetchStats();
    } catch (error: any) {
      toast.error(error.message || 'Bulk delete failed');
    }
  };

  const exportColumns = useMemo(() => [
    { key: 'title', label: 'Title' },
    { key: 'category', label: 'Category' },
    { key: 'doc_type', label: 'Type' },
    { key: 'version', label: 'Version' },
    { key: 'summary', label: 'Summary' },
    { key: 'tags', label: 'Tags' },
    { key: 'created_at', label: 'Created' },
    { key: 'updated_at', label: 'Updated' },
  ], []);

  const exportDataFormatted = useMemo(() =>
    data.map(d => ({ ...d, created_at: d.created_at?.split('T')[0], updated_at: d.updated_at?.split('T')[0] })),
  [data]);

  const handleSort = (column: string) => {
    if (sort_by === column) {
      setSortOrder(sort_order === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handlePreview = async (doc: DocumentItem) => {
    setPreviewDoc(doc);
    setViewMode('preview');
    try {
      await fetch(`${PROXY}/documents/${doc.id}/view`, {
        method: 'GET',
        headers: getAuthHeader(),
      });
    } catch {
      // Silently fail — preview still works
    }
  };

  const refreshPreview = async (id: number) => {
    try {
      const res = await apiRequest(`/api/documents/${id}`);
      setPreviewDoc(res);
    } catch {
      fetchData();
      fetchStats();
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ title: '', category: 'SOP', doc_type: 'text', summary: '', tags: '', content_html: '', content_markdown: '' });
    setUploadFile(null);
    setChangeNote('');
    setEditMode(false);
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === data.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map(d => d.id));
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sort_by !== column) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1">{sort_order === 'asc' ? '↑' : '↓'}</span>;
  };

  const renderStats = () => {
    if (!stats) return null;
    const cards = [
      { icon: '📄', label: 'Total Documents', value: stats.total, color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
      ...Object.entries(stats.by_category).map(([k, v]) => ({
        icon: CATEGORY_ICONS[k] || '📄',
        label: k,
        value: v,
        color: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
      })),
      { icon: '📝', label: 'Rich Text', value: stats.by_type.text || 0, color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
      { icon: '📎', label: 'Uploaded', value: stats.by_type.uploaded || 0, color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' },
    ];
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {cards.map((c, i) => (
          <div key={i} className={`p-3 rounded-lg border ${c.color}`}>
            <div className="text-2xl">{c.icon}</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{c.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{c.label}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderFilters = () => (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
      <input type="text" placeholder="🔍 Search title/summary/tags/content..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
      <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
        <option value="">All Categories</option>
        {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
      </select>
      <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
        <option value="">All Types</option>
        {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
      <div className="flex gap-2">
        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        <button onClick={() => { setSearch(''); setFilterCategory(''); setFilterType(''); setStatusFilter(''); setStartDate(''); setEndDate(''); setPage(1); }} className="px-3 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">✕</button>
      </div>
    </div>
  );

  const renderForm = () => (
    <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        {editingId ? '✏️ Edit Document' : '➕ New Document'}
        {editingId && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{
            backgroundColor: docStatusColors[data.find(d => d.id === editingId)?.status || ''] || '#6b7280',
            color: 'white',
          }}>
            {STATUS_ICONS[data.find(d => d.id === editingId)?.status || ''] || '📝'} {data.find(d => d.id === editingId)?.status || 'draft'}
          </span>
        )}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
              <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select value={formData.doc_type} onChange={e => setFormData({ ...formData, doc_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Summary</label>
          <textarea value={formData.summary} onChange={e => setFormData({ ...formData, summary: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </div>

        {/* Content area based on doc_type */}
        {formData.doc_type === 'text' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content (Rich Text)</label>
            <RichTextEditor value={formData.content_html} onChange={(html: string) => setFormData({ ...formData, content_html: html })} />
          </div>
        )}

        {formData.doc_type === 'markdown' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source (Markdown)</label>
              <textarea value={formData.content_markdown} onChange={e => setFormData({ ...formData, content_markdown: e.target.value })} rows={12} className="w-full px-3 py-2 rounded-lg border font-mono text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="## Heading&#10;&#10;**bold** *italic*&#10;&#10;- list item&#10;&#10;| Col1 | Col2 |&#10;|------|------|&#10;| A | B |" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Live Preview</label>
              <div className="prose prose-sm dark:prose-invert max-h-96 overflow-auto p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600" dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownToHtml(formData.content_markdown)) }} />
            </div>
          </div>
        )}

        {formData.doc_type === 'uploaded' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Upload File (PDF, DOCX, TXT)</label>
            <input type="file" accept=".pdf,.docx,.txt" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            {editingId && data.find(d => d.id === editingId)?.file_path && (
              <p className="text-xs text-gray-500 mt-1">Current file: {data.find(d => d.id === editingId)?.file_path?.split('/').pop()}</p>
            )}
          </div>
        )}

        {/* Change note (edit only) */}
        {editingId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">📝 Change Note <span className="text-gray-400">(describe what changed)</span></label>
            <input type="text" value={changeNote} onChange={e => setChangeNote(e.target.value)} placeholder="Updated firewall rules for Linux servers..." className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
          <input type="text" value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} placeholder="server, linux, backup" className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </div>

        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">{editingId ? '💾 Update' : '💾 Save'}</button>
          <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500">Cancel</button>
        </div>
      </form>
    </div>
  );

  const renderTable = () => (
    <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50 dark:bg-gray-700">
          <tr className="text-left text-gray-500 dark:text-gray-400">
            <th className="px-4 py-3">
              <input type="checkbox" checked={data.length > 0 && selectedIds.length === data.length} onChange={handleSelectAll} className="w-4 h-4 rounded" />
            </th>
            <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('title')}>Title <SortIcon column="title" /></th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('category')}>Category <SortIcon column="category" /></th>
            <th className="px-4 py-3 hidden md:table-cell">Summary</th>
            <th className="px-4 py-3 cursor-pointer select-none hidden md:table-cell" onClick={() => handleSort('version')}>Ver <SortIcon column="version" /></th>
            <th className="px-4 py-3 hidden lg:table-cell">👁️/📥</th>
            <th className="px-4 py-3 cursor-pointer select-none hidden lg:table-cell" onClick={() => handleSort('updated_at')}>Updated <SortIcon column="updated_at" /></th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No documents found</td></tr>
          ) : (
            data.map((doc) => (
              <tr key={doc.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => handleToggleSelect(doc.id)} className="w-4 h-4 rounded" />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-xs truncate">{doc.title}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                    backgroundColor: docStatusColors[doc.status] + '30',
                    color: docStatusColors[doc.status],
                  }}>
                    {STATUS_ICONS[doc.status] || '📝'} {doc.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                    {CATEGORY_ICONS[doc.category] || '📄'} {doc.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate hidden md:table-cell">{doc.summary || '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">v{doc.version}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                  <span title={`${doc.view_count} views`}>👁️ {doc.view_count || 0}</span>
                  <span className="ml-2" title={`${doc.download_count} downloads`}>📥 {doc.download_count || 0}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell">{doc.updated_at?.split('T')[0] || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => handlePreview(doc)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="Preview">👁️</button>
                    <button onClick={() => handlePrint(doc)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="Print">🖨️</button>
                    {doc.doc_type === 'uploaded' && doc.file_path && (
                      <a href={`${PROXY}/documents/${doc.id}/download`} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="Download">📥</a>
                    )}
                    <button onClick={() => handleShowVersions(doc.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="Version History">📜</button>
                    {doc.status === 'draft' && (
                      <button onClick={() => handleSubmitForApproval(doc.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="Submit for Approval">📤</button>
                    )}
                    {doc.status === 'pending_approval' && (
                      <>
                        <button onClick={() => handleApprove(doc.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-green-600" title="Approve">✅</button>
                        <button onClick={() => handleReject(doc.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-red-600" title="Reject">❌</button>
                      </>
                    )}
                    <button onClick={() => handleDuplicate(doc.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="Duplicate">🔁</button>
                    {(user?.role === 'superadmin' || doc.creator_role === user?.role) && (
                      <>
                        <button onClick={() => handleEdit(doc)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded" title="Edit">✏️</button>
                        <button onClick={() => handleDelete(doc.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-red-600" title="Delete">🗑️</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderPagination = () => {
    if (!pagination) return null;
    return (
      <div className="flex flex-col md:flex-row justify-between items-center mt-4 gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Rows:</span>
          <select value={page_size} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-2 py-1 rounded border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {(pagination.page - 1) * pagination.page_size + 1}–{Math.min(pagination.page * pagination.page_size, pagination.total)} of {pagination.total}
        </div>
        <div className="flex gap-1">
          <button disabled={pagination.page <= 1} onClick={() => setPage(1)} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 disabled:opacity-30">⏮</button>
          <button disabled={pagination.page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 disabled:opacity-30">◀</button>
          <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-300">Page {pagination.page}/{pagination.total_pages || 1}</span>
          <button disabled={pagination.page >= (pagination.total_pages || 1)} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 disabled:opacity-30">▶</button>
          <button disabled={pagination.page >= (pagination.total_pages || 1)} onClick={() => setPage(pagination.total_pages || 1)} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 disabled:opacity-30">⏭</button>
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    if (!previewDoc) return null;
    const doc = previewDoc;
    const renderMarkdownToHtml = (md: string) => {
      // Escape HTML first to prevent XSS
      const escaped = escapeHtml(md);
      return escaped
        .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
        .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
        .replace(/\n/g, '<br/>');
    };

    return (
      <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => { setViewMode(null); setPreviewDoc(null); }}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[95vw] h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="shrink-0 border-b px-6 py-3 flex justify-between items-start gap-4 bg-white dark:bg-gray-800">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">{doc.category}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: docStatusColors[doc.status] + '30', color: docStatusColors[doc.status] }}>
                  {STATUS_ICONS[doc.status] || '📝'} {doc.status.replace('_', ' ')}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">v{doc.version}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">👁️ {doc.view_count || 0} · 📥 {doc.download_count || 0}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">Updated {doc.updated_at?.split('T')[0]}</span>
                {doc.approved_by && <span className="text-xs text-green-600">✅ Approved by #{doc.approved_by}</span>}
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{doc.title}</h2>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handlePrint(doc)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Print">🖨️</button>
              {doc.status === 'draft' && (
                <button onClick={() => { handleShowVersions(doc.id); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Version History">📜</button>
              )}
              <button onClick={() => { handleDuplicate(doc.id); setPreviewDoc(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Duplicate">🔁</button>
              {doc.status === 'draft' && (
                <button onClick={() => { handleSubmitForApproval(doc.id); refreshPreview(doc.id); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-blue-600" title="Submit for Approval">📤</button>
              )}
              {doc.status === 'pending_approval' && (
                <>
                  <button onClick={() => { handleApprove(doc.id); refreshPreview(doc.id); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-green-600" title="Approve">✅</button>
                  <button onClick={() => { handleReject(doc.id); refreshPreview(doc.id); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-red-600" title="Reject">❌</button>
                </>
              )}
              <button onClick={() => { setViewMode(null); setPreviewDoc(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-2xl text-gray-500">✕</button>
            </div>
          </div>

          {/* Summary bar */}
          {(doc.summary || doc.tags) && (
            <div className="shrink-0 px-6 py-2 bg-gray-50 dark:bg-gray-750 border-b text-sm">
              {doc.summary && <p className="text-gray-600 dark:text-gray-300 italic">{doc.summary}</p>}
              {doc.tags && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">🏷️ {doc.tags}</p>}
            </div>
          )}

          {/* Preview content — takes remaining space */}
          <div className="flex-1 overflow-y-auto">
            {doc.doc_type === 'text' && doc.content_html && (
              <div className="max-w-4xl mx-auto p-8 prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeHtml(doc.content_html || '') }} />
            )}

            {doc.doc_type === 'markdown' && doc.content_html && (
              <div className="max-w-4xl mx-auto p-8 prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdownToHtml(doc.content_html)) }} />
            )}

            {doc.doc_type === 'uploaded' && doc.file_path && (
              <div className="p-2">
                <UploadedFileViewer doc={doc} />
              </div>
            )}

            {(!doc.content_html && !doc.file_path) && (
              <div className="text-center text-gray-400 py-16">
                <div className="text-5xl mb-4">📄</div>
                <p className="text-lg">No content available</p>
                <p className="text-sm mt-2">This document has no content yet. Try editing it to add content.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📚 Document Library</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {user?.role === 'superadmin' ? 'Semua dokumen' : `Dokumen role: ${user?.role}`}
        </p>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <button onClick={handleBulkDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">🗑️ Delete Selected ({selectedIds.length})</button>
          )}
          <ExportButton data={exportDataFormatted} filename={`Documents_${new Date().toISOString().split('T')[0]}`} columns={exportColumns} title="Documents" />
          <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">{showForm ? 'Cancel' : '➕ New Document'}</button>
          <button onClick={() => { resetCatForm(); setShowCatModal(true); }} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700" title="Manage Categories">⚙️ Categories</button>
        </div>
      </div>

      {renderStats()}

      {showForm && renderForm()}

      {renderFilters()}

      {renderTable()}

      {renderPagination()}

      {viewMode === 'preview' && renderPreview()}

      {showVersionHistory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowVersionHistory(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[95vw] max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="shrink-0 border-b px-6 py-3 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">📜 Version History</h3>
              <button onClick={() => setShowVersionHistory(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-2xl text-gray-500">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {versions.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No version history available</p>
              ) : (
                <div className="space-y-4">
                  {versions.map((v, i) => (
                    <div key={v.id} className="p-4 border rounded-lg border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-sm font-bold text-gray-900 dark:text-white">Version {v.version_number}</span>
                          {v.change_note && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 italic">📝 {v.change_note}</p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            🕐 {v.created_at?.replace('T', ' ').substring(0, 16)}
                            {v.changed_by && <> · By User #{v.changed_by}</>}
                          </p>
                        </div>
                        {i === 0 && <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Current</span>}
                      </div>
                      {v.summary && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 truncate">{v.summary}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCatModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowCatModal(false); setEditingCat(null); }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[95vw] max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="shrink-0 border-b px-6 py-3 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">⚙️ Manage Categories</h3>
              <button onClick={() => { setShowCatModal(false); setEditingCat(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-2xl text-gray-500">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Category list */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Existing Categories</h4>
                {categories.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">No categories yet</p>
                ) : (
                  <div className="space-y-2">
                    {categories.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{c.icon}</span>
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                            {c.description && <p className="text-xs text-gray-500 dark:text-gray-400">{c.description}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: c.color }} />
                          <button onClick={() => handleEditCategory(c)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Edit">✏️</button>
                          <button onClick={() => handleDeleteCategory(c.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500" title="Delete">🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Add/Edit form */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{editingCat ? 'Edit' : 'Add'} Category</h4>
                <div className="grid grid-cols-6 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Icon</label>
                    <input type="text" value={catIcon} onChange={e => setCatIcon(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white text-center" maxLength={4} />
                  </div>
                  <div className="col-span-4">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Name *</label>
                    <input type="text" value={catName} onChange={e => setCatName(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g. SOP" />
                  </div>
                  <div className="col-span-6">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Description</label>
                    <input type="text" value={catDesc} onChange={e => setCatDesc(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Color</label>
                    <input type="color" value={catColor} onChange={e => setCatColor(e.target.value)} className="w-full h-9 rounded-lg border cursor-pointer" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Sort Order</label>
                    <input type="number" value={catSortOrder} onChange={e => setCatSortOrder(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div className="col-span-3 flex items-end">
                    <button onClick={handleSaveCategory} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      {editingCat ? '💾 Update' : '➕ Add'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
