import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogInterceptor } from './audit-log.interceptor.js';
import { AuditLogService } from './audit-log.service.js';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditLogController],
  providers: [AuditLogService, { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor }],
  exports: [AuditLogService],
})
export class AuditModule {}
