import { NotFoundException } from '@nestjs/common';
import { ReadinessService } from './readiness.service.js';

describe('ReadinessService', () => {
  const prisma = {
    phase: { findUnique: vi.fn() },
    criterion: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    evidence: { findMany: vi.fn() },
    coverageRequirement: { findMany: vi.fn() },
  };
  const coverageService = { calculate: vi.fn() };
  const service = new ReadinessService(prisma as never, coverageService as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.phase.findUnique.mockResolvedValue({ id: 'phase-1' });
    prisma.criterion.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.evidence.findMany.mockResolvedValue([]);
    prisma.coverageRequirement.findMany.mockResolvedValue([]);
    coverageService.calculate.mockResolvedValue({ phaseId: 'phase-1', requirements: [] });
  });

  it('rejects an unknown phase', async () => {
    prisma.phase.findUnique.mockResolvedValue(null);
    await expect(service.calculate('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns ready when no critical blocker exists', async () => {
    const result = await service.calculate('phase-1');
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('reports required criteria without treating evidence as criterion satisfaction', async () => {
    prisma.criterion.findMany.mockResolvedValue([{ id: 'criterion-1', name: 'Problem defined' }]);
    prisma.evidence.findMany.mockResolvedValue([{ id: 'evidence-1', title: 'Brief', status: 'VERIFIED' }]);
    const result = await service.calculate('phase-1');
    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({ type: 'CRITERION', relatedEntityId: 'criterion-1' }));
    expect(result.satisfiedConditions).toContainEqual(expect.objectContaining({ type: 'EVIDENCE', relatedEntityId: 'evidence-1' }));
  });

  it('reports coverage, tasks and evidence states without over-blocking information', async () => {
    coverageService.calculate.mockResolvedValue({
      phaseId: 'phase-1',
      requirements: [
        { requirementId: 'required', name: 'Risks', objectiveId: null, coveredInterviews: 12, minimumInterviews: 20, satisfied: false },
        { requirementId: 'satisfied', name: 'Problem', objectiveId: 'objective-1', coveredInterviews: 18, minimumInterviews: 15, satisfied: true },
      ],
    });
    prisma.coverageRequirement.findMany.mockResolvedValue([
      { id: 'required', required: true },
      { id: 'satisfied', required: true },
    ]);
    prisma.task.findMany.mockResolvedValue([
      { id: 'blocked-task', title: 'Blocked task', status: 'BLOCKED' },
      { id: 'done-task', title: 'Done task', status: 'DONE' },
    ]);
    prisma.evidence.findMany.mockResolvedValue([
      { id: 'pending-evidence', title: 'Pending', status: 'PENDING' },
      { id: 'rejected-evidence', title: 'Rejected', status: 'REJECTED' },
    ]);

    const result = await service.calculate('phase-1');

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual([
      expect.objectContaining({ type: 'COVERAGE', relatedEntityId: 'required' }),
      expect.objectContaining({ type: 'TASK', relatedEntityId: 'blocked-task' }),
    ]);
    expect(result.satisfiedConditions).toEqual([
      expect.objectContaining({ type: 'COVERAGE', relatedEntityId: 'satisfied' }),
      expect.objectContaining({ type: 'TASK', relatedEntityId: 'done-task' }),
    ]);
    expect(result.nextActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'INTERVIEW', relatedEntityId: 'required' }),
      expect.objectContaining({ type: 'EVIDENCE', relatedEntityId: 'pending-evidence' }),
      expect.objectContaining({ type: 'EVIDENCE', relatedEntityId: 'rejected-evidence' }),
    ]));
  });
});