"use client";

interface CompressionFormData {
  server: string;
  archive_info: string;
  execution_date: string;
  notes: string;
}

interface CompressionFormProps {
  editingId: number | null;
  formData: CompressionFormData;
  onChange: (data: CompressionFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function CompressionForm({ editingId, formData, onChange, onSubmit, onCancel }: CompressionFormProps) {
  const updateField = (field: keyof CompressionFormData, value: string) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="mb-6 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
      <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
        {editingId ? 'Edit Compression Record' : 'New Compression Record'}
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Server/NAS *</label>
          <input type="text" value={formData.server} onChange={(e) => updateField('server', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" placeholder="e.g., NAS-001 or 10.0.0.100" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Archive Info *</label>
          <input type="text" value={formData.archive_info} onChange={(e) => updateField('archive_info', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" placeholder="e.g., bck_202402.tbz2" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Execution Date *</label>
          <input type="date" value={formData.execution_date} onChange={(e) => updateField('execution_date', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Notes</label>
          <input type="text" value={formData.notes} onChange={(e) => updateField('notes', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" placeholder="e.g., Monthly archive Feb 2024" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
