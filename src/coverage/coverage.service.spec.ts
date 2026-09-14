import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CoverageService } from './coverage.service.js';

describe('CoverageService', () => {
  const requirement = { id: 'requirement-1', phaseId: 'phase-1', objectiveId: 'objective-1', name: 'Understand need', description: null, minimumInterviews: 2, required: true };
  const prisma = {
    phase: { findUnique: vi.fn() },
    objective: { findUnique: vi.fn() },
    coverageRequirement: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    interview: { findMany: vi.fn() },
  };
  const service = new CoverageService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates, updates and deletes a valid requirement', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.objective.findUnique.mockResolvedValue({ id: 'objective-1', phaseId: 'phase-1' });
    prisma.coverageRequirement.create.mockResolvedValue(requirement);
    prisma.coverageRequirement.findUnique.mockResolvedValue(requirement);
    prisma.coverageRequirement.update.mockResolvedValue(requirement);
    prisma.coverageRequirement.delete.mockResolvedValue(requirement);
    await service.create('phase-1', { objectiveId: 'objective-1', name: 'Understand need', minimumInterviews: 2 });
    await service.update(requirement.id, { minimumInterviews: 3 });
    await service.remove(requirement.id);
    expect(prisma.coverageRequirement.create).toHaveBeenCalled();
    expect(prisma.coverageRequirement.update).toHaveBeenCalled();
    expect(prisma.coverageRequirement.delete).toHaveBeenCalledWith({ where: { id: requirement.id } });
  });

  it('rejects missing phases, missing objectives and cross-phase objectives', async () => {
    prisma.phase.findUnique.mockResolvedValue(null);
    await expect(service.create('missing', { name: 'Requirement', minimumInterviews: 1 })).rejects.toBeInstanceOf(NotFoundException);
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.objective.findUnique.mockResolvedValue(null);
    await expect(service.create('phase-1', { objectiveId: 'missing', name: 'Requirement', minimumInterviews: 1 })).rejects.toBeInstanceOf(NotFoundException);
    prisma.objective.findUnique.mockResolvedValue({ id: 'objective-1', phaseId: 'phase-2' });
    await expect(service.create('phase-1', { objectiveId: 'objective-1', name: 'Requirement', minimumInterviews: 1 })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('calculates phase and objective coverage without double-counting interviews', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1', status: 'PLANNED' });
    prisma.coverageRequirement.findMany.mockResolvedValue([
      requirement,
      { id: 'requirement-2', phaseId: 'phase-1', objectiveId: null, name: 'Complete interviews', minimumInterviews: 3, required: false },
    ]);
    prisma.interview.findMany.mockResolvedValue([
      { id: 'interview-1', status: 'COMPLETED', responses: [{ question: { objectiveId: 'objective-1' } }, { question: { objectiveId: 'objective-1' } }] },
      { id: 'interview-2', status: 'COMPLETED', responses: [{ question: { objectiveId: 'objective-1' } }] },
      { id: 'interview-3', status: 'IN_PROGRESS', responses: [{ question: { objectiveId: 'objective-1' } }] },
      { id: 'interview-4', status: 'CANCELLED', responses: [] },
    ]);

    const result = await service.calculate('phase-1');

    expect(result).toEqual({
      phaseId: 'phase-1',
      totalInterviews: 4,
      completedInterviews: 2,
      requirements: [
        { requirementId: 'requirement-1', name: 'Understand need', objectiveId: 'objective-1', minimumInterviews: 2, coveredInterviews: 2, percentage: 100, satisfied: true },
        { requirementId: 'requirement-2', name: 'Complete interviews', objectiveId: null, minimumInterviews: 3, coveredInterviews: 2, percentage: 67, satisfied: false },
      ],
      allRequiredSatisfied: true,
    });
    expect(prisma.phase.findUnique).toHaveBeenCalled();
  });

  it('does not count responses to questions without an objective', async () => {
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.coverageRequirement.findMany.mockResolvedValue([requirement]);
    prisma.interview.findMany.mockResolvedValue([{ id: 'interview-1', status: 'COMPLETED', responses: [{ question: { objectiveId: null } }] }]);
    const result = await service.calculate('phase-1');
    expect(result.requirements[0].coveredInterviews).toBe(0);
    expect(result.requirements[0].satisfied).toBe(false);
  });
});