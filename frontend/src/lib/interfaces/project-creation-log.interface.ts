export interface ProjectCreationLog {
  id: string;
  name: string;
  actionProgress: 'pending' | 'success' | 'error';
  message: string;
  type: 'info' | 'action' | 'warning' | 'error';
  timestamp?: number;
}

export interface ProjectCreationSuccess {
  id: string;
  message: string;
  repository_path: string;
}
