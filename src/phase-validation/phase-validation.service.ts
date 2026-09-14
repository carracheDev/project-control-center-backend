import { ConflictException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { GatingResult, GatingService } from '../gating/gating.service.js';
import { PhasesService } from '../phases/phases.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePhaseValidationDto } from './dto/create-phase-validation.dto.js';
import { PhaseStatus, Prisma } from '@prisma/client';
import { NotificationService } from '../notifications/notification.service.js';

const VALIDATABLE_PHASE_STATUSES = new Set<PhaseStatus>([
  PhaseStatus.PLANNED,
  PhaseStatus.IN_PROGRESS,
  PhaseStatus.REOPENED,
]);

@Injectable()
export class PhaseValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gatingService: GatingService,
    private readonly phasesService: PhasesService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  async validate(phaseId: string, dto: CreatePhaseValidationDto) {
    const phase = await this.getPhase(phaseId);
    this.ensurePhaseCanBeValidated(phase.status);
    const workflow = await this.phasesService.getPhaseWorkflowState(phaseId);
    if (workflow.locked) {
      throw new UnprocessableEntityException(workflow.reason ?? 'Phase is locked');
    }

    const gating = await this.gatingService.calculate(phaseId);
    if (!gating.canValidate) {
      throw new UnprocessableEntityException({
        message: 'Phase cannot be validated',
        blockers: gating.blockers,
      });
    }

    const gatingSnapshot = this.toSnapshot(gating);
    const result = await this.prisma.$transaction(async (transaction) => {
      const currentPhase = await transaction.phase.findUnique({ where: { id: phaseId }, select: { projectId: true, order: true, status: true } });
      if (!currentPhase) throw new NotFoundException(`Phase ${phaseId} not found`);
      this.ensurePhaseCanBeValidated(currentPhase.status);

      const validation = await transaction.phaseValidation.create({
        data: {
          phaseId,
          validatedBy: dto.validatedBy,
          note: dto.note,
          gatingSnapshot,
        },
      });
      const updatedPhase = await transaction.phase.update({
        where: { id: phaseId },
        data: { status: PhaseStatus.VALIDATED },
      });

      const nextPhase = await transaction.phase.findFirst({
        where: { projectId: currentPhase.projectId, order: { gt: currentPhase.order } },
        orderBy: { order: 'asc' },
        select: { id: true, status: true },
      });
      if (nextPhase?.status === PhaseStatus.LOCKED) {
        await transaction.phase.update({ where: { id: nextPhase.id }, data: { status: PhaseStatus.PLANNED } });
      }

      return { phase: updatedPhase, validation };
    });
    void this.notifications?.notifyProject(result.phase.projectId, 'Phase validée', result.phase.name, { entityType: 'phaseValidation', entityId: result.validation.id }).catch(() => undefined);
    return result;
  }

  async findAll(phaseId: string) {
    await this.getPhase(phaseId);
    return this.prisma.phaseValidation.findMany({ where: { phaseId }, orderBy: { validatedAt: 'asc' } });
  }

  async findOne(id: string) {
    const validation = await this.prisma.phaseValidation.findUnique({ where: { id } });
    if (!validation) throw new NotFoundException(`Phase validation ${id} not found`);
    return validation;
  }

  private async getPhase(id: string) {
    const phase = await this.prisma.phase.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!phase) throw new NotFoundException(`Phase ${id} not found`);
    return phase;
  }

  private ensurePhaseCanBeValidated(status: PhaseStatus): void {
    if (status === PhaseStatus.VALIDATED) {
      throw new ConflictException('Phase is already validated');
    }
    if (!VALIDATABLE_PHASE_STATUSES.has(status)) {
      throw new UnprocessableEntityException(`Phase with status ${status} cannot be validated`);
    }
  }

  private toSnapshot(gating: GatingResult): Prisma.InputJsonValue {
    return {
      canValidate: gating.canValidate,
      blockers: gating.blockers,
      satisfiedConditions: gating.satisfiedConditions,
      conditions: gating.conditions,
      evaluatedAt: gating.evaluatedAt,
    } as unknown as Prisma.InputJsonValue;
  }
}