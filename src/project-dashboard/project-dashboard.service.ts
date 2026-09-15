import { Injectable } from '@nestjs/common';
import { CriterionAssessmentStatus, EvidenceStatus, InterviewStatus, PhaseStatus, RiskStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { ProjectAccessService } from '../project-access/project-access.service.js';

export interface DashboardAttentionItem {
  type: 'PHASE' | 'GATING' | 'TASK' | 'CRITERION' | 'COVERAGE' | 'EVIDENCE';
  severity: 'HIGH' | 'WARNING';
  phaseId: string;
  target: { type: 'PHASE' | 'TASK' | 'CRITERION' | 'COVERAGE' | 'EVIDENCE'; id: string };
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
  risks: { total: number; open: number; critical: number };
  health: { score: number; status: 'HEALTHY' | 'AT_RISK' | 'CRITICAL'; label: string };
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
    health: { healthy: number; atRisk: number; critical: number };
    openRisks: number;
    criticalRisks: number;
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
            tasks: { select: { id: true, title: true, status: true } },
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
            evidences: { select: { id: true, title: true, status: true } },
            coverageRequirements: {
              select: { id: true, name: true, objectiveId: true, minimumInterviews: true, required: true },
            },
            validations: { select: { id: true, validatedAt: true, validatedBy: true, note: true } },
          },
        },
        risks: { select: { status: true, probability: true, impact: true } },
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
    const health = {
      healthy: cards.filter((card) => card.health.status === 'HEALTHY').length,
      atRisk: cards.filter((card) => card.health.status === 'AT_RISK').length,
      critical: cards.filter((card) => card.health.status === 'CRITICAL').length,
    };
    const openRisks = cards.reduce((total, card) => total + card.risks.open, 0);
    const criticalRisks = cards.reduce((total, card) => total + card.risks.critical, 0);

    return {
      summary: {
        totalProjects: cards.length,
        activeProjects: cards.filter((card) => card.progress.totalPhases > 0 && card.progress.completedPhases < card.progress.totalPhases).length,
        completedProjects,
        blockedProjects,
        projectsNeedingAttention: cards.filter((card) => card.attention.items.length > 0).length,
        health,
        openRisks,
        criticalRisks,
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
    const risks = project.risks;
    const health = this.calculateHealth(attention, risks);
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
      risks: {
        total: risks.length,
        open: risks.filter((risk) => risk.status === RiskStatus.OPEN).length,
        critical: risks.filter((risk) => risk.status === RiskStatus.OPEN && risk.probability * risk.impact >= 15).length,
      },
      health,
      attention: { hasBlockers: attention.some((item) => item.severity === 'HIGH'), items: attention },
    };
  }

  private calculateHealth(attention: DashboardAttentionItem[], risks: RiskDashboardData[]): ProjectDashboardCard['health'] {
    const highCount = attention.filter((item) => item.severity === 'HIGH').length;
    const warningCount = attention.filter((item) => item.severity === 'WARNING').length;
    const criticalRiskCount = risks.filter((risk) => risk.status === RiskStatus.OPEN && risk.probability * risk.impact >= 15).length;
    const openRiskCount = risks.filter((risk) => risk.status === RiskStatus.OPEN).length;
    const score = Math.max(0, 100 - highCount * 15 - warningCount * 5 - criticalRiskCount * 20 - Math.max(0, openRiskCount - criticalRiskCount) * 8);
    if (score < 50) return { score, status: 'CRITICAL', label: 'Critique' };
    if (score < 80) return { score, status: 'AT_RISK', label: 'À surveiller' };
    return { score, status: 'HEALTHY', label: 'Maîtrisé' };
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
      items.push({ type: 'PHASE', severity: 'HIGH', phaseId: phase.id, target: { type: 'PHASE', id: phase.id }, message: `La phase '${phase.name}' est verrouillée car la phase précédente n'est pas validée.` });
    }
    for (const task of phase.tasks.filter((item) => item.status === TaskStatus.BLOCKED)) {
      items.push({ type: 'TASK', severity: 'HIGH', phaseId: phase.id, target: { type: 'TASK', id: task.id }, message: `La tâche '${task.title}' est bloquée.` });
    }
    for (const criterion of phase.criteria.filter((item) => item.assessment?.status !== CriterionAssessmentStatus.SATISFIED)) {
      items.push({ type: 'CRITERION', severity: 'HIGH', phaseId: phase.id, target: { type: 'CRITERION', id: criterion.id }, message: `Le critère requis '${criterion.name}' n'est pas satisfait.` });
    }
    for (const requirement of phase.coverageRequirements.filter((item) => item.required)) {
      const covered = requirement.objectiveId === null
        ? phase.interviews.filter((interview) => interview.status === InterviewStatus.COMPLETED).length
        : phase.interviews.filter((interview) => interview.status === InterviewStatus.COMPLETED && interview.responses.some((response) => response.question.objectiveId === requirement.objectiveId)).length;
      if (covered < requirement.minimumInterviews) {
        items.push({ type: 'COVERAGE', severity: 'HIGH', phaseId: phase.id, target: { type: 'COVERAGE', id: requirement.id }, message: `La couverture '${requirement.name}' est insuffisante : ${covered}/${requirement.minimumInterviews} interviews.` });
      }
    }
    for (const evidence of phase.evidences.filter((item) => item.status === EvidenceStatus.REJECTED)) {
      items.push({ type: 'EVIDENCE', severity: 'WARNING', phaseId: phase.id, target: { type: 'EVIDENCE', id: evidence.id }, message: `La preuve '${evidence.title}' a été rejetée.` });
    }
    return items;
  }
}

type ProjectWithDashboardData = {
  id: string;
  name: string;
  description: string | null;
  phases: PhaseWithDashboardData[];
  risks: RiskDashboardData[];
};

type RiskDashboardData = { status: RiskStatus; probability: number; impact: number };

type PhaseWithDashboardData = {
  id: string;
  name: string;
  order: number;
  status: PhaseStatus;
  tasks: { id: string; title: string; status: TaskStatus }[];
  criteria: { id: string; name: string; assessment: { status: CriterionAssessmentStatus } | null }[];
  interviews: { status: InterviewStatus; responses: { question: { objectiveId: string | null } }[] }[];
  evidences: { id: string; title: string; status: EvidenceStatus }[];
  coverageRequirements: { id: string; name: string; objectiveId: string | null; minimumInterviews: number; required: boolean }[];
  validations: { id: string; validatedAt: Date; validatedBy: string | null; note: string | null }[];
};