"use client";

import React from 'react';
import { Task } from './types';

interface TaskTableProps {
  tasks: Task[];
  selectedIds: number[];
  toggleSelectAll: () => void;
  toggleSelectTask: (id: number) => void;
  onSelectRow: (task: Task) => void;
  selectedRowId: number | null;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  isOverdue: (task: Task) => boolean;
  onStatusChange?: (id: number, status: string) => void;
  onDelete?: (id: number) => void;
  deletingId?: number | null;
  currentUserId?: number | null;
  isSuperadmin?: boolean;
}

function formatEstHours(task: Task): string {
  if (!task.estimated_hours && !task.actual_hours) return '—';
  return `${task.actual_hours || '0'}h / ${task.estimated_hours || '—'}h`;
}

function daysUntilDue(task: Task): { text: string; className: string } {
  if (!task.due_date) return { text: '—', className: 'text-gray-500 dark:text-gray-400' };
  const due = new Date(task.due_date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (task.status === 'done') {
    return { text: `Done`, className: 'text-green-600 dark:text-green-400' };
  }
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, className: 'text-red-600 dark:text-red-400 font-bold' };
  if (diff === 0) return { text: 'Today', className: 'text-orange-600 dark:text-orange-400 font-bold' };
  if (diff <= 3) return { text: `${diff}d left`, className: 'text-yellow-600 dark:text-yellow-400' };
  return { text: `${diff}d`, className: 'text-green-600 dark:text-green-400' };
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    todo: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    doing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    done: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] || map.todo}`}>
      {status === 'todo' ? 'To Do' : status === 'doing' ? 'Doing' : 'Done'}
    </span>
  );
};

const priorityBadge = (priority: string) => {
  const map: Record<string, string> = {
    low: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
    high: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[priority] || map.medium}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
};

export default function TaskTable({
  tasks, selectedIds, toggleSelectAll, toggleSelectTask,
  onSelectRow, selectedRowId, sortField, sortOrder, onSort, isOverdue,
  onStatusChange, onDelete, deletingId, currentUserId, isSuperadmin,
}: TaskTableProps) {
  const SortHeader = ({ field, label }: { field: string; label: string }) => {
    const active = sortField === field;
    return (
      <th
        onClick={() => onSort(field)}
        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none whitespace-nowrap"
      >
        {label}
        {active && (
          <span className="ml-1 inline-block text-blue-600 dark:text-blue-400">
            {sortOrder === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </th>
    );
  };

  const allSelectedOnPage = tasks.length > 0 && tasks.every(t => selectedIds.includes(t.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelectedOnPage}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 dark:text-blue-400"
              />
            </th>
            <SortHeader field="title" label="Title" />
            <SortHeader field="status" label="Status" />
            <SortHeader field="priority" label="Priority" />
            <SortHeader field="assignee" label="Assignee" />
            <SortHeader field="due_date" label="Due Date" />
            <SortHeader field="estimated_hours" label="Time Track" />
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Days</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Tags</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {tasks.map(task => {
            const overdue = isOverdue(task);
            return (
              <tr
                key={task.id}
                onClick={() => onSelectRow(task)}
                className={`cursor-pointer transition-colors ${
                  selectedRowId === task.id
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : overdue
                    ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(task.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelectTask(task.id); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 dark:text-blue-400"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {overdue && task.status !== 'done' && (
                      <span title="Overdue" className="text-red-500 text-sm">⚠️</span>
                    )}
                    <span className="font-medium text-gray-900 dark:text-white text-sm truncate max-w-xs">
                      {task.title}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">{statusBadge(task.status)}</td>
                <td className="px-4 py-3">{priorityBadge(task.priority)}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {task.assignee || '—'}
                </td>
                <td className="px-4 py-3">
                  {task.due_date ? (
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 text-sm">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {formatEstHours(task)}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm ${daysUntilDue(task).className}`}>
                    {daysUntilDue(task).text}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {task.tags?.split(',').filter(Boolean).slice(0, 2).map((tag, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded text-xs">
                        #{tag.trim()}
                      </span>
                    ))}
                    {task.tags?.split(',').filter(Boolean).length > 2 && (
                      <span className="text-xs text-gray-500">...</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={task.status}
                      onChange={(e) => onStatusChange?.(task.id, e.target.value)}
                      className="text-xs px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
                    >
                      <option value="todo">To Do</option>
                      <option value="doing">Doing</option>
                      <option value="done">Done</option>
                    </select>
                    {onDelete && (isSuperadmin || task.created_by === currentUserId) && (
                      <button
                        onClick={() => onDelete(task.id)}
                        disabled={deletingId === task.id}
                        className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs px-1.5 py-1 border border-red-200 dark:border-red-800 rounded hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingId === task.id ? '...' : '\u2715'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                No tasks found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
