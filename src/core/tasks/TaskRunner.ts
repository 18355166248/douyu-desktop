import type {
  RunTaskInput,
  TaskProgressEvent,
  TaskRunResult,
  TaskOutcome,
} from '@shared/contracts/task';
import { AppError, toAppError } from '../errors';
import type { Logger } from '../ports/Logger';
import type { TaskRegistry } from './TaskRegistry';

export interface TaskRunnerOptions {
  timeoutMs?: number;
}

export class TaskRunner {
  private readonly timeoutMs: number;

  constructor(
    private readonly registry: TaskRegistry,
    private readonly logger: Logger,
    options: TaskRunnerOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  }

  async run(
    input: RunTaskInput,
    onProgress?: (event: TaskProgressEvent) => void,
  ): Promise<TaskRunResult> {
    const task = this.registry.get(input.taskId);
    if (!task) throw new AppError('UNSUPPORTED', `未知任务：${input.taskId}`);
    if (task.risk === 'manual') throw new AppError('UNSUPPORTED', '此任务需要手动完成');
    if (task.risk === 'confirm' && !input.confirmed) {
      throw new AppError('CONFIRM_REQUIRED', '此操作需要确认');
    }

    const parsedOptions = task.optionsSchema
      ? task.optionsSchema.parse(input.options ?? {})
      : input.options;
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let outcome: TaskOutcome;

    this.logger.info('task.run.start', { taskId: task.id, runId });

    try {
      outcome = await task.run(
        {
          logger: this.logger,
          signal: controller.signal,
          dryRun: input.dryRun ?? false,
          report: (event) => {
            try {
              onProgress?.({ runId, taskId: task.id, ...event });
            } catch (error) {
              this.logger.warn('task.progress.failed', { taskId: task.id, runId, error });
            }
          },
        },
        parsedOptions,
      );
    } catch (error) {
      const appError = toAppError(error);
      this.logger.error('task.run.failed', {
        taskId: task.id,
        runId,
        code: appError.code,
        message: appError.message,
      });
      outcome = {
        status: appError.code === 'CANCELLED' ? 'skipped' : 'failed',
        summary: appError.message,
      };
    } finally {
      clearTimeout(timer);
    }

    const finishedAt = Date.now();
    this.logger.info('task.run.finish', {
      taskId: task.id,
      runId,
      status: outcome.status,
      durationMs: finishedAt - startedAt,
    });

    return {
      ...outcome,
      runId,
      taskId: task.id,
      dryRun: input.dryRun ?? false,
      startedAt,
      finishedAt,
    };
  }
}
