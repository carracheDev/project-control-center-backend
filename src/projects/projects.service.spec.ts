import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  const project = {
    id: 'project-1',
    name: 'Project',
    description: null,
    startDate: null,
    endDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new ProjectsService(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('creates a project with converted dates', async () => {
    prisma.project.create.mockResolvedValue(project);

    await service.create({
      name: 'Project',
      startDate: '2026-09-11T00:00:00.000Z',
    });

    expect(prisma.project.create).toHaveBeenCalledWith({
      data: {
        name: 'Project',
        description: undefined,
        startDate: new Date('2026-09-11T00:00:00.000Z'),
        endDate: undefined,
      },
    });
  });

  it('returns projects with their phases ordered', async () => {
    prisma.project.findMany.mockResolvedValue([project]);

    await service.findAll();

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      include: { phases: { orderBy: { order: 'asc' } } },
    });
  });

  it('rejects updates for an unknown project', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(service.update('unknown', { name: 'Updated' })).rejects.toThrow(
      'Project unknown not found',
    );
  });

  it('deletes an existing project', async () => {
    prisma.project.findUnique.mockResolvedValue(project);
    prisma.project.delete.mockResolvedValue(project);

    await service.remove(project.id);

    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: project.id } });
  });
});