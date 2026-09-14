import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectAccessGuard } from './project-access.guard.js';
import { ProjectAccessService } from './project-access.service.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ProjectAccessService, { provide: APP_GUARD, useClass: ProjectAccessGuard }],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}