import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateRiskDto } from './dto/create-risk.dto.js';
import { UpdateRiskDto } from './dto/update-risk.dto.js';
import { RisksService } from './risks.service.js';

@Controller()
export class RisksController {
  constructor(private readonly service: RisksService) {}

  @Get('projects/:projectId/risks')
  @ProjectAccess('projectId', 'project', ProjectMemberRole.VIEWER)
  findAll(@Param('projectId') projectId: string) { return this.service.findAll(projectId); }

  @Post('projects/:projectId/risks')
  @ProjectAccess('projectId', 'project', ProjectMemberRole.PROJECT_MANAGER)
  create(@Param('projectId') projectId: string, @Body() dto: CreateRiskDto) { return this.service.create(projectId, dto); }

  @Get('risks/:id')
  @ProjectAccess('id', 'risk', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch('risks/:id')
  @ProjectAccess('id', 'risk', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateRiskDto) { return this.service.update(id, dto); }

  @Delete('risks/:id')
  @ProjectAccess('id', 'risk', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
