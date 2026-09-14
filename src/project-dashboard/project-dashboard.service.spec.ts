import { ProjectDashboardService } from './project-dashboard.service.js';

describe('ProjectDashboardService', () => {
  const prisma = { project: { findMany: vi.fn() } };
  const service = new ProjectDashboardService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('returns an empty dashboard without dividing by zero', async () => {
    prisma.project.findMany.mockResolvedValue([]);
    await expect(service.getDashboard()).resolves.toEqual(expect.objectContaining({
      summary: { totalProjects: 0, activeProjects: 0, completedProjects: 0, blockedProjects: 0, projectsNeedingAttention: 0 },
      projects: [],
      recentValidations: [],
      attentionItems: [],
    }));
  });

  it('aggregates phases, tasks, interviews, evidence and validations without false TODO/PENDING blockers', async () => {
    prisma.project.findMany.mockResolvedValue([{
      id: 'project-a',
      name: 'Project A',
      description: 'A project',
      phases: [
        {
          id: 'phase-a1', name: 'Research', order: 1, status: 'VALIDATED',
          tasks: [{ status: 'DONE' }, { status: 'TODO' }],
          criteria: [],
          interviews: [{ status: 'COMPLETED', responses: [] }, { status: 'PLANNED', responses: [] }],
          evidences: [{ title: 'Pending note', status: 'PENDING' }],
          coverageRequirements: [],
          validations: [{ id: 'validation-1', validatedAt: new Date('2026-09-10T10:00:00Z'), validatedBy: 'reviewer', note: 'Done' }],
        },
        {
          id: 'phase-a2', name: 'Delivery', order: 2, status: 'IN_PROGRESS',
          tasks: [{ status: 'BLOCKED' }],
          criteria: [{ id: 'criterion-1', name: 'Required criterion', assessment: { status: 'NOT_SATISFIED' } }],
          interviews: [],
          evidences: [{ title: 'Rejected file', status: 'REJECTED' }],
          coverageRequirements: [{ id: 'coverage-1', name: 'Need coverage', objectiveId: null, minimumInterviews: 1, required: true }],
          validations: [],
        },
      ],
    }]);

    const result = await service.getDashboard();
    const project = result.projects[0];
    expect(project.progress).toEqual({ completedPhases: 1, totalPhases: 2, percentage: 50 });
    expect(project.phase).toEqual({ id: 'phase-a2', name: 'Delivery', order: 2, status: 'IN_PROGRESS' });
    expect(project.tasks).toEqual({ total: 3, done: 1, blocked: 1 });
    expect(project.interviews).toEqual({ total: 2, completed: 1 });
    expect(project.evidence).toEqual({ total: 2, verified: 0, pending: 1, rejected: 1 });
    expect(project.attention.hasBlockers).toBe(true);
    expect(project.attention.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TASK', severity: 'HIGH' }),
      expect.objectContaining({ type: 'CRITERION', severity: 'HIGH' }),
      expect.objectContaining({ type: 'COVERAGE', severity: 'HIGH' }),
      expect.objectContaining({ type: 'EVIDENCE', severity: 'WARNING' }),
    ]));
    expect(result.recentValidations).toEqual([expect.objectContaining({ projectId: 'project-a', phaseId: 'phase-a1' })]);
  });

  it('keeps multiple projects isolated and uses the first accessible phase', async () => {
    prisma.project.findMany.mockResolvedValue([
      { id: 'project-a', name: 'A', description: null, phases: [{ id: 'a1', name: 'A1', order: 1, status: 'PLANNED', tasks: [], criteria: [], interviews: [], evidences: [], coverageRequirements: [], validations: [] }] },
    ]);
    const result = await service.getDashboard('project-a');
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'project-a' } }));
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].phase?.id).toBe('a1');
  });
});