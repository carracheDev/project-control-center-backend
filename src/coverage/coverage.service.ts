import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCoverageRequirementDto } from './dto/create-coverage-requirement.dto.js';
import { UpdateCoverageRequirementDto } from './dto/update-coverage-requirement.dto.js';

export interface CoverageResult {
  requirementId: string;
  name: string;
  objectiveId: string | null;
  minimumInterviews: number;
  coveredInterviews: number;
  percentage: number;
  satisfied: boolean;
}

export interface PhaseCoverageResult {
  phaseId: string;
  totalInterviews: number;
  completedInterviews: number;
  requirements: CoverageResult[];
  allRequiredSatisfied: boolean;
}

@Injectable()
export class CoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async create(phaseId: string, dto: CreateCoverageRequirementDto) {
    await this.ensurePhaseExists(phaseId);
    await this.ensureObjectiveMatchesPhase(dto.objectiveId, phaseId);
    return this.prisma.coverageRequirement.create({
      data: {
        phaseId,
        objectiveId: dto.objectiveId,
        name: dto.name,
        description: dto.description,
        minimumInterviews: dto.minimumInterviews,
        required: dto.required,
      },
    });
  }

  async findAll(phaseId: string) {
    await this.ensurePhaseExists(phaseId);
    return this.prisma.coverageRequirement.findMany({
      where: { phaseId },
      orderBy: { createdAt: 'asc' },
      include: { objective: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string) {
    const requirement = await this.prisma.coverageRequirement.findUnique({
      where: { id },
      include: { objective: { select: { id: true, name: true } } },
    });
    if (!requirement) throw new NotFoundException(`Coverage requirement ${id} not found`);
    return requirement;
  }

  async update(id: string, dto: UpdateCoverageRequirementDto) {
    const current = await this.getRequirement(id);
    await this.ensureObjectiveMatchesPhase(dto.objectiveId, current.phaseId);
    return this.prisma.coverageRequirement.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.getRequirement(id);
    return this.prisma.coverageRequirement.delete({ where: { id } });
  }

  async calculate(phaseId: string): Promise<PhaseCoverageResult> {
    await this.ensurePhaseExists(phaseId);
    const [requirements, interviews] = await Promise.all([
      this.prisma.coverageRequirement.findMany({ where: { phaseId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.interview.findMany({
        where: { phaseId },
        select: {
          id: true,
          status: true,
          responses: { select: { question: { select: { objectiveId: true } } } },
        },
      }),
    ]);

    const completedInterviews = interviews.filter((interview) => interview.status === 'COMPLETED');
    const results = requirements.map((requirement): CoverageResult => {
      const coveredInterviews = requirement.objectiveId === null
        ? completedInterviews.length
        : completedInterviews.filter((interview) => interview.responses.some((response) => response.question.objectiveId === requirement.objectiveId)).length;
      const percentage = Math.min(100, Math.round((coveredInterviews / requirement.minimumInterviews) * 100));
      return {
        requirementId: requirement.id,
        name: requirement.name,
        objectiveId: requirement.objectiveId,
        minimumInterviews: requirement.minimumInterviews,
        coveredInterviews,
        percentage,
        satisfied: coveredInterviews >= requirement.minimumInterviews,
      };
    });

    return {
      phaseId,
      totalInterviews: interviews.length,
      completedInterviews: completedInterviews.length,
      requirements: results,
      allRequiredSatisfied: results.filter((result) => requirements.find((requirement) => requirement.id === result.requirementId)?.required).every((result) => result.satisfied),
    };
  }

  private async getRequirement(id: string) {
    const requirement = await this.prisma.coverageRequirement.findUnique({ where: { id } });
    if (!requirement) throw new NotFoundException(`Coverage requirement ${id} not found`);
    return requirement;
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }

  private async ensureObjectiveMatchesPhase(objectiveId: string | null | undefined, phaseId: string): Promise<void> {
    if (!objectiveId) return;
    const objective = await this.prisma.objective.findUnique({ where: { id: objectiveId } });
    if (!objective) throw new NotFoundException(`Objective ${objectiveId} not found`);
    if (objective.phaseId !== phaseId) throw new UnprocessableEntityException('Objective must belong to the same phase as the coverage requirement');
  }
}