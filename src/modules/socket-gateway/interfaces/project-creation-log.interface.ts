export interface emitProjectCreationLog {
  name: string;
  id: string;
  message: string;
  type: LogType;
  actionProgress?: LogActionProgress;
}

export interface ProjectCreationSuccess {
  projectId: string;
  time: string;
}

export type LogType = 'action' | 'error' | 'info' | 'warning';
export type LogActionProgress = 'pending' | 'success' | 'error';
