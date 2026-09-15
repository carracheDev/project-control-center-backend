import { Module } from '@nestjs/common';
import { CriteriaModule } from './criteria/criteria.module.js';
import { CriterionAssessmentModule } from './criterion-assessments/criterion-assessment.module.js';
import { DecisionModule } from './decision/decision.module.js';
import { CoverageModule } from './coverage/coverage.module.js';
import { EvidenceModule } from './evidence/evidence.module.js';
import { GatingModule } from './gating/gating.module.js';
import { InterviewsModule } from './interviews/interviews.module.js';
import { ObjectivesModule } from './objectives/objectives.module.js';
import { PhaseValidationModule } from './phase-validation/phase-validation.module.js';
import { ProjectDashboardModule } from './project-dashboard/project-dashboard.module.js';
import { PhasesModule } from './phases/phases.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProjectAccessModule } from './project-access/project-access.module.js';
import { ProjectMembersModule } from './project-members/project-members.module.js';
import { RisksModule } from './risks/risks.module.js';
import { QuestionsModule } from './questions/questions.module.js';
import { QuestionnairesModule } from './questionnaires/questionnaires.module.js';
import { ReadinessModule } from './readiness/readiness.module.js';
import { ResponsesModule } from './responses/responses.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { AuditModule } from './audit/audit.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ProjectTimelineModule } from './project-timeline/project-timeline.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProjectAccessModule,
    ProjectMembersModule,
    RisksModule,
    ProjectsModule,
    PhasesModule,
    ObjectivesModule,
    PhaseValidationModule,
    ProjectDashboardModule,
    CriteriaModule,
    CriterionAssessmentModule,
    DecisionModule,
    TasksModule,
    AuditModule,
    NotificationsModule,
    ProjectTimelineModule,
    QuestionnairesModule,
    QuestionsModule,
    InterviewsModule,
    ResponsesModule,
    EvidenceModule,
    CoverageModule,
    ReadinessModule,
    GatingModule,
  ],
})
export class AppModule {}
