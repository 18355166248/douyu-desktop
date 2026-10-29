import { useState } from 'react';
import type { TaskStatus } from '@shared/contracts/task';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { useTasks } from './useTasks';

const statusLabel: Record<TaskStatus, string> = {
  success: '完成',
  partial: '部分完成',
  skipped: '已跳过',
  failed: '失败',
};

interface TaskPanelProps {
  hasAccount: boolean;
  onClose?: () => void;
}

export function TaskPanel({ hasAccount, onClose }: TaskPanelProps): React.JSX.Element {
  const { query, tasks, runTask, progress, result, running, autoSignEnabled, setAutoSignEnabled } =
    useTasks();
  const [dryRun, setDryRun] = useState(false);
  const task = tasks[0];

  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <aside className="task-panel">
      <header className="panel-head">
        <div>
          <span className="eyebrow">TASK CENTER</span>
          <h2>签到</h2>
        </div>
        <div className="panel-head-actions">
          {running ? <span className="task-background">后台运行</span> : null}
          <span className="panel-count">{tasks.length}</span>
          {onClose ? (
            <button
              type="button"
              className="task-close"
              onClick={onClose}
              aria-label="关闭签到面板，任务会在后台继续"
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

      {task ? (
        <div className="task-card">
          <div className="task-card-head">
            <div className="task-icon">
              <Icon name="check" size={19} />
            </div>
            <div className="task-title">
              <h3>{task.title}</h3>
              <p>{task.description}</p>
            </div>
            <span className={`risk ${task.risk}`}>安全</span>
          </div>

          {!hasAccount ? (
            <div className="task-locked">
              <Icon name="lock" size={18} />
              <p>登录斗鱼后可用。签到只使用当前账号的独立会话。</p>
            </div>
          ) : (
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
                    <strong>每天自动签到</strong>
                    <small>启动后后台执行一次</small>
                  </span>
                </label>
              </div>

              <button
                type="button"
                className="btn primary task-run"
                disabled={running}
                onClick={() => {
                  runTask.mutate({ taskId: task.id, dryRun });
                }}
              >
                <Icon name={running ? 'loading' : 'tasks'} size={16} />
                {running ? '后台运行中…' : '运行任务'}
              </button>
            </>
          )}

          {running && !progress ? (
            <div className="task-progress">
              <div className="task-progress-head">
                <span>正在准备签到…</span>
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
        </div>
      ) : null}

      <div className="task-note">
        <Icon name="spark" size={16} />
        <p>
          任务在后台继续，关闭面板或最小化应用不会中断；直播和弹幕不受影响。请求已限速，失败按房间记录。
        </p>
      </div>
    </aside>
  );
}
