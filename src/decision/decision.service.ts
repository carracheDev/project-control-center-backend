import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CriterionAssessmentStatus, EvidenceStatus, InterviewStatus, PhaseStatus, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectDashboardService } from '../project-dashboard/project-dashboard.service.js';
import { CreateProjectDecisionDto } from './dto/create-project-decision.dto.js';
import { NotificationService } from '../notifications/notification.service.js';

@Injectable()
export class DecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: ProjectDashboardService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  async create(projectId: string, dto: CreateProjectDecisionDto) {
    const project = await this.getProjectSnapshotData(projectId);
    const dashboard = await this.dashboardService.getDashboard(projectId);
    const projectCard = dashboard.projects[0];
    const rationale = dto.rationale.trim();
    const reportSnapshot = this.buildSnapshot(project, projectCard, dashboard.recentValidations);

    const decision = await this.prisma.projectDecision.create({
      data: {
        projectId,
        type: dto.type,
        rationale,
        nextSteps: this.trimOptional(dto.nextSteps),
        decidedBy: this.trimOptional(dto.decidedBy),
        reportSnapshot,
      },
    });
    void this.notifications?.notifyProject(projectId, `Décision ${decision.type}`, rationale, { entityType: 'projectDecision', entityId: decision.id }).catch(() => undefined);
    return decision;
  }

  async findAll(projectId: string) {
    await this.ensureProjectExists(projectId);
    return this.prisma.projectDecision.findMany({ where: { projectId }, orderBy: { decidedAt: 'desc' } });
  }

  async findOne(id: string) {
    const decision = await this.prisma.projectDecision.findUnique({ where: { id } });
    if (!decision) throw new NotFoundException(`Project decision ${id} not found`);
    return decision;
  }

  private async getProjectSnapshotData(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        phases: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            status: true,
            objectives: { select: { id: true } },
            criteria: { select: { id: true, required: true, assessment: { select: { status: true } } } },
            tasks: { select: { status: true } },
            interviews: { select: { status: true, responses: { select: { question: { select: { objectiveId: true } } } } } },
            evidences: { select: { status: true } },
            coverageRequirements: { select: { id: true, required: true, objectiveId: true, minimumInterviews: true } },
            validations: { select: { id: true } },
          },
        },
      },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    await this.getProjectSnapshotData(projectId);
  }

  private buildSnapshot(project: SnapshotProject, projectCard: SnapshotProjectCard | undefined, validations: SnapshotValidation[]) {
    const phases = project.phases;
    const criteria = phases.flatMap((phase) => phase.criteria);
    const tasks = phases.flatMap((phase) => phase.tasks);
    const interviews = phases.flatMap((phase) => phase.interviews);
    const evidences = phases.flatMap((phase) => phase.evidences);
    const coverageRequirements = phases.flatMap((phase) => phase.coverageRequirements);
    const requiredCoverageRequirements = coverageRequirements.filter((requirement) => requirement.required);
    const satisfiedCoverageRequirements = requiredCoverageRequirements.filter((requirement) => {
      const covered = requirement.objectiveId === null
        ? interviews.filter((interview) => interview.status === InterviewStatus.COMPLETED).length
        : interviews.filter((interview) => interview.status === InterviewStatus.COMPLETED && interview.responses.some((response) => response.question.objectiveId === requirement.objectiveId)).length;
      return covered >= requirement.minimumInterviews;
    }).length;

    return {
      projectId: project.id,
      projectName: project.name,
      phaseSummary: {
        total: phases.length,
        validated: phases.filter((phase) => phase.status === PhaseStatus.VALIDATED).length,
        inProgress: phases.filter((phase) => phase.status === PhaseStatus.IN_PROGRESS).length,
        planned: phases.filter((phase) => phase.status === PhaseStatus.PLANNED).length,
        locked: phases.filter((phase) => phase.status === PhaseStatus.LOCKED).length,
        reopened: phases.filter((phase) => phase.status === PhaseStatus.REOPENED).length,
      },
      progress: projectCard?.progress ?? { completedPhases: 0, totalPhases: phases.length, percentage: 0 },
      objectivesSummary: { total: phases.flatMap((phase) => phase.objectives).length },
      criteriaSummary: {
        total: criteria.length,
        required: criteria.filter((criterion) => criterion.required).length,
        satisfied: criteria.filter((criterion) => criterion.assessment?.status === CriterionAssessmentStatus.SATISFIED).length,
        pending: criteria.filter((criterion) => criterion.assessment?.status === CriterionAssessmentStatus.PENDING || !criterion.assessment).length,
        notSatisfied: criteria.filter((criterion) => criterion.assessment?.status === CriterionAssessmentStatus.NOT_SATISFIED).length,
      },
      taskSummary: {
        total: tasks.length,
        todo: tasks.filter((task) => task.status === TaskStatus.TODO).length,
        inProgress: tasks.filter((task) => task.status === TaskStatus.IN_PROGRESS).length,
        done: tasks.filter((task) => task.status === TaskStatus.DONE).length,
        blocked: tasks.filter((task) => task.status === TaskStatus.BLOCKED).length,
      },
      interviewSummary: {
        total: interviews.length,
        completed: interviews.filter((interview) => interview.status === InterviewStatus.COMPLETED).length,
      },
      coverageSummary: {
        total: coverageRequirements.length,
        required: requiredCoverageRequirements.length,
        satisfied: satisfiedCoverageRequirements,
        unsatisfied: requiredCoverageRequirements.length - satisfiedCoverageRequirements,
      },
      evidenceSummary: {
        total: evidences.length,
        verified: evidences.filter((evidence) => evidence.status === EvidenceStatus.VERIFIED).length,
        pending: evidences.filter((evidence) => evidence.status === EvidenceStatus.PENDING).length,
        rejected: evidences.filter((evidence) => evidence.status === EvidenceStatus.REJECTED).length,
      },
      validationSummary: {
        total: phases.reduce((total, phase) => total + phase.validations.length, 0),
        recent: validations.filter((validation) => validation.projectId === project.id),
      },
      reportGeneratedAt: new Date().toISOString(),
    } as unknown as Prisma.InputJsonValue;
  }

  private trimOptional(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }
}

type SnapshotProject = Awaited<ReturnType<DecisionService['getProjectSnapshotData']>>;
type SnapshotProjectCard = Awaited<ReturnType<ProjectDashboardService['getDashboard']>>['projects'][number];
type SnapshotValidation = Awaited<ReturnType<ProjectDashboardService['getDashboard']>>['recentValidations'][number];