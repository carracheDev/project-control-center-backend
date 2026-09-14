import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuditLogService } from './audit-log.service.js';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @Roles('ADMIN')
  list(@Query('projectId') projectId?: string) {
    return this.audit.list(projectId);
  }
}
