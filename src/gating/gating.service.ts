import { Injectable, NotFoundException } from '@nestjs/common';
import { CriterionAssessmentStatus, TaskStatus } from '@prisma/client';
import { CoverageService } from '../coverage/coverage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface GatingCondition {
  code: string;
  label: string;
  required: boolean;
  satisfied: boolean;
  reason?: string;
}

export interface GatingResult {
  phaseId: string;
  canValidate: boolean;
  blockers: string[];
  satisfiedConditions: string[];
  conditions: GatingCondition[];
  evaluatedAt: string;
}

@Injectable()
export class GatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverageService: CoverageService,
  ) {}

  async calculate(phaseId: string): Promise<GatingResult> {
    await this.ensurePhaseExists(phaseId);

    const [coverage, criteria, tasks, coverageRequirements] = await Promise.all([
      this.coverageService.calculate(phaseId),
      this.prisma.criterion.findMany({
        where: { phaseId, required: true },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, assessment: { select: { status: true } } },
      }),
      this.prisma.task.findMany({
        where: { phaseId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, status: true },
      }),
      this.prisma.coverageRequirement.findMany({
        where: { phaseId, required: true },
        select: { id: true },
      }),
    ]);

    const requiredCoverageIds = new Set(coverageRequirements.map((requirement) => requirement.id));
    const conditions: GatingCondition[] = [];

    for (const requirement of coverage.requirements) {
      if (!requiredCoverageIds.has(requirement.requirementId)) continue;
      conditions.push({
        code: `COVERAGE_REQUIRED_${requirement.requirementId}`,
        label: `Coverage ${requirement.name}`,
        required: true,
        satisfied: requirement.satisfied,
        reason: requirement.satisfied
          ? `${requirement.coveredInterviews} interviews couvertes sur ${requirement.minimumInterviews} requises.`
          : `${requirement.coveredInterviews} interviews complétées sur ${requirement.minimumInterviews} requises.`,
      });
    }

    for (const criterion of criteria) {
      const satisfied = criterion.assessment?.status === CriterionAssessmentStatus.SATISFIED;
      const reason = criterion.assessment?.status === CriterionAssessmentStatus.NOT_SATISFIED
        ? 'Critère évalué comme non satisfait.'
        : satisfied
          ? 'Critère évalué comme satisfait.'
          : 'Critère obligatoire non évalué.';
      conditions.push({
        code: `CRITERION_REQUIRED_${criterion.id}`,
        label: criterion.name,
        required: true,
        satisfied,
        reason,
      });
    }

    for (const task of tasks) {
      if (task.status === TaskStatus.BLOCKED) {
        conditions.push({
          code: `TASK_BLOCKED_${task.id}`,
          label: `Tâche bloquée : ${task.title}`,
          required: true,
          satisfied: false,
          reason: 'La tâche est actuellement bloquée.',
        });
      } else if (task.status === TaskStatus.DONE) {
        conditions.push({
          code: `TASK_DONE_${task.id}`,
          label: `Tâche terminée : ${task.title}`,
          required: false,
          satisfied: true,
          reason: 'La tâche est terminée ; son statut est informatif pour le gating.',
        });
      }
    }

    const unsatisfiedRequired = conditions.filter((condition) => condition.required && !condition.satisfied);
    return {
      phaseId,
      canValidate: unsatisfiedRequired.length === 0,
      blockers: unsatisfiedRequired.map((condition) => condition.label),
      satisfiedConditions: conditions.filter((condition) => condition.satisfied).map((condition) => condition.label),
      conditions,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId }, select: { id: true } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }
}