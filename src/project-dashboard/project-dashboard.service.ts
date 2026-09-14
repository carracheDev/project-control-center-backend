import { Injectable } from '@nestjs/common';
import { CriterionAssessmentStatus, EvidenceStatus, InterviewStatus, PhaseStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { ProjectAccessService } from '../project-access/project-access.service.js';

export interface DashboardAttentionItem {
  type: 'PHASE' | 'GATING' | 'TASK' | 'CRITERION' | 'COVERAGE' | 'EVIDENCE';
  severity: 'HIGH' | 'WARNING';
  phaseId: string;
  message: string;
}

export interface ProjectDashboardCard {
  id: string;
  name: string;
  description: string | null;
  phase: { id: string; name: string; order: number; status: PhaseStatus } | null;
  progress: { completedPhases: number; totalPhases: number; percentage: number };
  tasks: { total: number; done: number; blocked: number };
  criteria: { required: number; satisfied: number; pending: number; notSatisfied: number };
  coverage: { total: number; required: number; satisfied: number; unsatisfied: number };
  interviews: { total: number; completed: number };
  evidence: { total: number; verified: number; pending: number; rejected: number };
  attention: { hasBlockers: boolean; items: DashboardAttentionItem[] };
}

export interface DashboardValidation {
  id: string;
  projectId: string;
  projectName: string;
  phaseId: string;
  phaseName: string;
  validatedAt: Date;
  validatedBy: string | null;
  note: string | null;
}

export interface ProjectDashboardResult {
  summary: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    blockedProjects: number;
    projectsNeedingAttention: number;
  };
  projects: ProjectDashboardCard[];
  recentValidations: DashboardValidation[];
  attentionItems: (DashboardAttentionItem & { projectId: string; projectName: string })[];
  evaluatedAt: string;
}

@Injectable()
export class ProjectDashboardService {
  constructor(private readonly prisma: PrismaService, private readonly projectAccess?: ProjectAccessService) {}

