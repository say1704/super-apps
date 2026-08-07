/**
 * Information Category Fields Component
 * 
 * Sub-categories: database, document, record, archive
 */

"use client";

interface InformationFieldsProps {
  subCategory: string;
  attributes: Record<string, any>;
  onAttributeChange: (key: string, value: string) => void;
}

export default function InformationFields({
  subCategory,
  attributes,
  onAttributeChange
}: InformationFieldsProps) {

  switch (subCategory) {
    case 'database':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Database Type</label>
              <select
                value={attributes.db_type || 'relational'}
                onChange={(e) => onAttributeChange('db_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="relational">Relational (SQL)</option>
                <option value="nosql">NoSQL</option>
                <option value="graph">Graph Database</option>
                <option value="time-series">Time Series</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">DBMS</label>
              <input
                type="text"
                value={attributes.dbms || ''}
                onChange={(e) => onAttributeChange('dbms', e.target.value)}
                placeholder="e.g., PostgreSQL, MySQL, MongoDB"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Version</label>
              <input
                type="text"
                value={attributes.version || ''}
                onChange={(e) => onAttributeChange('version', e.target.value)}
                placeholder="e.g., 14.5, 8.0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Size</label>
              <input
                type="text"
                value={attributes.size || ''}
                onChange={(e) => onAttributeChange('size', e.target.value)}
                placeholder="e.g., 500 GB"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Host Server</label>
              <input
                type="text"
                value={attributes.host_server || ''}
                onChange={(e) => onAttributeChange('host_server', e.target.value)}
                placeholder="e.g., DB-Server-01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Port</label>
              <input
                type="text"
                value={attributes.port || ''}
                onChange={(e) => onAttributeChange('port', e.target.value)}
                placeholder="e.g., 5432, 3306, 27017"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Description</label>
            <textarea
              value={attributes.description || ''}
              onChange={(e) => onAttributeChange('description', e.target.value)}
              rows={3}
              placeholder="Description of database contents and purpose..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'document':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Document Type</label>
              <select
                value={attributes.doc_type || 'policy'}
                onChange={(e) => onAttributeChange('doc_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="policy">Policy</option>
                <option value="procedure">Procedure</option>
                <option value="guideline">Guideline</option>
                <option value="standard">Standard</option>
                <option value="report">Report</option>
                <option value="contract">Contract</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Format</label>
              <select
                value={attributes.format || 'digital'}
                onChange={(e) => onAttributeChange('format', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="digital">Digital</option>
                <option value="physical">Physical (Paper)</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Document Number</label>
              <input
                type="text"
                value={attributes.doc_number || ''}
                onChange={(e) => onAttributeChange('doc_number', e.target.value)}
                placeholder="e.g., DOC-SEC-001"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Revision</label>
              <input
                type="text"
                value={attributes.revision || ''}
                onChange={(e) => onAttributeChange('revision', e.target.value)}
                placeholder="e.g., 1.0, Rev.2"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Effective Date</label>
              <input
                type="date"
                value={attributes.effective_date || ''}
                onChange={(e) => onAttributeChange('effective_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Review Date</label>
              <input
                type="date"
                value={attributes.review_date || ''}
                onChange={(e) => onAttributeChange('review_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Storage Location</label>
            <input
              type="text"
              value={attributes.storage_location || ''}
              onChange={(e) => onAttributeChange('storage_location', e.target.value)}
              placeholder="e.g., SharePoint, File Server, Cabinet A-12"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'record':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Record Type</label>
              <select
                value={attributes.record_type || 'audit'}
                onChange={(e) => onAttributeChange('record_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="audit">Audit Record</option>
                <option value="transaction">Transaction</option>
                <option value="compliance">Compliance</option>
                <option value="incident">Incident</option>
                <option value="access-log">Access Log</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Retention Period</label>
              <input
                type="text"
                value={attributes.retention_period || ''}
                onChange={(e) => onAttributeChange('retention_period', e.target.value)}
                placeholder="e.g., 7 years, 5 years"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Created Date</label>
              <input
                type="date"
                value={attributes.created_date || ''}
                onChange={(e) => onAttributeChange('created_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Disposal Date</label>
              <input
                type="date"
                value={attributes.disposal_date || ''}
                onChange={(e) => onAttributeChange('disposal_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Storage Location</label>
            <input
              type="text"
              value={attributes.storage_location || ''}
              onChange={(e) => onAttributeChange('storage_location', e.target.value)}
              placeholder="e.g., Archive Server, Off-site Storage"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'archive':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Archive Type</label>
              <select
                value={attributes.archive_type || 'backup'}
                onChange={(e) => onAttributeChange('archive_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="backup">Backup Archive</option>
                <option value="historical">Historical Records</option>
                <option value="legal">Legal Archive</option>
                <option value="compliance">Compliance Archive</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Format</label>
              <input
                type="text"
                value={attributes.format || ''}
                onChange={(e) => onAttributeChange('format', e.target.value)}
                placeholder="e.g., ZIP, TAR, PDF/A"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Size</label>
              <input
                type="text"
                value={attributes.size || ''}
                onChange={(e) => onAttributeChange('size', e.target.value)}
                placeholder="e.g., 2.5 TB"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Archive Date</label>
              <input
                type="date"
                value={attributes.archive_date || ''}
                onChange={(e) => onAttributeChange('archive_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Storage Location</label>
            <input
              type="text"
              value={attributes.storage_location || ''}
              onChange={(e) => onAttributeChange('storage_location', e.target.value)}
              placeholder="e.g., NAS Backup, Tape Library, Cloud Archive"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}
