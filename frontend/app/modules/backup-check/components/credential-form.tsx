"use client";

import { useState } from 'react';

interface CredentialFormProps {
  onTestConnection: (credentials: any) => Promise<void>;
  onCheckBackups: (credentials: any) => Promise<void>;
  isLoading: boolean;
}

interface Credentials {
  nas_ip: string;
  username: string;
  password: string;
  path: string;
  port: number;
}

export function CredentialForm({ onTestConnection, onCheckBackups, isLoading }: CredentialFormProps) {
  const [credentials, setCredentials] = useState<Credentials>({
    nas_ip: '',
    username: '',
    password: '',
    path: '',  // Empty by default
    port: 22
  });

  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (field: keyof Credentials, value: string | number) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  const handleTestConnection = async () => {
    await onTestConnection(credentials);
  };

  const handleCheckBackups = async () => {
    await onCheckBackups(credentials);
  };

  return (
    <div className="p-6 rounded-lg shadow mb-6 bg-white dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        NAS Credentials
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">NAS IP Address</label>
          <input type="text" value={credentials.nas_ip} onChange={(e) => handleInputChange('nas_ip', e.target.value)} placeholder="192.168.1.100" className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Username</label>
          <input type="text" value={credentials.username} onChange={(e) => handleInputChange('username', e.target.value)} placeholder="backup_reader" className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Password</label>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} value={credentials.password} onChange={(e) => handleInputChange('password', e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 border rounded-lg pr-10 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Backup Path</label>
          <input type="text" value={credentials.path} onChange={(e) => handleInputChange('path', e.target.value)} placeholder="/share/backup_logs" className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleTestConnection} disabled={isLoading || !credentials.nas_ip || !credentials.username || !credentials.password} className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
          Test Connection
        </button>

        <button onClick={handleCheckBackups} disabled={isLoading || !credentials.nas_ip || !credentials.username || !credentials.password} className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white">
          Check Backups
        </button>

        <div className="text-sm ml-auto text-gray-500 dark:text-gray-400">
          Credentials not stored - in-memory only
        </div>
      </div>
    </div>
  );
}