  async getDashboard(userOrProjectId?: AuthenticatedUser | string, projectId?: string): Promise<ProjectDashboardResult> {
    const internalSnapshot = typeof userOrProjectId === 'string';
    const requestedProjectId = internalSnapshot ? userOrProjectId : projectId;
    const accessibleProjectIds = internalSnapshot || !userOrProjectId || !this.projectAccess ? null : await this.projectAccess.getAccessibleProjectIds(userOrProjectId);
    if (!internalSnapshot && userOrProjectId && this.projectAccess && requestedProjectId) await this.projectAccess.assertProjectAccess(userOrProjectId, requestedProjectId);
    const projects = await this.prisma.project.findMany({
      where: requestedProjectId ? { id: requestedProjectId } : accessibleProjectIds ? { id: { in: accessibleProjectIds } } : undefined,
      orderBy: { createdAt: 'asc' },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: {
            tasks: { select: { status: true } },
            criteria: {
              where: { required: true },
              select: { id: true, name: true, assessment: { select: { status: true } } },
            },
            interviews: {
              select: {
                status: true,
                responses: { select: { question: { select: { objectiveId: true } } } },
              },
            },
            evidences: { select: { title: true, status: true } },
            coverageRequirements: {
              select: { id: true, name: true, objectiveId: true, minimumInterviews: true, required: true },
            },
            validations: { select: { id: true, validatedAt: true, validatedBy: true, note: true } },
          },
        },
      },
    });

    const cards = projects.map((project) => this.toProjectCard(project));
    const recentValidations = projects
      .flatMap((project) => project.phases.flatMap((phase) => phase.validations.map((validation) => ({
        id: validation.id,
        projectId: project.id,
        projectName: project.name,
        phaseId: phase.id,
        phaseName: phase.name,
        validatedAt: validation.validatedAt,
        validatedBy: validation.validatedBy,
        note: validation.note,
      }))))
      .sort((left, right) => right.validatedAt.getTime() - left.validatedAt.getTime())
      .slice(0, 10);
    const attentionItems = cards.flatMap((card) => card.attention.items.map((item) => ({
      ...item,
      projectId: card.id,
      projectName: card.name,
    })));
    const completedProjects = cards.filter((card) => card.progress.totalPhases > 0 && card.progress.completedPhases === card.progress.totalPhases).length;
    const blockedProjects = cards.filter((card) => card.attention.hasBlockers).length;

    return {
      summary: {
        totalProjects: cards.length,
        activeProjects: cards.filter((card) => card.progress.totalPhases > 0 && card.progress.completedPhases < card.progress.totalPhases).length,
        completedProjects,
        blockedProjects,
        projectsNeedingAttention: cards.filter((card) => card.attention.items.length > 0).length,
      },
      projects: cards,
      recentValidations,
      attentionItems,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private toProjectCard(project: ProjectWithDashboardData): ProjectDashboardCard {
    const phases = [...project.phases].sort((left, right) => left.order - right.order);
    const completedPhases = phases.filter((phase) => phase.status === PhaseStatus.VALIDATED).length;
    const phase = this.findCurrentPhase(phases);
    const allTasks = phases.flatMap((item) => item.tasks);
    const allInterviews = phases.flatMap((item) => item.interviews);
    const allEvidence = phases.flatMap((item) => item.evidences);
    const allCriteria = phases.flatMap((item) => item.criteria);
    const allCoverageRequirements = phases.flatMap((item) => item.coverageRequirements);
    const attention = phases.flatMap((item) => this.getPhaseAttention(item));
    const requiredCoverageRequirements = allCoverageRequirements.filter((requirement) => requirement.required);
    const satisfiedCoverageRequirements = requiredCoverageRequirements.filter((requirement) => {
      const covered = requirement.objectiveId === null
        ? allInterviews.filter((interview) => interview.status === InterviewStatus.COMPLETED).length
        : allInterviews.filter((interview) => interview.status === InterviewStatus.COMPLETED && interview.responses.some((response) => response.question.objectiveId === requirement.objectiveId)).length;
      return covered >= requirement.minimumInterviews;
    }).length;

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      phase: phase ? { id: phase.id, name: phase.name, order: phase.order, status: phase.status } : null,
      progress: {
        completedPhases,
        totalPhases: phases.length,
        percentage: phases.length === 0 ? 0 : Math.round((completedPhases / phases.length) * 100),
      },
      tasks: {
        total: allTasks.length,
        done: allTasks.filter((task) => task.status === TaskStatus.DONE).length,
        blocked: allTasks.filter((task) => task.status === TaskStatus.BLOCKED).length,
      },
      criteria: {
        required: allCriteria.length,
        satisfied: allCriteria.filter((criterion) => criterion.assessment?.status === CriterionAssessmentStatus.SATISFIED).length,
        pending: allCriteria.filter((criterion) => criterion.assessment?.status === undefined || criterion.assessment?.status === 'PENDING').length,
        notSatisfied: allCriteria.filter((criterion) => criterion.assessment?.status === CriterionAssessmentStatus.NOT_SATISFIED).length,
      },
      coverage: {
        total: allCoverageRequirements.length,
        required: requiredCoverageRequirements.length,
        satisfied: satisfiedCoverageRequirements,
        unsatisfied: requiredCoverageRequirements.length - satisfiedCoverageRequirements,
      },
      interviews: {
        total: allInterviews.length,
        completed: allInterviews.filter((interview) => interview.status === InterviewStatus.COMPLETED).length,
      },
      evidence: {
        total: allEvidence.length,
        verified: allEvidence.filter((item) => item.status === EvidenceStatus.VERIFIED).length,
        pending: allEvidence.filter((item) => item.status === EvidenceStatus.PENDING).length,
        rejected: allEvidence.filter((item) => item.status === EvidenceStatus.REJECTED).length,
      },
      attention: { hasBlockers: attention.some((item) => item.severity === 'HIGH'), items: attention },
    };
  }

  private findCurrentPhase(phases: PhaseWithDashboardData[]) {
    return phases.find((phase) => phase.status === PhaseStatus.IN_PROGRESS)
      ?? phases.find((phase) => phase.status === PhaseStatus.PLANNED && this.isAccessible(phase, phases))
      ?? phases.find((phase) => phase.status === PhaseStatus.LOCKED)
      ?? phases.at(-1);
  }

  private isAccessible(phase: PhaseWithDashboardData, phases: PhaseWithDashboardData[]): boolean {
    const previous = phases.filter((candidate) => candidate.order < phase.order).at(-1);
    return !previous || previous.status === PhaseStatus.VALIDATED;
  }

  private getPhaseAttention(phase: PhaseWithDashboardData): DashboardAttentionItem[] {
    const items: DashboardAttentionItem[] = [];
    if (phase.status === PhaseStatus.LOCKED) {
      items.push({ type: 'PHASE', severity: 'HIGH', phaseId: phase.id, message: `La phase '${phase.name}' est verrouillée car la phase précédente n'est pas validée.` });
    }
    const blockedTasks = phase.tasks.filter((task) => task.status === TaskStatus.BLOCKED).length;
    if (blockedTasks > 0) {
      items.push({ type: 'TASK', severity: 'HIGH', phaseId: phase.id, message: `${blockedTasks} tâche${blockedTasks > 1 ? 's' : ''} est${blockedTasks > 1 ? 'ent' : ''} bloquée${blockedTasks > 1 ? 's' : ''}.` });
    }
    const unsatisfiedCriteria = phase.criteria.filter((criterion) => criterion.assessment?.status !== CriterionAssessmentStatus.SATISFIED).length;
    if (unsatisfiedCriteria > 0) {
      items.push({ type: 'CRITERION', severity: 'HIGH', phaseId: phase.id, message: `${unsatisfiedCriteria} critère${unsatisfiedCriteria > 1 ? 's' : ''} requis n'est${unsatisfiedCriteria > 1 ? ' pas' : ' pas'} satisfait.` });
    }
    for (const requirement of phase.coverageRequirements.filter((item) => item.required)) {
      const covered = requirement.objectiveId === null
        ? phase.interviews.filter((interview) => interview.status === InterviewStatus.COMPLETED).length
        : phase.interviews.filter((interview) => interview.status === InterviewStatus.COMPLETED && interview.responses.some((response) => response.question.objectiveId === requirement.objectiveId)).length;
      if (covered < requirement.minimumInterviews) {
        items.push({ type: 'COVERAGE', severity: 'HIGH', phaseId: phase.id, message: `La couverture '${requirement.name}' est insuffisante : ${covered}/${requirement.minimumInterviews} interviews.` });
      }
    }
    const rejectedEvidence = phase.evidences.filter((item) => item.status === EvidenceStatus.REJECTED).length;
    if (rejectedEvidence > 0) {
      items.push({ type: 'EVIDENCE', severity: 'WARNING', phaseId: phase.id, message: `${rejectedEvidence} evidence${rejectedEvidence > 1 ? 's' : ''} rejetée${rejectedEvidence > 1 ? 's' : ''}.` });
    }
    return items;
  }
}

type ProjectWithDashboardData = {
  id: string;
  name: string;
  description: string | null;
  phases: PhaseWithDashboardData[];
};

type PhaseWithDashboardData = {
  id: string;
  name: string;
  order: number;
  status: PhaseStatus;
  tasks: { status: TaskStatus }[];
  criteria: { id: string; name: string; assessment: { status: CriterionAssessmentStatus } | null }[];
  interviews: { status: InterviewStatus; responses: { question: { objectiveId: string | null } }[] }[];
  evidences: { title: string; status: EvidenceStatus }[];
  coverageRequirements: { id: string; name: string; objectiveId: string | null; minimumInterviews: number; required: boolean }[];
  validations: { id: string; validatedAt: Date; validatedBy: string | null; note: string | null }[];
};