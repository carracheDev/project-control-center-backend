import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAll(user);
  }

  @Get(':id')
  @ProjectAccess('id', 'project', ProjectMemberRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @ProjectAccess('id', 'project', ProjectMemberRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @ProjectAccess('id', 'project', ProjectMemberRole.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}