import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GlobalRole, ProjectMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthenticatedUser } from '../auth/types/authenticated-user.js';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isAdmin(user: AuthenticatedUser): boolean { return user.globalRole === GlobalRole.ADMIN; }

  async getProjectRole(userId: string, projectId: string): Promise<ProjectMemberRole | null> {
    const membership = await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } });
    return membership?.role ?? null;
  }

  async assertProjectAccess(user: AuthenticatedUser, projectId: string, roles?: ProjectMemberRole[]): Promise<void> {
    if (this.isAdmin(user)) return;
    const role = await this.getProjectRole(user.id, projectId);
    const canReadAsManager = role === ProjectMemberRole.PROJECT_MANAGER && roles?.includes(ProjectMemberRole.VIEWER);
    if (!role || (roles?.length && !roles.includes(role) && !canReadAsManager)) throw new ForbiddenException('Project access denied');
  }

  async assertCanCreateProject(user: AuthenticatedUser): Promise<void> {
    if (this.isAdmin(user)) return;
    const memberships = await this.prisma.projectMember.findMany({ where: { userId: user.id }, select: { role: true } });
    if (memberships.length > 0 && memberships.every((membership) => membership.role === ProjectMemberRole.VIEWER)) throw new ForbiddenException('Project creation denied');
  }

  async getAccessibleProjectIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (this.isAdmin(user)) return null;
    const memberships = await this.prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } });
    return memberships.map((membership) => membership.projectId);
  }

  async resolveProjectId(resource: string, id: string): Promise<string> {
    const projectId = await this.findProjectId(resource, id);
    if (!projectId) throw new NotFoundException(`${resource} ${id} not found`);
    return projectId;
  }

  async addProjectManager(projectId: string, userId: string): Promise<void> {
    await this.prisma.projectMember.upsert({ where: { projectId_userId: { projectId, userId } }, update: { role: ProjectMemberRole.PROJECT_MANAGER }, create: { projectId, userId, role: ProjectMemberRole.PROJECT_MANAGER } });
  }

  private async findProjectId(resource: string, id: string): Promise<string | null> {
    const select = { phase: { select: { projectId: true } } };
    if (resource === 'project') return (await this.prisma.project.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
    if (resource === 'phase') {
      return (await this.prisma.phase.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    }
    if (resource === 'objective' || resource === 'criterion' || resource === 'task' || resource === 'questionnaire' || resource === 'interview' || resource === 'evidence' || resource === 'coverageRequirement') {
      const model = this.prisma[resource === 'coverageRequirement' ? 'coverageRequirement' : resource] as { findUnique: Function };
      return (await model.findUnique({ where: { id }, select }))?.phase?.projectId ?? null;
    }
    if (resource === 'question') return (await this.prisma.question.findUnique({ where: { id }, select: { questionnaire: { select } } }))?.questionnaire?.phase?.projectId ?? null;
    if (resource === 'option') return (await this.prisma.questionOption.findUnique({ where: { id }, select: { question: { select: { questionnaire: { select } } } } }))?.question?.questionnaire?.phase?.projectId ?? null;
    if (resource === 'response') return (await this.prisma.response.findUnique({ where: { id }, select: { interview: { select } } }))?.interview?.phase?.projectId ?? null;
    if (resource === 'criterionAssessment') return (await this.prisma.criterionAssessment.findUnique({ where: { id }, select: { criterion: { select } } }))?.criterion?.phase?.projectId ?? null;
    if (resource === 'phaseValidation') return (await this.prisma.phaseValidation.findUnique({ where: { id }, select: { phase: { select: { projectId: true } } } }))?.phase.projectId ?? null;
    if (resource === 'decision') return (await this.prisma.projectDecision.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    if (resource === 'risk') return (await this.prisma.risk.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    if (resource === 'projectMember') return (await this.prisma.projectMember.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    return null;
  }
}