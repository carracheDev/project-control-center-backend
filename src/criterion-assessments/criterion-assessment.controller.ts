import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateCriterionAssessmentDto } from './dto/create-criterion-assessment.dto.js';
import { UpdateCriterionAssessmentDto } from './dto/update-criterion-assessment.dto.js';
import { CriterionAssessmentService } from './criterion-assessment.service.js';

@Controller()
export class CriterionAssessmentController {
  constructor(private readonly service: CriterionAssessmentService) {}

  @Post('criteria/:criterionId/assessment')
  @ProjectAccess('criterionId', 'criterion', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('criterionId') criterionId: string, @Body() dto: CreateCriterionAssessmentDto) {
    return this.service.create(criterionId, dto);
  }

  @Get('criteria/:criterionId/assessment')
  @ProjectAccess('criterionId', 'criterion', ProjectMemberRole.VIEWER)
  findOne(@Param('criterionId') criterionId: string) {
    return this.service.findOne(criterionId);
  }

  @Patch('criterion-assessments/:id')
  @ProjectAccess('id', 'criterionAssessment', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateCriterionAssessmentDto) {
    return this.service.update(id, dto);
  }

  @Delete('criterion-assessments/:id')
  @ProjectAccess('id', 'criterionAssessment', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}