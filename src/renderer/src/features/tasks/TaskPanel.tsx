import { useEffect, useState } from 'react';
import type { TaskStatus } from '@shared/contracts/task';
import { Icon } from '../../components/Icon';
import { useDismissableLayer } from '../../lib/useDismissableLayer';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { errorMessage } from '../../lib/api';
import { AutoClaimPanel } from './AutoClaimPanel';
import { useTasks } from './useTasks';

const statusLabel: Record<TaskStatus, string> = {
  success: '完成',
  partial: '部分完成',
  skipped: '已跳过',
  failed: '失败',
};

const RUN_ALL_TASK_ID = 'douyu.daily-all';
/** 二次确认的保持时间，和「清空历史」保持一致的 3 秒手感。 */
const CONFIRM_WINDOW_MS = 3_000;

interface TaskPanelProps {
  hasAccount: boolean;
  /** 当前正在看的斗鱼直播间，清空背包要用它作为收礼房间。 */
  douyuRoomId: string | null;
  onClose?: () => void;
}

export function TaskPanel({
  hasAccount,
  douyuRoomId,
  onClose,
}: TaskPanelProps): React.JSX.Element {
  const { query, tasks, runTask, progress, result, running, autoSignEnabled, setAutoSignEnabled } =
    useTasks();
  const panelRef = useDialogFocus();
  useDismissableLayer({ modal: true, open: true, onClose: () => onClose?.(), layerRef: panelRef });
  const [dryRun, setDryRun] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (confirming === null) return;
    const timer = window.setTimeout(() => setConfirming(null), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  const dailyTask = tasks.find((task) => task.id === RUN_ALL_TASK_ID);
  const singleTasks = tasks.filter((task) => task.id !== RUN_ALL_TASK_ID);

  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <aside ref={panelRef} className="task-panel">
      <header className="panel-head">
        <div>
          <span className="eyebrow">TASK CENTER</span>
          <h2>签到与领取</h2>
        </div>
        <div className="panel-head-actions">
          {running ? <span className="task-background">后台运行</span> : null}
          <span className="panel-count">{tasks.length}</span>
          {onClose ? (
            <button
              type="button"
              className="task-close"
              onClick={onClose}
              aria-label="关闭任务面板，任务会在后台继续"
              title={running ? '关闭面板，任务会在后台继续' : '关闭'}
            >
              <Icon name="close" size={15} />
            </button>
          ) : null}
        </div>
      </header>

      {query.isPending ? <div className="task-skeleton" aria-label="加载任务" /> : null}

      {query.isError ? (
        <div className="task-locked">
          <Icon name="alert" size={18} />
          <p className="selectable">{errorMessage(query.error)}</p>
          <button type="button" className="btn subtle" onClick={() => void query.refetch()}>
            重试
          </button>
        </div>
      ) : null}

      {!hasAccount && tasks.length > 0 ? (
        <div className="task-locked">
          <Icon name="lock" size={18} />
          <p>登录斗鱼后可用。签到只使用当前账号的独立会话。</p>
        </div>
      ) : null}

      {hasAccount ? (
        <>
          <div className="task-options">
            <label className="task-option">
              <input
                type="checkbox"
                checked={dryRun}
                disabled={running}
                onChange={(event) => setDryRun(event.target.checked)}
              />
              <span>
                <strong>模拟运行</strong>
                <small>只统计，不签到</small>
              </span>
            </label>
            <label className="task-option">
              <input
                type="checkbox"
                checked={autoSignEnabled}
                onChange={(event) => setAutoSignEnabled(event.target.checked)}
              />
              <span>
                <strong>每天自动执行</strong>
                <small>启动后后台跑一次「一键全部执行」</small>
              </span>
            </label>
          </div>

          <button
            type="button"
            className="btn primary task-run"
            disabled={running || !dailyTask}
            onClick={() => {
              if (dailyTask) runTask.mutate({ taskId: dailyTask.id, dryRun });
            }}
          >
            <Icon name={running ? 'loading' : 'tasks'} size={16} />
            {running ? '后台运行中…' : '一键全部执行'}
          </button>

          <ul className="task-list">
            {singleTasks.map((task) => {
              const needsConfirm = task.risk === 'confirm';
              const needsRoom = task.category === 'bag';
              const blocked = needsRoom && !douyuRoomId;
              const isConfirming = confirming === task.id;
              return (
                <li key={task.id} className="task-list-item">
                  <div className="task-icon">
                    <Icon name="check" size={16} />
                  </div>
                  <div className="task-list-body">
                    <div className="task-list-title">
                      <h3>{task.title}</h3>
                      {task.risk === 'safe' ? null : (
                        <span className={`risk ${task.risk}`}>需确认</span>
                      )}
                    </div>
                    <p>{task.description}</p>
                    {blocked ? (
                      <p className="task-list-hint">先打开一个斗鱼直播间，再清空背包</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`btn subtle task-list-run${isConfirming ? ' is-confirming' : ''}`}
                    disabled={running || blocked}
                    title={blocked ? '先打开一个斗鱼直播间' : undefined}
                    onClick={() => {
                      if (blocked) return;
                      if (needsConfirm && !isConfirming) {
                        setConfirming(task.id);
                        return;
                      }
                      setConfirming(null);
                      runTask.mutate({
                        taskId: task.id,
                        dryRun,
                        ...(needsConfirm ? { confirmed: true } : {}),
                        ...(needsRoom && douyuRoomId ? { options: { roomId: douyuRoomId } } : {}),
                      });
                    }}
                  >
                    {isConfirming ? '确认送出？' : needsConfirm ? '清空' : '运行'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {running && !progress ? (
        <div className="task-progress">
          <div className="task-progress-head">
            <span>正在准备任务…</span>
            <span>后台</span>
          </div>
          <div className="task-progress-track is-indeterminate">
            <span style={{ width: '35%' }} />
          </div>
        </div>
      ) : null}

      {progress ? (
        <div className="task-progress">
          <div className="task-progress-head">
            <span>{progress.message}</span>
            <span>
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="task-progress-track">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      {runTask.error ? (
        <div className="task-result failed">
          <strong>运行失败</strong>
          <p className="selectable">{errorMessage(runTask.error)}</p>
        </div>
      ) : null}

      {result ? (
        <div className={`task-result ${result.status}`}>
          <div className="task-result-head">
            <strong>{statusLabel[result.status]}</strong>
            {result.metrics ? (
              <span>
                成功 {result.metrics.succeeded} / 失败 {result.metrics.failed}
              </span>
            ) : null}
          </div>
          <p>{result.summary}</p>
        </div>
      ) : null}

      {hasAccount ? <AutoClaimPanel /> : null}

      <div className="task-note">
        <Icon name="spark" size={16} />
        <p>
          任务在后台继续，关闭面板或最小化应用不会中断；直播和弹幕不受影响。请求已限速，失败按房间记录。
          抢宝箱需要直播间 socket 指令与极验，暂未纳入自动流程。
        </p>
      </div>
    </aside>
  );
}
