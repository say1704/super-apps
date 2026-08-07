"use client";

import { apiRequest } from "@/lib/auth";


import { useState, useEffect } from 'react';

interface ConfigFormProps {
  assetId: number;
  config?: any;
  onSubmit: () => void;
  onCancel: () => void;
}

interface Category {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  description: string;
}

export default function ConfigForm({ assetId, config, onSubmit, onCancel }: ConfigFormProps) {
  const [formData, setFormData] = useState({
    parameter: '', value: '', category_id: '', category_text: '', notes: '', change_reason: '',
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCatManager, setShowCatManager] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (config) {
      setFormData({
        parameter: config.parameter || '',
        value: config.value || '',
        category_id: config.category_id || '',
        category_text: config.category || '',
        notes: config.notes || '',
        change_reason: '',
      });
    } else if (categories.length > 0) {
      setFormData(prev => ({ ...prev, category_id: String(categories[0].id) }));
    }
  }, [config, categories]);

  const fetchCategories = async () => {
    try {
      const data = await apiRequest('/api/config-categories');
      setCategories(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.parameter.trim() || !formData.value.trim()) {
      alert('Parameter and value are required'); return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append('asset_id', assetId.toString());
      form.append('parameter', formData.parameter);
      form.append('value', formData.value);

      const selCat = categories.find(c => c.id === parseInt(formData.category_id));
      form.append('category', selCat?.name || formData.category_text || 'operational');
      form.append('notes', formData.notes);
      if (formData.category_id) form.append('category_id', formData.category_id);
      if (config) form.append('change_reason', formData.change_reason || 'Configuration update');

      const url = config ? `/api/configurations/${config.id}` : '/api/configurations';
      const method = config ? 'PUT' : 'POST';
      await apiRequest(url, { method, body: form });
      onSubmit();
    } catch (err: any) {
      alert(err.message || 'Failed to save configuration');
    } finally { setSaving(false); }
  };

  const colorMap: Record<string, string> = {
    red: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300',
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
    green: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
    purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
    orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
  };

  if (loading) return <div className="p-4 text-gray-500 dark:text-gray-400">Loading...</div>;

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
        <button onClick={fetchCategories} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{config ? 'Edit Configuration' : 'Add Configuration'}</h3>
        <button type="button" onClick={() => setShowCatManager(!showCatManager)} className="text-xs text-blue-600 hover:underline">Manage Categories</button>
      </div>

      {/* Category Manager */}
      {showCatManager && <CategoryManager categories={categories} onRefresh={fetchCategories} />}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Parameter *</label>
          <input type="text" value={formData.parameter} onChange={(e) => setFormData({ ...formData, parameter: e.target.value })}
            placeholder="e.g., SSH Port" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Category</label>
          <select value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name} {cat.description ? `— ${cat.description}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Value *</label>
        <textarea value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })}
          placeholder="Current value..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono" rows={2} required />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Notes</label>
        <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional context..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" rows={2} />
      </div>
      {config && (
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Change Reason *</label>
          <input type="text" value={formData.change_reason} onChange={(e) => setFormData({ ...formData, change_reason: e.target.value })}
            placeholder="Why is this change being made?" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required />
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">{config ? 'Update' : 'Save'}</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium">Cancel</button>
      </div>
    </form>
  );
}

function CategoryManager({ categories, onRefresh }: { categories: Category[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const [newDesc, setNewDesc] = useState('');
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const colorOptions = ['red', 'yellow', 'blue', 'green', 'purple', 'orange'];
  const colorMap: Record<string, string> = {
    red: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300',
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
    green: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
    purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
    orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
  };

  const handleCreate = async () => {
    if (!newName.trim()) { alert('Name is required'); return; }
    const form = new FormData();
    form.append('name', newName.trim());
    form.append('color', newColor);
    form.append('description', newDesc);
    form.append('sort_order', String(categories.length + 1));
    await apiRequest('/api/config-categories', { method: 'POST', body: form });
    setNewName(''); setNewDesc('');
    onRefresh();
  };

  const handleUpdate = async (id: number) => {
    const form = new FormData();
    form.append('name', editName);
    form.append('color', editColor);
    await apiRequest(`/api/config-categories/${id}`, { method: 'PUT', body: form });
    setEditing(null);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this category? Existing configs will be uncategorized.')) return;
    await apiRequest(`/api/config-categories/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Categories</h4>

      {/* Existing Categories */}
      <div className="space-y-1">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-2">
            {editing === cat.id ? (
              <>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white" />
                <select value={editColor} onChange={(e) => setEditColor(e.target.value)} className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white">
                  {colorOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => handleUpdate(cat.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">OK</button>
                <button type="button" onClick={() => setEditing(null)} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">Cancel</button>
              </>
            ) : (
              <>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorMap[cat.color] || colorMap.blue}`}>{cat.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">{cat.description}</span>
                <button type="button" onClick={() => { setEditing(cat.id); setEditName(cat.name); setEditColor(cat.color); }} className="text-blue-600 text-xs hover:underline">Edit</button>
                <button type="button" onClick={() => handleDelete(cat.id)} className="text-red-600 text-xs hover:underline">Del</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add New */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white" />
        <select value={newColor} onChange={(e) => setNewColor(e.target.value)} className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white">
          {colorOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white flex-1" />
        <button type="button" onClick={handleCreate} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">+ Add</button>
      </div>
    </div>
  );
}
