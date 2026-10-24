import type {
  RunTaskInput,
  TaskDescriptor,
  TaskProgressEvent,
  TaskRunResult,
  TaskRunSnapshot,
} from '@shared/contracts/task';
import { AppError } from '@core/errors';
import { DouyuRoomApi } from '@core/douyu/api/DouyuRoomApi';
import { FollowedRoomsQuery } from '@core/douyu/queries/FollowedRoomsQuery';
import { createRoomSignTask, roomSignTaskDescriptor } from '@core/douyu/tasks/roomSignTask';
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
    return [roomSignTaskDescriptor];
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

      const accountSession = await this.accounts.getSession(accountId);
      const auth = await this.accounts.createAuthContext(accountId);
      const http = new DouyuHttpClient(new SessionHttpClient(accountSession, CHROME_UA));
      const registry = new TaskRegistry([
        createRoomSignTask({
          rooms: new FollowedRoomsQuery(http),
          roomApi: new DouyuRoomApi(http, auth),
        }),
      ]);
      const runner = new TaskRunner(registry, this.logger);

      const result = await runner.run(input, (event) => {
        const current = this.snapshot;
        if (current) this.snapshot = { ...current, progress: event };
        onProgress?.(event);
      });
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
