import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateProjectDecisionDto } from './dto/create-project-decision.dto.js';
import { DecisionService } from './decision.service.js';

@Controller()
export class DecisionController {
  constructor(private readonly service: DecisionService) {}

  @Post('projects/:projectId/decisions')
  @ProjectAccess('projectId', 'project', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('projectId') projectId: string, @Body() dto: CreateProjectDecisionDto) {
    return this.service.create(projectId, dto);
  }

  @Get('projects/:projectId/decisions')
  @ProjectAccess('projectId', 'project', ProjectMemberRole.VIEWER)
  findAll(@Param('projectId') projectId: string) {
    return this.service.findAll(projectId);
  }

  @Get('project-decisions/:id')
  @ProjectAccess('id', 'decision', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}