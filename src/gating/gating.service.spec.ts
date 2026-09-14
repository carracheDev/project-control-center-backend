import { NotFoundException } from '@nestjs/common';
import { GatingService } from './gating.service.js';

describe('GatingService', () => {
  const prisma = {
    phase: { findUnique: vi.fn() },
    criterion: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    coverageRequirement: { findMany: vi.fn() },
  };
  const coverageService = { calculate: vi.fn() };
  const service = new GatingService(prisma as never, coverageService as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.criterion.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.coverageRequirement.findMany.mockResolvedValue([]);
    coverageService.calculate.mockResolvedValue({ phaseId: 'phase-1', requirements: [] });
  });

  it('rejects an unknown phase', async () => {
    prisma.phase.findUnique.mockResolvedValue(null);
    await expect(service.calculate('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows validation when no required condition exists', async () => {
    const result = await service.calculate('phase-1');
    expect(result.canValidate).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(prisma.criterion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { phaseId: 'phase-1', required: true } }));
  });

  it('maps satisfied and insufficient required coverage without recalculating it', async () => {
    prisma.coverageRequirement.findMany.mockResolvedValue([{ id: 'required-1' }, { id: 'required-2' }]);
    coverageService.calculate.mockResolvedValue({
      phaseId: 'phase-1',
      requirements: [
        { requirementId: 'required-1', name: 'Problem', coveredInterviews: 2, minimumInterviews: 2, satisfied: true },
        { requirementId: 'required-2', name: 'Risks', coveredInterviews: 1, minimumInterviews: 3, satisfied: false },
      ],
    });

    const result = await service.calculate('phase-1');

    expect(result.canValidate).toBe(false);
    expect(result.satisfiedConditions).toEqual(['Coverage Problem']);
    expect(result.blockers).toEqual(['Coverage Risks']);
    expect(coverageService.calculate).toHaveBeenCalledWith('phase-1');
    expect(prisma.coverageRequirement.findMany).toHaveBeenCalledTimes(1);
  });

  it('uses only explicit assessment status for required criteria', async () => {
    prisma.criterion.findMany.mockResolvedValue([
      { id: 'pending', name: 'Pending criterion', assessment: { status: 'PENDING' } },
      { id: 'not-satisfied', name: 'Rejected criterion', assessment: { status: 'NOT_SATISFIED' } },
      { id: 'satisfied', name: 'Satisfied criterion', assessment: { status: 'SATISFIED' } },
    ]);
    const result = await service.calculate('phase-1');
    expect(result.canValidate).toBe(false);
    expect(result.conditions).toContainEqual(expect.objectContaining({ code: 'CRITERION_REQUIRED_pending', satisfied: false, reason: 'Critère obligatoire non évalué.' }));
    expect(result.conditions).toContainEqual(expect.objectContaining({ code: 'CRITERION_REQUIRED_not-satisfied', satisfied: false, reason: 'Critère évalué comme non satisfait.' }));
    expect(result.conditions).toContainEqual(expect.objectContaining({ code: 'CRITERION_REQUIRED_satisfied', satisfied: true, reason: 'Critère évalué comme satisfait.' }));
    expect(result.satisfiedConditions).toContain('Satisfied criterion');
  });

  it('does not infer criterion satisfaction from evidence', async () => {
    prisma.criterion.findMany.mockResolvedValue([{ id: 'criterion-1', name: 'Problem defined', assessment: undefined }]);
    const result = await service.calculate('phase-1');
    expect(result.conditions).toContainEqual(expect.objectContaining({ code: 'CRITERION_REQUIRED_criterion-1', satisfied: false }));
  });

  it('blocks only BLOCKED tasks and keeps TODO, IN_PROGRESS and DONE semantics explicit', async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 'blocked', title: 'Blocked', status: 'BLOCKED' },
      { id: 'todo', title: 'Todo', status: 'TODO' },
      { id: 'progress', title: 'Progress', status: 'IN_PROGRESS' },
      { id: 'done', title: 'Done', status: 'DONE' },
    ]);
    const result = await service.calculate('phase-1');
    expect(result.canValidate).toBe(false);
    expect(result.blockers).toEqual(['Tâche bloquée : Blocked']);
    expect(result.satisfiedConditions).toEqual(['Tâche terminée : Done']);
    expect(result.conditions).toHaveLength(2);
  });

  it('reports all independent blockers and never changes phase status', async () => {
    prisma.criterion.findMany.mockResolvedValue([{ id: 'criterion-1', name: 'Criterion' }]);
    prisma.task.findMany.mockResolvedValue([{ id: 'task-1', title: 'Blocked task', status: 'BLOCKED' }]);
    prisma.coverageRequirement.findMany.mockResolvedValue([{ id: 'coverage-1' }]);
    coverageService.calculate.mockResolvedValue({
      phaseId: 'phase-1',
      requirements: [{ requirementId: 'coverage-1', name: 'Coverage', coveredInterviews: 0, minimumInterviews: 1, satisfied: false }],
    });
    await service.calculate('phase-1');
    expect(prisma.phase.update).toBeUndefined();
    const result = await service.calculate('phase-1');
    expect(result.blockers).toEqual(['Coverage Coverage', 'Criterion', 'Tâche bloquée : Blocked task']);
  });
});