"use client";

interface LogFormData {
  server: string;
  path: string;
  script_execution: string;
  execution_date: string;
  size: string;
  notes: string;
}

interface LogFormProps {
  editingId: number | null;
  formData: LogFormData;
  onChange: (data: LogFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function LogForm({ editingId, formData, onChange, onSubmit, onCancel }: LogFormProps) {
  const updateField = (field: keyof LogFormData, value: string) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="mb-6 p-4 rounded-lg shadow bg-white dark:bg-gray-800">
      <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
        {editingId ? 'Edit Log Entry' : 'Add New Log Entry'}
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Server *</label>
          <input type="text" value={formData.server} onChange={(e) => updateField('server', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" placeholder="e.g., SRV-DB-001" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Path</label>
          <input type="text" value={formData.path} onChange={(e) => updateField('path', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" placeholder="e.g., /var/log/" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Execution Date</label>
          <input type="date" value={formData.execution_date} onChange={(e) => updateField('execution_date', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Size</label>
          <input type="text" value={formData.size} onChange={(e) => updateField('size', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" placeholder="e.g., 1.5 GB" />
        </div>
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Script Execution</label>
        <textarea value={formData.script_execution} onChange={(e) => updateField('script_execution', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" rows={3} placeholder="Describe the script that was executed..." />
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Notes</label>
        <textarea value={formData.notes} onChange={(e) => updateField('notes', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" rows={2} placeholder="Additional notes..." />
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
