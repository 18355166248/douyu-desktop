import type { TaskDescriptor } from '@shared/contracts/task';
import type { TaskDefinition } from './TaskDefinition';

export class TaskRegistry {
  private readonly tasks = new Map<string, TaskDefinition>();

  constructor(tasks: TaskDefinition[]) {
    for (const task of tasks) this.tasks.set(task.id, task);
  }

  get(taskId: string): TaskDefinition | undefined {
    return this.tasks.get(taskId);
  }

  list(): TaskDescriptor[] {
    return [...this.tasks.values()].map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      risk: task.risk,
      requiresLogin: task.requiresLogin,
      supportsDryRun: task.supportsDryRun,
      description: task.description,
    }));
  }
}
