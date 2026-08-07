/** Task interface — matches backend ProjectTask model */
export interface Task {
  id: number;
  title: string;
  description: string;
  status: 'todo' | 'doing' | 'done';
  assignee: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string;
  tags: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
  estimated_hours: string;
  actual_hours: string;
  created_by: number;
  version?: number;
  worklogs?: WorklogEntry[];
  photo_urls?: string;
  notes?: TaskNote[];
}

export interface TaskNote {
  id: number;
  task_id: number;
  message: string;
  photo_urls: string;
  hours: string | null;
  created_at: string;
  created_by: number;
  author_name?: string;
}

export interface WorklogEntry {
  id: number;
  date: string;
  hours: string;
  description: string;
  created_at: string;
}

export interface Stats {
  total: number;
  todo: number;
  doing: number;
  done: number;
  high_priority: number;
  overdue: number;
  completion_rate: number;
  by_assignee: { assignee: string; count: number }[];
  by_priority: { priority: string; count: number }[];
}

export interface Sprint {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'planned';
  goal: string;
  task_ids: number[];
  created_at: string;
}

type SortField = 'title' | 'status' | 'priority' | 'due_date' | 'assignee' | 'estimated_hours' | 'actual_hours' | 'created_at';
type SortOrder = 'asc' | 'desc';

export type { SortField, SortOrder };

export interface ActivityEntry {
  id: number;
  user_id: number;
  action: string;
  module: string;
  description: string;
  created_at: string;
}
