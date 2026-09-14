import { Controller, Get, Param } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { ProjectTimelineService } from './project-timeline.service.js';

@Controller('projects')
export class ProjectTimelineController {
  constructor(private readonly timeline: ProjectTimelineService) {}

  @Get(':projectId/timeline')
  @ProjectAccess('projectId', 'project', ProjectMemberRole.VIEWER)
  get(@Param('projectId') projectId: string) {
    return this.timeline.get(projectId);
  }
}
