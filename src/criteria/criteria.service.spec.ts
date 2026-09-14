import { UnprocessableEntityException } from '@nestjs/common';
import { CriteriaService } from './criteria.service.js';

describe('CriteriaService', () => {
  const criterion = { id: 'criterion-1', phaseId: 'phase-1', objectiveId: null, name: 'Criterion', required: true, order: 1 };
  const prisma = {
    phase: { findUnique: vi.fn() },
    objective: { findUnique: vi.fn() },
    criterion: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const service = new CriteriaService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates a criterion without an objective', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.criterion.create.mockResolvedValue(criterion);

    await service.create('phase-1', { name: 'Criterion', required: true, order: 1 });

    expect(prisma.criterion.create).toHaveBeenCalledWith({
      data: {
        phaseId: 'phase-1',
        objectiveId: undefined,
        name: 'Criterion',
        description: undefined,
        required: true,
        order: 1,
      },
    });
  });

  it('rejects an objective from another phase', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.objective.findUnique.mockResolvedValue({ id: 'objective-1', phaseId: 'phase-2' });

    await expect(
      service.create('phase-1', { objectiveId: 'objective-1', name: 'Criterion', required: false, order: 1 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.criterion.create).not.toHaveBeenCalled();
  });

  it('updates and deletes a criterion', async () => {
    prisma.criterion.findUnique.mockResolvedValue(criterion);
    prisma.criterion.update.mockResolvedValue(criterion);
    prisma.criterion.delete.mockResolvedValue(criterion);

    await service.update(criterion.id, { required: false });
    await service.remove(criterion.id);

    expect(prisma.criterion.update).toHaveBeenCalled();
    expect(prisma.criterion.delete).toHaveBeenCalledWith({ where: { id: criterion.id } });
  });
});