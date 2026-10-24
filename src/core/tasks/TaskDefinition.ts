import type { ZodType } from 'zod';
import type { TaskCategory, TaskOutcome, TaskRisk } from '@shared/contracts/task';
import type { Logger } from '../ports/Logger';

export interface TaskProgress {
  current: number;
  total: number;
  message: string;
}

export interface TaskContext {
  logger: Logger;
  signal: AbortSignal;
  dryRun: boolean;
  report(event: TaskProgress): void;
}

export interface TaskDefinition {
  id: string;
  title: string;
  category: TaskCategory;
  risk: TaskRisk;
  requiresLogin: boolean;
  supportsDryRun: boolean;
  description: string;
  optionsSchema?: ZodType;
  run(ctx: TaskContext, options: unknown): Promise<TaskOutcome>;
}
