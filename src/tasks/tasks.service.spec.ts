import { TaskPriority, TaskStatus } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { TasksService } from './tasks.service.js';

describe('TasksService', () => {
  const task = { id: 'task-1', phaseId: 'phase-1', objectiveId: null, criterionId: null, title: 'Task' };
  const prisma = {
    phase: { findUnique: vi.fn() },
    objective: { findUnique: vi.fn() },
    criterion: { findUnique: vi.fn() },
    task: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const service = new TasksService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates a task with default-compatible status and priority inputs', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.task.create.mockResolvedValue(task);

    await service.create('phase-1', {
      title: 'Task',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
    });

    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ phaseId: 'phase-1', title: 'Task', status: TaskStatus.TODO, priority: TaskPriority.HIGH }),
    });
  });

  it('rejects an objective or criterion from another phase', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.objective.findUnique.mockResolvedValue({ id: 'objective-1', phaseId: 'phase-2' });

    await expect(service.create('phase-1', { title: 'Task', objectiveId: 'objective-1' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.task.create).not.toHaveBeenCalled();

    prisma.objective.findUnique.mockResolvedValue(null);
    prisma.criterion.findUnique.mockResolvedValue({ id: 'criterion-1', phaseId: 'phase-2' });
    await expect(service.create('phase-1', { title: 'Task', criterionId: 'criterion-1' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('changes task status and priority, then deletes the task', async () => {
    prisma.task.findUnique.mockResolvedValue(task);
    prisma.task.update.mockResolvedValue(task);
    prisma.task.delete.mockResolvedValue(task);

    await service.update(task.id, { status: TaskStatus.DONE, priority: TaskPriority.LOW });
    await service.remove(task.id);

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: task.id },
      data: expect.objectContaining({ status: TaskStatus.DONE, priority: TaskPriority.LOW }),
    });
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: task.id } });
  });
});