import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectDashboardController } from './project-dashboard.controller.js';
import { ProjectDashboardService } from './project-dashboard.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectDashboardController],
  providers: [ProjectDashboardService],
  exports: [ProjectDashboardService],
})
export class ProjectDashboardModule {}