import { Injectable, NotFoundException } from '@nestjs/common';
import { CriterionAssessmentStatus, EvidenceStatus, TaskStatus } from '@prisma/client';
import { CoverageService } from '../coverage/coverage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ReadinessItem {
  type: string;
  message: string;
  relatedEntityId: string | null;
}

export interface PhaseReadinessResult {
  phaseId: string;
  ready: boolean;
  blockers: ReadinessItem[];
  satisfiedConditions: ReadinessItem[];
  nextActions: ReadinessItem[];
  evaluatedAt: string;
}

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverageService: CoverageService,
  ) {}

  async calculate(phaseId: string): Promise<PhaseReadinessResult> {
    await this.ensurePhaseExists(phaseId);

    const [coverage, criteria, tasks, evidences, coverageRequirements] = await Promise.all([
      this.coverageService.calculate(phaseId),
      this.prisma.criterion.findMany({
        where: { phaseId, required: true },
        orderBy: { order: 'asc' },
        include: { assessment: { select: { status: true } } },
      }),
      this.prisma.task.findMany({ where: { phaseId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.evidence.findMany({ where: { phaseId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.coverageRequirement.findMany({ where: { phaseId }, select: { id: true, required: true } }),
    ]);
    const requiredCoverageIds = new Set(coverageRequirements.filter((requirement) => requirement.required).map((requirement) => requirement.id));

    const blockers: ReadinessItem[] = [];
    const satisfiedConditions: ReadinessItem[] = [];
    const nextActions: ReadinessItem[] = [];

    for (const criterion of criteria) {
      if (criterion.assessment?.status === CriterionAssessmentStatus.SATISFIED) {
        satisfiedConditions.push({
          type: 'CRITERION',
          message: `Le critère obligatoire '${criterion.name}' est évalué comme satisfait.`,
          relatedEntityId: criterion.id,
        });
        continue;
      }
      blockers.push({
        type: 'CRITERION',
        message: criterion.assessment?.status === CriterionAssessmentStatus.NOT_SATISFIED
          ? `Le critère obligatoire '${criterion.name}' est évalué comme non satisfait.`
          : `Le critère obligatoire '${criterion.name}' nécessite une validation métier.`,
        relatedEntityId: criterion.id,
      });
      nextActions.push({
        type: 'CRITERION',
        message: `Documenter et valider le critère obligatoire '${criterion.name}'.`,
        relatedEntityId: criterion.id,
      });
    }

    for (const requirement of coverage.requirements) {
      if (!requiredCoverageIds.has(requirement.requirementId)) continue;

      if (requirement.satisfied) {
        satisfiedConditions.push({
          type: 'COVERAGE',
          message: `Coverage '${requirement.name}' : ${requirement.coveredInterviews}/${requirement.minimumInterviews} interviews couvertes.`,
          relatedEntityId: requirement.requirementId,
        });
      } else {
        const remaining = requirement.minimumInterviews - requirement.coveredInterviews;
        blockers.push({
          type: 'COVERAGE',
          message: `Coverage '${requirement.name}' : ${requirement.coveredInterviews}/${requirement.minimumInterviews} interviews couvertes, minimum ${requirement.minimumInterviews}.`,
          relatedEntityId: requirement.requirementId,
        });
        nextActions.push({
          type: 'INTERVIEW',
          message: requirement.objectiveId
            ? `Réaliser au moins ${remaining} interviews supplémentaires ciblant l'objectif de '${requirement.name}'.`
            : `Réaliser ${remaining} interviews supplémentaires.`,
          relatedEntityId: requirement.requirementId,
        });
      }
    }

    for (const task of tasks) {
      if (task.status === TaskStatus.BLOCKED) {
        blockers.push({ type: 'TASK', message: `La tâche '${task.title}' est bloquée.`, relatedEntityId: task.id });
      } else if (task.status === TaskStatus.DONE) {
        satisfiedConditions.push({ type: 'TASK', message: `La tâche '${task.title}' est terminée.`, relatedEntityId: task.id });
      } else {
        nextActions.push({
          type: 'TASK',
          message: task.status === TaskStatus.IN_PROGRESS
            ? `La tâche '${task.title}' est en cours.`
            : `La tâche '${task.title}' reste à réaliser.`,
          relatedEntityId: task.id,
        });
      }
    }

    for (const evidence of evidences) {
      if (evidence.status === EvidenceStatus.VERIFIED) {
        satisfiedConditions.push({ type: 'EVIDENCE', message: `La preuve '${evidence.title}' est vérifiée.`, relatedEntityId: evidence.id });
      } else if (evidence.status === EvidenceStatus.PENDING) {
        nextActions.push({ type: 'EVIDENCE', message: `La preuve '${evidence.title}' est en attente de vérification.`, relatedEntityId: evidence.id });
      } else {
        nextActions.push({ type: 'EVIDENCE', message: `La preuve '${evidence.title}' a été rejetée et doit être revue.`, relatedEntityId: evidence.id });
      }
    }

    return {
      phaseId,
      ready: blockers.length === 0,
      blockers,
      satisfiedConditions,
      nextActions,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private async ensurePhaseExists(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId }, select: { id: true } });
    if (!phase) throw new NotFoundException(`Phase ${phaseId} not found`);
  }
}