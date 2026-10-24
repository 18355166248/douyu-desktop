import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  RunTaskInput,
  TaskDescriptor,
  TaskProgressEvent,
  TaskRunResult,
  TaskRunSnapshot,
} from '@shared/contracts/task';
import { unwrap } from '../../lib/api';
import { loadAutoSignEnabled, saveAutoSignEnabled } from './autoSign';

const tasksKey = ['tasks'] as const;

interface TasksContextValue {
  query: UseQueryResult<TaskDescriptor[]>;
  tasks: TaskDescriptor[];
  runTask: UseMutationResult<TaskRunResult, Error, RunTaskInput>;
  progress: TaskProgressEvent | null;
  result: TaskRunResult | null;
  snapshot: TaskRunSnapshot | null;
  running: boolean;
  statusReady: boolean;
  autoSignEnabled: boolean;
  setAutoSignEnabled: (enabled: boolean) => void;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<TaskRunSnapshot | null>(null);
  const [progress, setProgress] = useState<TaskProgressEvent | null>(null);
  const [result, setResult] = useState<TaskRunResult | null>(null);
  const [statusReady, setStatusReady] = useState(false);
  const [autoSignEnabled, setAutoSignEnabledState] = useState(loadAutoSignEnabled);

  const setAutoSignEnabled = useCallback((enabled: boolean): void => {
    setAutoSignEnabledState(enabled);
    saveAutoSignEnabled(enabled);
  }, []);

  useEffect(() => {
    let disposed = false;

    void window.api.tasks
      .status()
      .then((response) => {
        const state = unwrap(response);
        if (disposed) return;
        setSnapshot(state);
        setProgress(state?.progress ?? null);
        setResult(state?.result ?? null);
        setStatusReady(true);
      })
      .catch(() => {
        if (!disposed) setStatusReady(true);
      });

    const offProgress = window.api.tasks.onProgress((event) => {
      if (disposed) return;
      setProgress(event);
      setSnapshot((current) =>
        current
          ? { ...current, running: true, progress: event }
          : {
              taskId: event.taskId,
              startedAt: Date.now(),
              running: true,
              progress: event,
              result: null,
            },
      );
    });

    const offState = window.api.tasks.onState((state) => {
      if (disposed) return;
      setSnapshot(state);
      setStatusReady(true);
      if (!state) {
        setProgress(null);
        setResult(null);
        return;
      }
      setProgress(state.progress);
      setResult(state.result);
    });

    return () => {
      disposed = true;
      offProgress();
      offState();
    };
  }, []);

  const query = useQuery({
    queryKey: tasksKey,
    queryFn: async () => unwrap(await window.api.tasks.list()),
  });

  const runTask = useMutation({
    mutationFn: async (input: RunTaskInput) => unwrap(await window.api.tasks.run(input)),
    onMutate: () => {
      setResult(null);
      setProgress(null);
      setSnapshot(null);
    },
    onSuccess: (data) => {
      setResult(data);
      setSnapshot((current) =>
        current
          ? { ...current, running: false, result: data }
          : {
              taskId: data.taskId,
              startedAt: data.startedAt,
              running: false,
              progress: null,
              result: data,
            },
      );
    },
  });

  const value: TasksContextValue = {
    query,
    tasks: query.data ?? [],
    runTask,
    progress,
    result,
    snapshot,
    running: snapshot?.running ?? runTask.isPending,
    statusReady,
    autoSignEnabled,
    setAutoSignEnabled,
  };

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): TasksContextValue {
  const value = useContext(TasksContext);
  if (!value) throw new Error('useTasks must be used inside TasksProvider');
  return value;
}
