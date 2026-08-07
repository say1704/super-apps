"use client";

import React, { useState, useEffect } from 'react';
import { Task, Sprint } from './types';
import { getTasks, getTasksByIds, getSprints, createSprint, updateSprint, deleteSprint } from './api';

export default function BurndownPanel() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showTasks, setShowTasks] = useState<Record<number, Task[]>>({});
  const [sprintForm, setSprintForm] = useState({
    name: '', start_date: '', end_date: '', status: 'planned', goal: '', task_ids: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSprints(); }, []);

  const fetchSprints = async () => {
    setLoading(true);
    try {
      const res = await getSprints();
      setSprints(res.data || res);
    } catch {
      setSprints([]);
    }
    setLoading(false);
  };

  const handleCreateOrUpdate = async () => {
    if (!sprintForm.name || !sprintForm.start_date || !sprintForm.end_date) return alert('Name, start, and end dates are required');
    try {
      if (editId) {
        const ids = sprintForm.task_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean);
        await updateSprint(editId, { ...sprintForm, task_ids: ids });
      } else {
        const ids = sprintForm.task_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean);
        await createSprint({ ...sprintForm, task_ids: ids });
      }
      setSprintForm({ name: '', start_date: '', end_date: '', status: 'planned', goal: '', task_ids: '' });
      setShowForm(false);
      setEditId(null);
      fetchSprints();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this sprint?')) return;
    await deleteSprint(id);
    fetchSprints();
  };

  const loadTasks = async (sprint: Sprint) => {
    if (showTasks[sprint.id]) {
      setShowTasks({ ...showTasks, [sprint.id]: [] });
      return;
    }
    if (sprint.task_ids.length === 0) {
      setShowTasks({ ...showTasks, [sprint.id]: [] });
      return;
    }
    try {
      const res = await getTasksByIds(sprint.task_ids);
      const tasks = (res.data || []) as Task[];
      setShowTasks({ ...showTasks, [sprint.id]: tasks });
    } catch {
      setShowTasks({ ...showTasks, [sprint.id]: [] });
    }
  };

  const calculateBurndown = (
    sprint: Sprint
  ): { data: { day: string; remaining: number }[]; chartMax: number } => {
    if (!sprint.start_date || !sprint.end_date) return { data: [], chartMax: 0 };

    const start = new Date(sprint.start_date);
    const end = new Date(sprint.end_date);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (totalDays <= 0) return { data: [], chartMax: 0 };

    const taskCount = sprint.task_ids.length || 1;
    const data = [];
    for (let i = 0; i <= totalDays; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const idealRemaining = taskCount - (i / totalDays) * taskCount;
      data.push({
        day: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        remaining: Math.max(0, Math.round(idealRemaining * 100) / 100),
      });
    }

    return { data, chartMax: taskCount };
  };

  const statusColor = (s: string) => {
    switch(s) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'completed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'planned': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-gray-900 dark:text-white">📈 Sprint Management &amp; Burndown</h2>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setSprintForm({ name: '', start_date: '', end_date: '', status: 'planned', goal: '', task_ids: '' }); }} className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700">
          {showForm ? 'Cancel' : '+ Sprint'}
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Sprint Name</label>
              <input value={sprintForm.name} onChange={e => setSprintForm({ ...sprintForm, name: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., Sprint 1 - Parser Refactor" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Start Date</label>
              <input type="date" value={sprintForm.start_date} onChange={e => setSprintForm({ ...sprintForm, start_date: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">End Date</label>
              <input type="date" value={sprintForm.end_date} onChange={e => setSprintForm({ ...sprintForm, end_date: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Status</label>
              <select value={sprintForm.status} onChange={e => setSprintForm({ ...sprintForm, status: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Task IDs (comma-separated)</label>
              <input value={sprintForm.task_ids} onChange={e => setSprintForm({ ...sprintForm, task_ids: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., 1, 5, 8" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Goal</label>
              <textarea value={sprintForm.goal} onChange={e => setSprintForm({ ...sprintForm, goal: e.target.value })} className="w-full px-3 py-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" rows={2} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateOrUpdate} className="px-4 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">{editId ? 'Update' : 'Create'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-1.5 bg-gray-500 text-white rounded text-sm hover:bg-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {sprints.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">No sprints yet. Create one above.</p>
      ) : (
        <div className="space-y-4">
          {sprints.map(sprint => {
            const { data: burnData, chartMax } = calculateBurndown(sprint);
            return (
              <div key={sprint.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 dark:text-white">{sprint.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(sprint.status)}`}>
                      {sprint.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => loadTasks(sprint)} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs hover:bg-blue-200">
                      {showTasks[sprint.id] ? 'Hide Tasks' : 'Tasks'}
                    </button>
                    <button onClick={() => { setShowForm(true); setEditId(sprint.id); setSprintForm({ name: sprint.name, start_date: sprint.start_date || '', end_date: sprint.end_date || '', status: sprint.status, goal: sprint.goal || '', task_ids: sprint.task_ids.join(', ') }); }} className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded text-xs">Edit</button>
                    <button onClick={() => handleDelete(sprint.id)} className="px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded text-xs hover:bg-red-200">Del</button>
                  </div>
                </div>
                {sprint.goal && <p className="text-sm text-gray-600 dark:text-gray-400">🎯 {sprint.goal}</p>}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  📅 {sprint.start_date ? new Date(sprint.start_date).toLocaleDateString() : '—'} → {sprint.end_date ? new Date(sprint.end_date).toLocaleDateString() : '—'} • Tasks: {sprint.task_ids.length}
                </p>

                {/* Burndown Chart (visual bar) */}
                {burnData.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Burndown (Ideal)</p>
                    <div className="flex items-end gap-1 h-16">
                      {burnData.map((d, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-blue-500 dark:bg-blue-400 rounded-t transition-all"
                          title={`${d.day}: ${d.remaining} remaining`}
                          style={{ height: `${chartMax ? (d.remaining / chartMax) * 100 : 0}%`, minHeight: '4px' }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{burnData[0]?.day}</span>
                      <span>{burnData[burnData.length - 1]?.day}</span>
                    </div>
                  </div>
                )}

                {/* Task list */}
                {showTasks[sprint.id] && (
                  <div className="mt-2">
                    {showTasks[sprint.id].length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">ID</th>
                            <th className="text-left py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Title</th>
                            <th className="text-left py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Status</th>
                            <th className="text-left py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Priority</th>
                            <th className="text-left py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {showTasks[sprint.id].map(t => (
                            <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700">
                              <td className="py-1">{t.id}</td>
                              <td className="py-1">{t.title}</td>
                              <td className="py-1"><span className={`px-1.5 py-0.5 rounded text-xs ${t.status === 'done' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : t.status === 'doing' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{t.status}</span></td>
                              <td className="py-1">{t.priority}</td>
                              <td className="py-1">{t.estimated_hours || '—'}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No tasks found for ID {sprint.task_ids.join(', ')}. No tasks loaded.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
