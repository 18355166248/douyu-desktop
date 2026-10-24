import type {
  RunTaskInput,
  TaskDescriptor,
  TaskProgressEvent,
  TaskRunResult,
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
  constructor(
    private readonly accounts: AccountSessionManager,
    private readonly logger: Logger,
  ) {}

  list(): TaskDescriptor[] {
    return [roomSignTaskDescriptor];
  }

  async run(
    input: RunTaskInput,
    onProgress?: (event: TaskProgressEvent) => void,
  ): Promise<TaskRunResult> {
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

    return runner.run(input, onProgress);
  }
}
