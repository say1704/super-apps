"use client";

interface LogCompression {
  id: number;
  server: string;
  archive_info: string;
  execution_date: string;
  notes: string;
}

interface CompressionDetailModalProps {
  item: LogCompression | null;
  show: boolean;
  onClose: () => void;
  onEdit: (item: LogCompression) => void;
}

export function CompressionDetailModal({ item, show, onClose, onEdit }: CompressionDetailModalProps) {
  if (!show || !item) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Compression Details
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              ✕
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Server/NAS</p>
              <p className="text-lg text-gray-900 dark:text-white">{item.server}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Archive Info</p>
              <p className="text-lg text-gray-900 dark:text-white">{item.archive_info}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Execution Date</p>
              <p className="text-lg text-gray-900 dark:text-white">{item.execution_date}</p>
            </div>
          </div>
          {item.notes && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</p>
              <p className="mt-2 text-gray-900 dark:text-white">{item.notes}</p>
            </div>
          )}
        </div>
        <div className="p-6 border-t dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={() => {
              onClose();
              onEdit(item);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Edit
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
