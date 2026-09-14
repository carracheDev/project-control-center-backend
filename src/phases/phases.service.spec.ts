import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PhasesService } from './phases.service.js';

describe('PhasesService', () => {
  const project = { id: 'project-1' };
  const phase = {
    id: 'phase-1',
    projectId: project.id,
    name: 'Phase one',
    description: null,
    order: 1,
    status: 'PLANNED',
    startDate: null,
    endDate: null,
    deadline: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    project: { findUnique: vi.fn() },
    phase: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new PhasesService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates a planned phase for an existing project', async () => {
    prisma.project.findUnique.mockResolvedValue(project);
    prisma.phase.findFirst.mockResolvedValue(null);
    prisma.phase.create.mockResolvedValue(phase);

    await service.create(project.id, { name: 'Phase one', order: 1 });

    expect(prisma.phase.create).toHaveBeenCalledWith({
      data: {
        projectId: project.id,
        name: 'Phase one',
        description: undefined,
        order: 1,
        status: 'PLANNED',
        startDate: undefined,
        endDate: undefined,
        deadline: undefined,
      },
    });
  });

  it('maps duplicate order errors to a conflict', async () => {
    prisma.project.findUnique.mockResolvedValue(project);
    prisma.phase.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(service.create(project.id, { name: 'Duplicate', order: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lists phases in order for a project', async () => {
    prisma.phase.findMany.mockResolvedValue([phase]);

    await service.findAll(project.id);

    expect(prisma.phase.findMany).toHaveBeenCalledWith({
      where: { projectId: project.id },
      orderBy: { order: 'asc' },
    });
  });

  it('creates a locked phase when the previous phase is not validated', async () => {
    prisma.project.findUnique.mockResolvedValue(project);
    prisma.phase.findFirst.mockResolvedValue({ id: 'phase-1', name: 'Phase one', order: 1, status: 'PLANNED' });
    prisma.phase.create.mockResolvedValue({ ...phase, id: 'phase-2', order: 2, status: 'LOCKED' });

    await service.create(project.id, { name: 'Phase two', order: 2 });

    expect(prisma.phase.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'LOCKED' }) }));
  });

  it('reports first phases as accessible and dependent phases as locked', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1', projectId: 'project-1', order: 1, status: 'PLANNED' });
    prisma.phase.findFirst.mockResolvedValue(null);
    await expect(service.getPhaseWorkflowState('phase-1')).resolves.toEqual({
      phaseId: 'phase-1',
      status: 'PLANNED',
      previousPhase: null,
      accessible: true,
      locked: false,
      reason: null,
    });

    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-2', projectId: 'project-1', order: 2, status: 'LOCKED' });
    prisma.phase.findFirst.mockResolvedValue({ id: 'phase-1', name: 'Phase one', order: 1, status: 'PLANNED' });
    const workflow = await service.getPhaseWorkflowState('phase-2');
    expect(workflow.locked).toBe(true);
    expect(workflow.previousPhase).toEqual({ id: 'phase-1', name: 'Phase one', status: 'PLANNED' });
  });

  it('uses only the same project when finding a previous phase', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-b', projectId: 'project-b', order: 2, status: 'LOCKED' });
    prisma.phase.findFirst.mockResolvedValue(null);
    const workflow = await service.getPhaseWorkflowState('phase-b');
    expect(workflow.accessible).toBe(true);
    expect(prisma.phase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'project-b', order: { lt: 2 } } }));
  });

  it('does not expose status in phase updates', async () => {
    prisma.phase.findUnique.mockResolvedValue(phase);
    prisma.phase.update.mockResolvedValue(phase);

    await service.update(phase.id, { name: 'Updated phase' });

    expect(prisma.phase.update).toHaveBeenCalledWith({
      where: { id: phase.id },
      data: {
        name: 'Updated phase',
        description: undefined,
        order: undefined,
        startDate: undefined,
        endDate: undefined,
        deadline: undefined,
      },
    });
  });
});