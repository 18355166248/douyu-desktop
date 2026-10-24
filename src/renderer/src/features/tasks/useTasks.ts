import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { RunTaskInput, TaskProgressEvent, TaskRunResult } from '@shared/contracts/task';
import { unwrap } from '../../lib/api';

const tasksKey = ['tasks'] as const;

export function useTasks() {
  const [progress, setProgress] = useState<TaskProgressEvent | null>(null);
  const [result, setResult] = useState<TaskRunResult | null>(null);

  useEffect(() => window.api.tasks.onProgress(setProgress), []);

  const query = useQuery({
    queryKey: tasksKey,
    queryFn: async () => unwrap(await window.api.tasks.list()),
  });

  const runTask = useMutation({
    mutationFn: async (input: RunTaskInput) => unwrap(await window.api.tasks.run(input)),
    onMutate: () => {
      setResult(null);
      setProgress(null);
    },
    onSuccess: (data) => setResult(data),
  });

  return {
    query,
    tasks: query.data ?? [],
    runTask,
    progress,
    result,
  };
}
