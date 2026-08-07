import { apiRequest } from '@/lib/auth';

export async function getTasks(params: Record<string, any> = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) query.append(k, String(v));
  });
  return apiRequest(`/api/project-tasks?${query.toString()}`);
}

export async function getTasksByIds(ids: number[]) {
  if (ids.length === 0) return { data: [] };
  return apiRequest(`/api/project-tasks/by-ids?ids=${ids.join(',')}`);
}

export async function getTaskStats() {
  return apiRequest('/api/project-tasks/stats');
}

export async function createTask(task: Record<string, any>) {
  const form = new FormData();
  Object.entries(task).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  return apiRequest('/api/project-tasks', {
    method: 'POST',
    body: form,
  });
}

export async function updateTask(id: number, task: Record<string, any>, version?: number) {
  const form = new FormData();
  Object.entries(task).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  const headers: Record<string, string> = {};
  if (version !== undefined) headers['X-Resource-Version'] = String(version);
  return apiRequest(`/api/project-tasks/${id}`, {
    method: 'PUT',
    body: form,
    headers,
  });
}

export async function deleteTask(id: number) {
  return apiRequest(`/api/project-tasks/${id}`, {
    method: 'DELETE',
  });
}

export async function bulkDeleteTasks(ids: number[]) {
  return apiRequest('/api/project-tasks/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function bulkUpdateStatus(ids: number[], status: string) {
  return apiRequest('/api/project-tasks/bulk-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, status }),
  });
}

export async function getWorklogs(taskId: number) {
  try {
    return apiRequest(`/api/worklog?task_id=${taskId}`);
  } catch {
    return { data: [] };
  }
}

export async function createWorklog(worklog: Record<string, any>) {
  const form = new FormData();
  Object.entries(worklog).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  return apiRequest('/api/worklog', {
    method: 'POST',
    body: form,
  });
}

export async function deleteWorklog(id: number) {
  return apiRequest(`/api/worklog/${id}`, {
    method: 'DELETE',
  });
}

export async function getSprints() {
  return apiRequest('/api/sprints');
}

export async function createSprint(sprint: Record<string, any>) {
  const form = new FormData();
  Object.entries(sprint).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'task_ids' && Array.isArray(value)) {
        form.append(key, value.join(','));
      } else {
        form.append(key, String(value));
      }
    }
  });
  return apiRequest('/api/sprints', {
    method: 'POST',
    body: form,
  });
}

export async function updateSprint(id: number, sprint: Record<string, any>) {
  const form = new FormData();
  Object.entries(sprint).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (key === 'task_ids' && Array.isArray(value)) {
        form.append(key, value.join(','));
      } else {
        form.append(key, String(value));
      }
    }
  });
  return apiRequest(`/api/sprints/${id}`, {
    method: 'PUT',
    body: form,
  });
}

export async function deleteSprint(id: number) {
  return apiRequest(`/api/sprints/${id}`, {
    method: 'DELETE',
  });
}

export async function getTaskNotes(taskId: number) {
  try {
    return apiRequest(`/api/project-tasks/${taskId}/notes`);
  } catch {
    return { data: [] };
  }
}

export async function createTaskNote(taskId: number, note: Record<string, any>) {
  const form = new FormData();
  Object.entries(note).forEach(([key, value]) => {
    if (key === 'photos' && Array.isArray(value)) {
      value.forEach((file: File) => form.append('photos', file));
    } else if (value !== undefined && value !== null && value !== '') {
      form.append(key, String(value));
    }
  });
  return apiRequest(`/api/project-tasks/${taskId}/notes`, {
    method: 'POST',
    body: form,
  });
}

export async function deleteTaskNote(taskId: number, noteId: number) {
  return apiRequest(`/api/project-tasks/${taskId}/notes/${noteId}`, {
    method: 'DELETE',
  });
}

export async function updateTaskPhotos(taskId: number, photos: File[]) {
  const form = new FormData();
  photos.forEach(file => form.append('photos', file));
  return apiRequest(`/api/project-tasks/${taskId}/photos`, {
    method: 'PUT',
    body: form,
  });
}
