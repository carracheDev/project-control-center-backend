import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ObjectivesService } from './objectives.service.js';

describe('ObjectivesService', () => {
  const objective = { id: 'objective-1', phaseId: 'phase-1', name: 'Objective', order: 1 };
  const prisma = {
    phase: { findUnique: vi.fn() },
    objective: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const service = new ObjectivesService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates an objective for an existing phase', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.objective.create.mockResolvedValue(objective);

    await service.create('phase-1', { name: 'Objective', order: 1 });

    expect(prisma.objective.create).toHaveBeenCalledWith({
      data: { phaseId: 'phase-1', name: 'Objective', description: undefined, order: 1 },
    });
  });

  it('rejects a missing phase', async () => {
    prisma.phase.findUnique.mockResolvedValue(null);
    await expect(service.create('missing', { name: 'Objective', order: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps duplicate order to a conflict', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.objective.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    await expect(service.create('phase-1', { name: 'Duplicate', order: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('updates and deletes an objective', async () => {
    prisma.objective.findUnique.mockResolvedValue(objective);
    prisma.objective.update.mockResolvedValue(objective);
    prisma.objective.delete.mockResolvedValue(objective);

    await service.update(objective.id, { name: 'Updated' });
    await service.remove(objective.id);

    expect(prisma.objective.update).toHaveBeenCalled();
    expect(prisma.objective.delete).toHaveBeenCalledWith({ where: { id: objective.id } });
  });
});