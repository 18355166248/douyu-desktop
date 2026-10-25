import type {
  RunTaskInput,
  TaskDescriptor,
  TaskProgressEvent,
  TaskRunResult,
  TaskRunSnapshot,
} from '@shared/contracts/task';
import { AppError } from '@core/errors';
import { DouyuFansApi } from '@core/douyu/api/DouyuFansApi';
import { FansBadgeQuery } from '@core/douyu/queries/FansBadgeQuery';
import { createFansSignTask, fansSignTaskDescriptor } from '@core/douyu/tasks/fansSignTask';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import { TaskRegistry } from '@core/tasks/TaskRegistry';
import { TaskRunner } from '@core/tasks/TaskRunner';
import type { Logger } from '@core/ports/Logger';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';
import type { AccountSessionManager } from './AccountSessionManager';

export class TaskService {
  private snapshot: TaskRunSnapshot | null = null;

  constructor(
    private readonly accounts: AccountSessionManager,
    private readonly logger: Logger,
  ) {}

  list(): TaskDescriptor[] {
    return [fansSignTaskDescriptor];
  }

  status(): TaskRunSnapshot | null {
    return this.snapshot;
  }

  async run(
    input: RunTaskInput,
    onProgress?: (event: TaskProgressEvent) => void,
  ): Promise<TaskRunResult> {
    if (this.snapshot?.running) {
      throw new AppError('BUSY', '签到任务正在后台运行，请稍候');
    }

    const startedAt = Date.now();
    this.snapshot = {
      taskId: input.taskId,
      startedAt,
      running: true,
      progress: null,
      result: null,
    };

    try {
      const accountId = await this.accounts.getActiveId();
      if (!accountId) throw new AppError('AUTH_REQUIRED', '请先登录斗鱼');
      const health = await this.accounts.health(accountId);
      if (health.status !== 'active') {
        throw new AppError('AUTH_EXPIRED', health.message ?? '登录已过期，请重新登录斗鱼');
      }

      const accountSession = await this.accounts.getSession(accountId);
      const auth = await this.accounts.createAuthContext(accountId);
      const http = new DouyuHttpClient(new SessionHttpClient(accountSession, CHROME_UA));
      const registry = new TaskRegistry([
        createFansSignTask({
          rooms: new FansBadgeQuery(http),
          fans: new DouyuFansApi(http, auth),
        }),
      ]);
      const runner = new TaskRunner(registry, this.logger);

      const outcome = await runner.run(input, (event) => {
        const current = this.snapshot;
        if (current) this.snapshot = { ...current, progress: event };
        onProgress?.(event);
      });
      const result: TaskRunResult = { ...outcome, accountId };
      this.snapshot = {
        taskId: input.taskId,
        startedAt,
        running: false,
        progress: this.snapshot?.progress ?? null,
        result,
      };
      return result;
    } catch (error) {
      const current = this.snapshot;
      if (current) this.snapshot = { ...current, running: false };
      throw error;
    }
  }
}
