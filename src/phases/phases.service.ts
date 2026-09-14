import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PhaseStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePhaseDto } from './dto/create-phase.dto.js';
import { UpdatePhaseDto } from './dto/update-phase.dto.js';

export interface PhaseWorkflowState {
  phaseId: string;
  status: PhaseStatus;
  previousPhase: { id: string; name: string; status: PhaseStatus } | null;
  accessible: boolean;
  locked: boolean;
  reason: string | null;
}

@Injectable()
export class PhasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreatePhaseDto) {
    await this.ensureProjectExists(projectId);
    const previousPhase = await this.findPreviousPhase(projectId, dto.order);
    const status = previousPhase && previousPhase.status !== PhaseStatus.VALIDATED
      ? PhaseStatus.LOCKED
      : PhaseStatus.PLANNED;

    try {
      return await this.prisma.phase.create({
        data: {
          projectId,
          name: dto.name,
          description: dto.description,
          order: dto.order,
          status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        },
      });
    } catch (error) {
      this.throwForConstraintError(error);
    }
  }

  findAll(projectId: string) {
    return this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    const phase = await this.prisma.phase.findUnique({ where: { id } });
    if (!phase) {
      throw new NotFoundException(`Phase ${id} not found`);
    }
    return phase;
  }

  async getPhaseWorkflowState(id: string): Promise<PhaseWorkflowState> {
    const phase = await this.prisma.phase.findUnique({
      where: { id },
      select: { id: true, projectId: true, order: true, status: true },
    });
    if (!phase) throw new NotFoundException(`Phase ${id} not found`);

    const previousPhase = await this.findPreviousPhase(phase.projectId, phase.order);
    const locked = previousPhase !== null && previousPhase.status !== PhaseStatus.VALIDATED;
    return {
      phaseId: phase.id,
      status: phase.status,
      previousPhase: previousPhase
        ? { id: previousPhase.id, name: previousPhase.name, status: previousPhase.status }
        : null,
      accessible: !locked,
      locked,
      reason: locked ? 'La phase précédente doit être validée.' : null,
    };
  }

  async update(id: string, dto: UpdatePhaseDto) {
    await this.findOne(id);

    try {
      return await this.prisma.phase.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          order: dto.order,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        },
      });
    } catch (error) {
      this.throwForConstraintError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.phase.delete({ where: { id } });
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }

  private findPreviousPhase(projectId: string, order: number) {
    return this.prisma.phase.findFirst({
      where: { projectId, order: { lt: order } },
      orderBy: { order: 'desc' },
      select: { id: true, name: true, order: true, status: true },
    });
  }

  private throwForConstraintError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Phase order must be unique within a project');
    }
    throw new BadRequestException('Unable to persist phase');
  }
}