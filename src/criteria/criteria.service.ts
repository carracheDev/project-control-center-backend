import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCriterionDto } from './dto/create-criterion.dto.js';
import { UpdateCriterionDto } from './dto/update-criterion.dto.js';

@Injectable()
export class CriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(phaseId: string, dto: CreateCriterionDto) {
    await this.ensurePhaseExists(phaseId);
    await this.ensureObjectiveMatchesPhase(dto.objectiveId, phaseId);
    try {
      return await this.prisma.criterion.create({
        data: {
          phaseId,
          objectiveId: dto.objectiveId,
          name: dto.name,
          description: dto.description,
          required: dto.required,
          order: dto.order,
        },
      });
    } catch (error) {
      this.handleConstraintError(error);
    }
  }

  async findAll(phaseId: string) {
    await this.ensurePhaseExists(phaseId);
    return this.prisma.criterion.findMany({ where: { phaseId }, orderBy: { order: 'asc' }, include: { assessment: true } });
  }

  async findOne(id: string) {
    const criterion = await this.prisma.criterion.findUnique({ where: { id } });
    if (!criterion) throw new NotFoundException(`Criterion ${id} not found`);
    return criterion;
  }

  async update(id: string, dto: UpdateCriterionDto) {
    const criterion = await this.findOne(id);
    await this.ensureObjectiveMatchesPhase(dto.objectiveId, criterion.phaseId);
    try {
      return await this.prisma.criterion.update({
        where: { id },
        data: {
          objectiveId: dto.objectiveId,
          name: dto.name,
          description: dto.description,
          required: dto.required,
          order: dto.order,
        },
      });
    } catch (error) {
      this.handleConstraintError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.criterion.delete({ where: { id } });
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }

  private async ensureObjectiveMatchesPhase(objectiveId: string | null | undefined, phaseId: string): Promise<void> {
    if (!objectiveId) return;
    const objective = await this.prisma.objective.findUnique({ where: { id: objectiveId } });
    if (!objective) throw new NotFoundException(`Objective ${objectiveId} not found`);
    if (objective.phaseId !== phaseId) {
      throw new UnprocessableEntityException('Objective must belong to the same phase');
    }
  }

  private handleConstraintError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Criterion order must be unique within a phase');
    }
    throw error;
  }
}