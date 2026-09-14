import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CriterionAssessmentController } from './criterion-assessment.controller.js';
import { CriterionAssessmentService } from './criterion-assessment.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CriterionAssessmentController],
  providers: [CriterionAssessmentService],
})
export class CriterionAssessmentModule {}