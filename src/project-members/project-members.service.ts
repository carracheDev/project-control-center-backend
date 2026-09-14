import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectMemberDto } from './dto/create-project-member.dto.js';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto.js';

@Injectable()
export class ProjectMembersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, projectId: true, userId: true, role: true, createdAt: true, updatedAt: true, user: { select: { email: true, globalRole: true, isActive: true } } },
    });
  }

  async create(projectId: string, dto: CreateProjectMemberDto) {
    await this.ensureProject(projectId);
    await this.ensureUser(dto.userId);
    return this.prisma.projectMember.create({ data: { projectId, userId: dto.userId, role: dto.role }, include: { user: { select: { id: true, email: true, globalRole: true, isActive: true } } } });
  }

  async update(id: string, dto: UpdateProjectMemberDto) {
    await this.ensureMember(id);
    return this.prisma.projectMember.update({ where: { id }, data: { role: dto.role }, include: { user: { select: { id: true, email: true, globalRole: true, isActive: true } } } });
  }

  async remove(id: string) {
    await this.ensureMember(id);
    return this.prisma.projectMember.delete({ where: { id } });
  }

  private async ensureProject(id: string) {
    if (!await this.prisma.project.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException(`Project ${id} not found`);
  }

  private async ensureUser(id: string) {
    if (!await this.prisma.user.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException(`User ${id} not found`);
  }

  private async ensureMember(id: string) {
    if (!await this.prisma.projectMember.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException(`Project member ${id} not found`);
  }
}