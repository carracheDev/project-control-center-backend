import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateProjectMemberDto } from './dto/create-project-member.dto.js';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto.js';
import { ProjectMembersService } from './project-members.service.js';

@Controller()
export class ProjectMembersController {
  constructor(private readonly service: ProjectMembersService) {}

  @Get('projects/:projectId/members')
  @ProjectAccess('projectId', 'project', ProjectMemberRole.VIEWER)
  findAll(@Param('projectId') projectId: string) { return this.service.findAll(projectId); }

  @Post('projects/:projectId/members')
  @Roles('ADMIN')
  create(@Param('projectId') projectId: string, @Body() dto: CreateProjectMemberDto) { return this.service.create(projectId, dto); }

  @Patch('project-members/:id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateProjectMemberDto) { return this.service.update(id, dto); }

  @Delete('project-members/:id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}