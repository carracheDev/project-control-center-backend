import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectMemberRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { ProjectAccessService } from '../project-access/project-access.service.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService, private readonly projectAccess?: ProjectAccessService) {}

  async create(dto: CreateProjectDto, user?: AuthenticatedUser) {
    if (this.projectAccess && user) await this.projectAccess.assertCanCreateProject(user);
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
    if (this.projectAccess && user && !this.projectAccess.isAdmin(user)) {
      await this.prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: ProjectMemberRole.PROJECT_MANAGER } });
    }
    return project;
  }

  async findAll(user?: AuthenticatedUser) {
    const projectIds = this.projectAccess && user ? await this.projectAccess.getAccessibleProjectIds(user) : null;
    return this.prisma.project.findMany({
      where: projectIds ? { id: { in: projectIds } } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { phases: { orderBy: { order: 'asc' } } },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { phases: { orderBy: { order: 'asc' } } },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.ensureExists(id);

    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.project.delete({ where: { id } });
  }

  private async ensureExists(id: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }
}