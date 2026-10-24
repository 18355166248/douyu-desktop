import type { TaskProgressEvent, TaskRunResult, TaskStatus } from '@shared/contracts/task';
import { Icon } from '../../components/Icon';
import { useTasks } from './useTasks';

const resultLabel: Record<TaskStatus, string> = {
  success: '已签到',
  partial: '部分失败',
  skipped: '无可签到',
  failed: '签到失败',
};

function buttonLabel(
  running: boolean,
  progress: TaskProgressEvent | null,
  result: TaskRunResult | null,
): string {
  if (running) return progress ? `签到 ${progress.current}/${progress.total}` : '签到中';
  if (result) return resultLabel[result.status];
  return '签到';
}

interface TaskButtonProps {
  open: boolean;
  onToggle: () => void;
}

export function TaskButton({ open, onToggle }: TaskButtonProps): React.JSX.Element {
  const { running, progress, result } = useTasks();
  const label = buttonLabel(running, progress, result);
  const title = running
    ? (progress?.message ?? '签到任务正在后台运行，关闭面板不影响执行')
    : result
      ? `${resultLabel[result.status]}：${result.summary}`
      : '打开签到任务';

  return (
    <button
      type="button"
      className={`titlebar-task${open ? ' is-active' : ''}${running ? ' is-running' : ''}${
        result ? ` is-${result.status}` : ''
      }`}
      onClick={onToggle}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={title}
      title={title}
    >
      <Icon
        name={running ? 'refresh' : result?.status === 'failed' ? 'alert' : 'check'}
        size={14}
        className={running ? 'task-spin' : undefined}
      />
      <span>{label}</span>
      {running ? <span className="task-running-dot" aria-hidden="true" /> : null}
    </button>
  );
}
