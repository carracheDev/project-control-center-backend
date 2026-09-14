import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateCriterionDto } from './dto/create-criterion.dto.js';
import { UpdateCriterionDto } from './dto/update-criterion.dto.js';
import { CriteriaService } from './criteria.service.js';

@Controller()
export class CriteriaController {
  constructor(private readonly criteriaService: CriteriaService) {}

  @Post('phases/:phaseId/criteria')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('phaseId') phaseId: string, @Body() dto: CreateCriterionDto) {
    return this.criteriaService.create(phaseId, dto);
  }

  @Get('phases/:phaseId/criteria')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  findAll(@Param('phaseId') phaseId: string) {
    return this.criteriaService.findAll(phaseId);
  }

  @Get('criteria/:id')
  @ProjectAccess('id', 'criterion', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.criteriaService.findOne(id);
  }

  @Patch('criteria/:id')
  @ProjectAccess('id', 'criterion', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateCriterionDto) {
    return this.criteriaService.update(id, dto);
  }

  @Delete('criteria/:id')
  @ProjectAccess('id', 'criterion', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.criteriaService.remove(id);
  }
}