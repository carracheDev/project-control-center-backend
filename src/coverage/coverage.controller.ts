import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateCoverageRequirementDto } from './dto/create-coverage-requirement.dto.js';
import { UpdateCoverageRequirementDto } from './dto/update-coverage-requirement.dto.js';
import { CoverageService } from './coverage.service.js';

@Controller()
export class CoverageController {
  constructor(private readonly coverageService: CoverageService) {}

  @Post('phases/:phaseId/coverage-requirements')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('phaseId') phaseId: string, @Body() dto: CreateCoverageRequirementDto) {
    return this.coverageService.create(phaseId, dto);
  }

  @Get('phases/:phaseId/coverage-requirements')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  findAll(@Param('phaseId') phaseId: string) {
    return this.coverageService.findAll(phaseId);
  }

  @Get('phases/:phaseId/coverage')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  calculate(@Param('phaseId') phaseId: string) {
    return this.coverageService.calculate(phaseId);
  }

  @Get('coverage-requirements/:id')
  @ProjectAccess('id', 'coverageRequirement', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.coverageService.findOne(id);
  }

  @Patch('coverage-requirements/:id')
  @ProjectAccess('id', 'coverageRequirement', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateCoverageRequirementDto) {
    return this.coverageService.update(id, dto);
  }

  @Delete('coverage-requirements/:id')
  @ProjectAccess('id', 'coverageRequirement', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.coverageService.remove(id);
  }
}