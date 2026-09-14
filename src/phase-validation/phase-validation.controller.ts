import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreatePhaseValidationDto } from './dto/create-phase-validation.dto.js';
import { PhaseValidationService } from './phase-validation.service.js';

@Controller()
export class PhaseValidationController {
  constructor(private readonly service: PhaseValidationService) {}

  @Post('phases/:phaseId/validate')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  validate(@Param('phaseId') phaseId: string, @Body() dto: CreatePhaseValidationDto) {
    return this.service.validate(phaseId, dto);
  }

  @Get('phases/:phaseId/validations')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  findAll(@Param('phaseId') phaseId: string) {
    return this.service.findAll(phaseId);
  }

  @Get('phase-validations/:id')
  @ProjectAccess('id', 'phaseValidation', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}