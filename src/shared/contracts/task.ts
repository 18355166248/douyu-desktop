export type TaskRisk = 'safe' | 'confirm' | 'manual';
export type TaskCategory = 'sign' | 'fans' | 'bag' | 'activity';
export type TaskStatus = 'success' | 'partial' | 'skipped' | 'failed';

export interface TaskDescriptor {
  id: string;
  title: string;
  category: TaskCategory;
  risk: TaskRisk;
  requiresLogin: boolean;
  supportsDryRun: boolean;
  description: string;
}

export interface RunTaskInput {
  taskId: string;
  options?: Record<string, unknown> | undefined;
  dryRun?: boolean | undefined;
  confirmed?: boolean | undefined;
}

export interface TaskOutcome {
  status: TaskStatus;
  summary: string;
  details?: Record<string, unknown>;
  metrics?: { total: number; succeeded: number; failed: number };
}

export interface TaskRunResult extends TaskOutcome {
  runId: string;
  taskId: string;
  accountId?: string;
  dryRun: boolean;
  startedAt: number;
  finishedAt: number;
}

export interface TaskProgressEvent {
  runId: string;
  taskId: string;
  current: number;
  total: number;
  message: string;
}

export interface TaskRunSnapshot {
  taskId: string;
  startedAt: number;
  running: boolean;
  progress: TaskProgressEvent | null;
  result: TaskRunResult | null;
}
