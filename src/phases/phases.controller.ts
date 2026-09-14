import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreatePhaseDto } from './dto/create-phase.dto.js';
import { UpdatePhaseDto } from './dto/update-phase.dto.js';
import { PhasesService } from './phases.service.js';

@Controller()
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @Post('projects/:projectId/phases')
  @ProjectAccess('projectId', 'project', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('projectId') projectId: string, @Body() dto: CreatePhaseDto) {
    return this.phasesService.create(projectId, dto);
  }

  @Get('projects/:projectId/phases')
  @ProjectAccess('projectId', 'project', ProjectMemberRole.VIEWER)
  findAll(@Param('projectId') projectId: string) {
    return this.phasesService.findAll(projectId);
  }

  @Get('phases/:id')
  @ProjectAccess('id', 'phase', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.phasesService.findOne(id);
  }

  @Get('phases/:id/workflow')
  @ProjectAccess('id', 'phase', ProjectMemberRole.VIEWER)
  getWorkflow(@Param('id') id: string) {
    return this.phasesService.getPhaseWorkflowState(id);
  }

  @Patch('phases/:id')
  @ProjectAccess('id', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdatePhaseDto) {
    return this.phasesService.update(id, dto);
  }

  @Delete('phases/:id')
  @ProjectAccess('id', 'phase', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.phasesService.remove(id);
  }
}