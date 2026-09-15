import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CriterionAssessmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCriterionAssessmentDto } from './dto/create-criterion-assessment.dto.js';
import { UpdateCriterionAssessmentDto } from './dto/update-criterion-assessment.dto.js';
import { CorrectiveTaskService } from '../tasks/corrective-task.service.js';

@Injectable()
export class CriterionAssessmentService {
  constructor(private readonly prisma: PrismaService, private readonly correctiveTasks: CorrectiveTaskService) {}

  async create(criterionId: string, dto: CreateCriterionAssessmentDto) {
    const criterion = await this.getCriterion(criterionId);
    await this.ensureEvidenceMatchesPhase(dto.evidenceId, criterion.phaseId);
    const status = dto.status ?? CriterionAssessmentStatus.PENDING;

    try {
      const assessment = await this.prisma.criterionAssessment.create({
        data: {
          criterionId,
          status,
          note: dto.note,
          evidenceId: dto.evidenceId,
          assessedAt: status === CriterionAssessmentStatus.PENDING ? null : new Date(),
          assessedBy: dto.assessedBy,
        },
        include: { evidence: true },
      });
      return this.withAutomation(assessment, criterion, status);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Criterion ${criterionId} already has an assessment`);
      }
      throw error;
    }
  }

  async findOne(criterionId: string) {
    await this.getCriterion(criterionId);
    return this.prisma.criterionAssessment.findUnique({ where: { criterionId }, include: { evidence: true } });
  }

  async update(id: string, dto: UpdateCriterionAssessmentDto) {
    const current = await this.getAssessment(id);
    const criterion = await this.getCriterion(current.criterionId);
    await this.ensureEvidenceMatchesPhase(dto.evidenceId, criterion.phaseId);
    const status = dto.status ?? current.status;
    const statusChanged = dto.status !== undefined && dto.status !== current.status;

    const assessment = await this.prisma.criterionAssessment.update({
      where: { id },
      data: {
        status: dto.status,
        note: dto.note,
        evidenceId: dto.evidenceId,
        assessedAt: status === CriterionAssessmentStatus.PENDING ? null : statusChanged ? new Date() : current.assessedAt,
        assessedBy: dto.assessedBy,
      },
      include: { evidence: true },
    });
    return this.withAutomation(assessment, criterion, status);
  }

  private async withAutomation<T extends { status: CriterionAssessmentStatus }>(assessment: T, criterion: { id: string; phaseId: string }, status: CriterionAssessmentStatus) {
    if (status !== CriterionAssessmentStatus.NOT_SATISFIED) return { ...assessment, automation: { correctiveTaskCreated: false } };
    const criterionDetails = await this.prisma.criterion.findUnique({ where: { id: criterion.id }, select: { name: true } });
    const correctiveTask = await this.correctiveTasks.createForCriterion({ phaseId: criterion.phaseId, title: criterionDetails?.name ?? criterion.id });
    return { ...assessment, automation: correctiveTask ? { correctiveTaskCreated: true, taskId: correctiveTask.id } : { correctiveTaskCreated: false } };
  }

  async remove(id: string) {
    await this.getAssessment(id);
    return this.prisma.criterionAssessment.delete({ where: { id } });
  }

  private async getCriterion(id: string) {
    const criterion = await this.prisma.criterion.findUnique({ where: { id }, select: { id: true, phaseId: true } });
    if (!criterion) throw new NotFoundException(`Criterion ${id} not found`);
    return criterion;
  }

  private async getAssessment(id: string) {
    const assessment = await this.prisma.criterionAssessment.findUnique({ where: { id } });
    if (!assessment) throw new NotFoundException(`Criterion assessment ${id} not found`);
    return assessment;
  }

  private async ensureEvidenceMatchesPhase(evidenceId: string | null | undefined, phaseId: string): Promise<void> {
    if (!evidenceId) return;
    const evidence = await this.prisma.evidence.findUnique({ where: { id: evidenceId }, select: { id: true, phaseId: true } });
    if (!evidence) throw new NotFoundException(`Evidence ${evidenceId} not found`);
    if (evidence.phaseId !== phaseId) {
      throw new UnprocessableEntityException('Evidence must belong to the same phase as the criterion');
    }
  }
}