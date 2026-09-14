import { NotFoundException } from '@nestjs/common';
import { DecisionService } from './decision.service.js';

describe('DecisionService', () => {
  const prisma = {
    project: { findUnique: vi.fn() },
    projectDecision: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  };
  const dashboardService = { getDashboard: vi.fn() };
  const service = new DecisionService(prisma as never, dashboardService as never);
  const project = {
    id: 'project-1',
    name: 'Project One',
    phases: [{
      id: 'phase-1', status: 'PLANNED',
      objectives: [{ id: 'objective-1' }],
      criteria: [{ id: 'criterion-1', required: true, assessment: { status: 'PENDING' } }],
      tasks: [{ status: 'TODO' }, { status: 'DONE' }],
      interviews: [{ status: 'COMPLETED', responses: [] }],
      evidences: [{ status: 'VERIFIED' }],
      coverageRequirements: [{ id: 'coverage-1', required: true, objectiveId: null, minimumInterviews: 1 }],
      validations: [],
    }],
  };
  const dashboard = {
    projects: [{ id: 'project-1', name: 'Project One', description: null, phase: null, progress: { completedPhases: 0, totalPhases: 1, percentage: 0 }, tasks: { total: 2, done: 1, blocked: 0 }, interviews: { total: 1, completed: 1 }, evidence: { total: 1, verified: 1, pending: 0, rejected: 0 }, attention: { hasBlockers: true, items: [] } }],
    recentValidations: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue(project);
    dashboardService.getDashboard.mockResolvedValue(dashboard);
    prisma.projectDecision.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'decision-1', ...data }));
  });

  it('creates a trimmed decision with a backend snapshot and no workflow mutation', async () => {
    const result = await service.create('project-1', { type: 'GO', rationale: '  Proceed  ', nextSteps: '  Ship  ', decidedBy: '  Lead  ' });
    expect(result).toEqual(expect.objectContaining({ type: 'GO', rationale: 'Proceed', nextSteps: 'Ship', decidedBy: 'Lead' }));
    expect(prisma.projectDecision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: 'project-1', reportSnapshot: expect.objectContaining({ projectId: 'project-1', projectName: 'Project One', phaseSummary: expect.objectContaining({ total: 1, planned: 1 }), criteriaSummary: expect.objectContaining({ pending: 1 }), taskSummary: expect.objectContaining({ done: 1 }), evidenceSummary: expect.objectContaining({ verified: 1 }) }) }) }));
    expect(prisma).not.toHaveProperty('phase.update');
  });

  it.each(['GO', 'PIVOT', 'NO_GO'])('supports the explicit %s decision type', async (type) => {
    await expect(service.create('project-1', { type, rationale: 'Human decision' })).resolves.toEqual(expect.objectContaining({ type }));
  });

  it('rejects an unknown project and exposes immutable history reads', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.create('missing', { type: 'GO', rationale: 'Decision' })).rejects.toBeInstanceOf(NotFoundException);
    prisma.project.findUnique.mockResolvedValue(project);
    prisma.projectDecision.findMany.mockResolvedValue([{ id: 'decision-1' }]);
    prisma.projectDecision.findUnique.mockResolvedValue({ id: 'decision-1' });
    await expect(service.findAll('project-1')).resolves.toEqual([{ id: 'decision-1' }]);
    await expect(service.findOne('decision-1')).resolves.toEqual({ id: 'decision-1' });
    expect(prisma.projectDecision).not.toHaveProperty('update');
    expect(prisma.projectDecision).not.toHaveProperty('delete');
  });
});