"use client";

import { useState, useEffect } from 'react';
import { apiRequest, useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import PhotoUpload from '@/components/PhotoUpload';

const CATEGORIES = ['General', 'Meeting', 'Development', 'Maintenance', 'Support', 'Documentation', 'Training', 'Other'];

interface WorklogModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem: any | null;
  onSuccess: () => void;
  tasks: any[];
}

const getCurrentWIBTime = () => {
  const now = new Date();
  return now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta'
  }).replace('.', ':');
};

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  time: getCurrentWIBTime(),
  description: '',
  status: 'in_progress',
  tags: '',
  category: 'General',
  estimated_time: '',
  actual_time: '',
  notes: '',
  task_id: '',
};

export default function WorklogModal({ isOpen, onClose, editingItem, onSuccess, tasks }: WorklogModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [photos, setPhotos] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [removingIndexes, setRemovingIndexes] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        date: editingItem.date || new Date().toISOString().split('T')[0],
        time: editingItem.time || getCurrentWIBTime(),
        description: editingItem.description || '',
        status: editingItem.status || 'in_progress',
        tags: editingItem.tags || '',
        category: editingItem.category || 'General',
        estimated_time: editingItem.estimated_time || '',
        actual_time: editingItem.actual_time || '',
        notes: editingItem.notes || '',
        task_id: editingItem.task_id || '',
      });
      setExistingImages(editingItem.photo_urls || []);
      setPhotos([]);
      setRemovingIndexes([]);
    } else {
      setFormData(EMPTY_FORM);
      setPhotos([]);
      setExistingImages([]);
      setRemovingIndexes([]);
    }
  }, [editingItem, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      toast.error('Description is required');
      return;
    }

    setSubmitting(true);
    try {
      console.log('[WorklogModal] Submitting worklog:', {
        editingItem: editingItem?.id || 'new',
        photoCount: photos.length,
        photoSizes: photos.map(p => ({ name: p.name, size: p.size, type: p.type })),
        totalPhotoSize: photos.reduce((sum, p) => sum + p.size, 0),
      });

      const form = new FormData();
      form.append('date', formData.date);
      form.append('time', formData.time || '');
      form.append('description', formData.description);
      form.append('status', formData.status);
      form.append('category', formData.category || 'General');
      if (formData.tags) form.append('tags', formData.tags);
      if (formData.estimated_time) form.append('estimated_time', formData.estimated_time);
      if (formData.actual_time) form.append('actual_time', formData.actual_time);
      if (formData.notes) form.append('notes', formData.notes);
      if (formData.task_id) form.append('task_id', formData.task_id);

      for (const photo of photos) {
        form.append('photos', photo);
      }

      if (removingIndexes.length > 0) {
        form.append('remove_photo_indexes', removingIndexes.join(','));
      }

      console.log('[WorklogModal] FormData entries:', Array.from(form.entries()).map(([k, v]) => [k, v instanceof File ? `File(${v.name}, ${v.size} bytes)` : v]));

      if (editingItem) {
        await apiRequest(`/api/worklog/${editingItem.id}`, {
          method: 'PUT',
          body: form,
          headers: editingItem.version ? { 'X-Resource-Version': String(editingItem.version) } : undefined,
        });
        toast.success('Worklog updated successfully!');
      } else {
        await apiRequest('/api/worklog', {
          method: 'POST',
          body: form,
        });
        toast.success('Worklog entry created successfully!');
      }

      setFormData(EMPTY_FORM);
      setPhotos([]);
      setExistingImages([]);
      setRemovingIndexes([]);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving worklog:', error);
      if (error.message.includes('Session expired') || error.message.includes('auth')) {
        toast.error('Session expired. Please login again.');
        window.location.href = '/login';
      } else {
        toast.error(error.message || 'Failed to save worklog entry');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const removeExistingPhoto = (index: number) => {
    setRemovingIndexes(prev => [...prev, index]);
  };

  const restoreExistingPhoto = (index: number) => {
    setRemovingIndexes(prev => prev.filter(i => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingItem ? 'Edit Worklog' : 'Add Worklog Entry'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Time (HH:MM)</label>
                <input
                  type="text"
                  value={formData.time}
                  onChange={(e) => { if (/^[\d:]*$/.test(e.target.value)) setFormData({ ...formData, time: e.target.value }); }}
                  onBlur={(e) => {
                    const parts = e.target.value.split(':');
                    if (parts.length === 2 && parts[0].length === 1) {
                      setFormData({ ...formData, time: `0${parts[0]}:${parts[1]}` });
                    }
                  }}
                  placeholder="14:30"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs mt-1 text-gray-500">Format: 24 jam (contoh: 14:30)</p>
              </div>
            </div>

            {/* Category & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Task Link */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Link to Task (Optional)</label>
              <select
                value={formData.task_id}
                onChange={(e) => setFormData({ ...formData, task_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- No Task --</option>
                {tasks.map(task => (
                  <option key={task.id} value={task.id}>{task.title} ({task.priority})</option>
                ))}
              </select>
              <p className="text-xs mt-1 text-gray-500">Link this worklog to a project task</p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="What did you work on?"
                required
              />
            </div>

            {/* Tags, Estimated, Actual */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tags</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Estimated Time</label>
                <input
                  type="text"
                  value={formData.estimated_time}
                  onChange={(e) => setFormData({ ...formData, estimated_time: e.target.value })}
                  placeholder="e.g., 2h or 120m"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Actual Time</label>
                <input
                  type="text"
                  value={formData.actual_time}
                  onChange={(e) => setFormData({ ...formData, actual_time: e.target.value })}
                  placeholder="e.g., 1.5h or 90m"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Notes/Comments</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Additional notes..."
              />
            </div>

            {/* Photo Upload */}
            <PhotoUpload photos={photos} onPhotosChange={setPhotos} />

            {/* Existing Photos (edit mode) */}
            {editingItem && existingImages.length > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Existing Photos</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {existingImages.map((url, index) => {
                    const isRemoved = removingIndexes.includes(index);
                    return (
                      <div key={index} className={`relative group aspect-square rounded-lg overflow-hidden border ${isRemoved ? 'border-red-400 opacity-50' : 'border-gray-200 dark:border-gray-700'}`}>
                        <img
                          src={`/api/proxy/${url}`}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                        {isRemoved ? (
                          <button
                            type="button"
                            onClick={() => restoreExistingPhoto(index)}
                            className="absolute inset-0 flex items-center justify-center text-white text-xs font-medium"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeExistingPhoto(index)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove photo"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer Buttons */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Save')} Worklog
          </button>
        </div>
      </div>
    </div>
  );
}
