import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CriterionAssessmentController } from './criterion-assessment.controller.js';
import { CriterionAssessmentService } from './criterion-assessment.service.js';
import { TasksModule } from '../tasks/tasks.module.js';

@Module({
  imports: [PrismaModule, TasksModule],
  controllers: [CriterionAssessmentController],
  providers: [CriterionAssessmentService],
})
export class CriterionAssessmentModule {}