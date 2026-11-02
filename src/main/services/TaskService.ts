import type {
  RunTaskInput,
  TaskDescriptor,
  TaskProgressEvent,
  TaskRunResult,
  TaskRunSnapshot,
} from '@shared/contracts/task';
import { AppError } from '@core/errors';
import { DouyuClaimApi } from '@core/douyu/api/DouyuClaimApi';
import { DouyuBackpackApi } from '@core/douyu/api/DouyuBackpackApi';
import { DouyuFansApi } from '@core/douyu/api/DouyuFansApi';
import { DouyuSignApi } from '@core/douyu/api/DouyuSignApi';
import type { DouyuAuthContext } from '@core/douyu/auth/DouyuAuthContext';
import { FansBadgeQuery } from '@core/douyu/queries/FansBadgeQuery';
import { YubaFollowQuery } from '@core/douyu/queries/YubaFollowQuery';
import { clientSignTaskDescriptor, createClientSignTask } from '@core/douyu/tasks/clientSignTask';
import {
  clearBackpackTaskDescriptor,
  createClearBackpackTask,
} from '@core/douyu/tasks/clearBackpackTask';
import { createDailyAllTask, dailyAllTaskDescriptor } from '@core/douyu/tasks/dailyAllTask';
import {
  createDiamondFansSignTask,
  diamondFansSignTaskDescriptor,
} from '@core/douyu/tasks/diamondFansSignTask';
import { createFansSignTask, fansSignTaskDescriptor } from '@core/douyu/tasks/fansSignTask';
import { createWatchPointsTask, watchPointsTaskDescriptor } from '@core/douyu/tasks/watchPointsTask';
import { createYubaSignTask, yubaSignTaskDescriptor } from '@core/douyu/tasks/yubaSignTask';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import type { HttpClient } from '@core/ports/HttpClient';
import { TaskRegistry } from '@core/tasks/TaskRegistry';
import { TaskRunner } from '@core/tasks/TaskRunner';
import type { TaskDefinition } from '@core/tasks/TaskDefinition';
import type { Logger } from '@core/ports/Logger';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';
import type { AccountSessionManager } from './AccountSessionManager';

/** 任务中心的展示顺序；`douyu.daily-all` 永远排最后，方便一键执行。 */
const TASK_DESCRIPTORS: readonly TaskDescriptor[] = [
  fansSignTaskDescriptor,
  clientSignTaskDescriptor,
  yubaSignTaskDescriptor,
  diamondFansSignTaskDescriptor,
  watchPointsTaskDescriptor,
  clearBackpackTaskDescriptor,
  dailyAllTaskDescriptor,
];

export class TaskService {
  private snapshot: TaskRunSnapshot | null = null;

  constructor(
    private readonly accounts: AccountSessionManager,
    private readonly logger: Logger,
  ) {}

  list(): TaskDescriptor[] {
    return TASK_DESCRIPTORS.map((descriptor) => ({ ...descriptor }));
  }

  status(): TaskRunSnapshot | null {
    return this.snapshot;
  }

  async run(
    input: RunTaskInput,
    onProgress?: (event: TaskProgressEvent) => void,
  ): Promise<TaskRunResult> {
    if (this.snapshot?.running) {
      throw new AppError('BUSY', '任务正在后台运行，请稍候');
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
      const registry = new TaskRegistry(this.buildTasks(http, auth));
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

  /**
   * Every task shares one authenticated HTTP client, so rate limiting applies
   * across the whole run. The daily task wraps the individual tasks (never
   * itself) to report a single progress bar.
   */
  private buildTasks(http: HttpClient, auth: DouyuAuthContext): TaskDefinition[] {
    const rooms = new FansBadgeQuery(http);
    const fans = new DouyuFansApi(http, auth);
    const sign = new DouyuSignApi(http, auth);
    const claim = new DouyuClaimApi(http, auth);
    const yuba = new YubaFollowQuery(http, auth);
    const backpack = new DouyuBackpackApi(http, auth);

    const single: TaskDefinition[] = [
      createFansSignTask({ rooms, fans }),
      createClientSignTask({ sign }),
      createYubaSignTask({ groups: yuba, signer: sign }),
      createDiamondFansSignTask({ rooms, auth, signer: sign }),
      createWatchPointsTask({ auth, claimer: claim }),
    ];
    // 清空背包会真的把礼物送出去，不进「一键全部执行」，只允许手动确认后运行。
    const destructive: TaskDefinition[] = [createClearBackpackTask({ backpack })];

    return [...single, ...destructive, createDailyAllTask(single)];
  }
}
