import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(phaseId: string, dto: CreateTaskDto) {
    await this.ensurePhaseExists(phaseId);
    await this.ensureRelationsMatchPhase(phaseId, dto.objectiveId, dto.criterionId);
    await this.ensureAssigneeBelongsToProject(phaseId, dto.assigneeId);
    return this.prisma.task.create({
      data: {
        phaseId,
        objectiveId: dto.objectiveId,
        criterionId: dto.criterionId,
        assigneeId: dto.assigneeId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
      include: { assignee: { select: { id: true, email: true } } },
    });
  }

  async findAll(phaseId: string) {
    await this.ensurePhaseExists(phaseId);
    return this.prisma.task.findMany({
      where: { phaseId },
      orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
      include: { assignee: { select: { id: true, email: true } } },
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    const task = await this.findOne(id);
    await this.ensureRelationsMatchPhase(task.phaseId, dto.objectiveId, dto.criterionId);
    await this.ensureAssigneeBelongsToProject(task.phaseId, dto.assigneeId);
    return this.prisma.task.update({
      where: { id },
      data: {
        objectiveId: dto.objectiveId,
        criterionId: dto.criterionId,
        assigneeId: dto.assigneeId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        deadline: dto.deadline === undefined ? undefined : dto.deadline ? new Date(dto.deadline) : null,
      },
      include: { assignee: { select: { id: true, email: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.task.delete({ where: { id } });
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }

  private async ensureRelationsMatchPhase(
    phaseId: string,
    objectiveId: string | null | undefined,
    criterionId: string | null | undefined,
  ): Promise<void> {
    if (objectiveId) {
      const objective = await this.prisma.objective.findUnique({ where: { id: objectiveId } });
      if (!objective) throw new NotFoundException(`Objective ${objectiveId} not found`);
      if (objective.phaseId !== phaseId) {
        throw new UnprocessableEntityException('Objective must belong to the same phase');
      }
    }

    if (criterionId) {
      const criterion = await this.prisma.criterion.findUnique({ where: { id: criterionId } });
      if (!criterion) throw new NotFoundException(`Criterion ${criterionId} not found`);
      if (criterion.phaseId !== phaseId) {
        throw new UnprocessableEntityException('Criterion must belong to the same phase');
      }
    }
  }

  private async ensureAssigneeBelongsToProject(phaseId: string, assigneeId: string | null | undefined): Promise<void> {
    if (!assigneeId) return;
    const membership = await this.prisma.projectMember.findFirst({
      where: { userId: assigneeId, project: { phases: { some: { id: phaseId } } } },
      select: { id: true },
    });
    if (!membership) throw new UnprocessableEntityException('Task assignee must belong to the same project');
  }
}