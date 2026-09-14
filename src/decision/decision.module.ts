import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectDashboardModule } from '../project-dashboard/project-dashboard.module.js';
import { DecisionController } from './decision.controller.js';
import { DecisionService } from './decision.service.js';

@Module({
  imports: [PrismaModule, ProjectDashboardModule],
  controllers: [DecisionController],
  providers: [DecisionService],
})
export class DecisionModule {}