import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectTimelineController } from './project-timeline.controller.js';
import { ProjectTimelineService } from './project-timeline.service.js';

@Module({ imports: [PrismaModule], controllers: [ProjectTimelineController], providers: [ProjectTimelineService] })
export class ProjectTimelineModule {}
