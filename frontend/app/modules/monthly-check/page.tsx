"use client";

import { apiRequest } from "@/lib/auth";

import { useEffect, useState } from 'react';


interface MonthlyCheck {
  id: number;
  ip_server: string;
  month: string;
  check_date: string;
  status: string;
  notes: string;
}

export default function MonthlyCheckModule() {
  const [data, setData] = useState<MonthlyCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    ip_server: '',
    month: '',
    check_date: new Date().toISOString().split('T')[0],
    status: 'OK',
    notes: '',
  });

  const fetchData = async () => {
    try {
      const result = await apiRequest('/api/monthly-server-check');
      // Handle paginated response
      setData(result.data || result);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      form.append(key, value);
    });

    await apiRequest('/api/monthly-server-check', { method: 'POST', body: form });

    setShowForm(false);
    setFormData({
      ip_server: '',
      month: '',
      check_date: new Date().toISOString().split('T')[0],
      status: 'OK',
      notes: '',
    });
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    await apiRequest(`/api/monthly-server-check/${id}`, { method: 'DELETE' });
    fetchData();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          🖥️ Monthly Server Check
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ Add New'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">IP Server *</label>
              <input
                type="text"
                value={formData.ip_server}
                onChange={(e) => setFormData({ ...formData, ip_server: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Month *</label>
              <input
                type="month"
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Check Date *</label>
              <input
                type="date"
                value={formData.check_date}
                onChange={(e) => setFormData({ ...formData, check_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="OK">OK</option>
                <option value="Warning">Warning</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              rows={3}
            />
          </div>
          <button type="submit" className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Save
          </button>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">IP Server</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Month</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Check Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Notes</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.id} className="border-t dark:border-gray-700">
                <td className="px-4 py-3">{item.ip_server}</td>
                <td className="px-4 py-3">{item.month}</td>
                <td className="px-4 py-3">{item.check_date}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    item.status === 'OK' ? 'bg-green-100 text-green-800' :
                    item.status === 'Warning' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-xs truncate">{item.notes || '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="p-8 text-center text-gray-500">No data available</div>}
      </div>
    </div>
  );
}
