import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { ProjectDashboardService } from './project-dashboard.service.js';

@Controller()
export class ProjectDashboardController {
  constructor(private readonly service: ProjectDashboardService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.service.getDashboard(user, projectId);
  }
}