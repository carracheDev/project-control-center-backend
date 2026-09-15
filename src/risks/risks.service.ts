import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRiskDto } from './dto/create-risk.dto.js';
import { UpdateRiskDto } from './dto/update-risk.dto.js';

@Injectable()
export class RisksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string) {
    await this.ensureProject(projectId);
    return this.prisma.risk.findMany({
      where: { projectId },
      orderBy: [{ status: 'asc' }, { impact: 'desc' }, { probability: 'desc' }],
      include: { owner: { select: { id: true, email: true } }, phase: { select: { id: true, name: true } } },
    });
  }

  async create(projectId: string, dto: CreateRiskDto) {
    await this.ensureProject(projectId);
    await this.ensureRelations(projectId, dto.phaseId, dto.ownerId);
    const risk = await this.prisma.risk.create({
      data: {
        projectId,
        phaseId: dto.phaseId,
        ownerId: dto.ownerId,
        title: dto.title,
        description: dto.description,
        probability: dto.probability,
        impact: dto.impact,
        status: dto.status,
        mitigation: dto.mitigation,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
      include: { owner: { select: { id: true, email: true } }, phase: { select: { id: true, name: true } } },
    });
    const correctiveTask = await this.ensureCorrectiveTask(risk);
    return { ...risk, automation: correctiveTask ? { correctiveTaskCreated: true, taskId: correctiveTask.id } : { correctiveTaskCreated: false } };
  }

  async update(id: string, dto: UpdateRiskDto) {
    const risk = await this.findOne(id);
    await this.ensureRelations(risk.projectId, dto.phaseId, dto.ownerId);
    const updatedRisk = await this.prisma.risk.update({
      where: { id },
      data: {
        phaseId: dto.phaseId,
        ownerId: dto.ownerId,
        title: dto.title,
        description: dto.description,
        probability: dto.probability,
        impact: dto.impact,
        status: dto.status,
        mitigation: dto.mitigation,
        deadline: dto.deadline === undefined ? undefined : dto.deadline ? new Date(dto.deadline) : null,
      },
      include: { owner: { select: { id: true, email: true } }, phase: { select: { id: true, name: true } } },
    });
    const correctiveTask = await this.ensureCorrectiveTask(updatedRisk);
    return { ...updatedRisk, automation: correctiveTask ? { correctiveTaskCreated: true, taskId: correctiveTask.id } : { correctiveTaskCreated: false } };
  }

  async findOne(id: string) {
    const risk = await this.prisma.risk.findUnique({ where: { id }, include: { owner: { select: { id: true, email: true } }, phase: { select: { id: true, name: true } } } });
    if (!risk) throw new NotFoundException(`Risk ${id} not found`);
    return risk;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.risk.delete({ where: { id } });
  }

  private async ensureProject(id: string) {
    if (!await this.prisma.project.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException(`Project ${id} not found`);
  }

  private async ensureRelations(projectId: string, phaseId?: string | null, ownerId?: string | null) {
    if (phaseId) {
      const phase = await this.prisma.phase.findUnique({ where: { id: phaseId }, select: { projectId: true } });
      if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
      if (phase.projectId !== projectId) throw new UnprocessableEntityException('Risk phase must belong to the same project');
    }
    if (ownerId) {
      const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId: ownerId }, select: { id: true } });
      if (!member) throw new UnprocessableEntityException('Risk owner must belong to the same project');
    }
  }

  private async ensureCorrectiveTask(risk: { id: string; title: string; description: string | null; phaseId: string | null; ownerId: string | null; status: string; probability: number; impact: number }) {
    if (risk.status !== 'OPEN' || !risk.phaseId || risk.probability * risk.impact < 15) return null;
    const title = `[Risque critique] ${risk.title}`;
    const existingTask = await this.prisma.task.findFirst({ where: { phaseId: risk.phaseId, title }, select: { id: true } });
    if (existingTask) return null;
    return this.prisma.task.create({
      data: {
        phaseId: risk.phaseId,
        assigneeId: risk.ownerId,
        title,
        description: risk.description || `Analyser et réduire le risque critique « ${risk.title} ».`,
        priority: 'HIGH',
        status: 'TODO',
      },
      select: { id: true },
    });
  }
}
