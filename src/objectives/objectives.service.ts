import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateObjectiveDto } from './dto/create-objective.dto.js';
import { UpdateObjectiveDto } from './dto/update-objective.dto.js';

@Injectable()
export class ObjectivesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(phaseId: string, dto: CreateObjectiveDto) {
    await this.ensurePhaseExists(phaseId);
    try {
      return await this.prisma.objective.create({
        data: { phaseId, name: dto.name, description: dto.description, order: dto.order },
      });
    } catch (error) {
      this.handleConstraintError(error);
    }
  }

  async findAll(phaseId: string) {
    await this.ensurePhaseExists(phaseId);
    return this.prisma.objective.findMany({ where: { phaseId }, orderBy: { order: 'asc' } });
  }

  async findOne(id: string) {
    const objective = await this.prisma.objective.findUnique({ where: { id } });
    if (!objective) throw new NotFoundException(`Objective ${id} not found`);
    return objective;
  }

  async update(id: string, dto: UpdateObjectiveDto) {
    await this.findOne(id);
    try {
      return await this.prisma.objective.update({
        where: { id },
        data: { name: dto.name, description: dto.description, order: dto.order },
      });
    } catch (error) {
      this.handleConstraintError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.objective.delete({ where: { id } });
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }

  private handleConstraintError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Objective order must be unique within a phase');
    }
    throw error;
  }
}