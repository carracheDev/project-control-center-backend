import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEvent {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  projectId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(event: AuditEvent): Promise<unknown> {
    return this.prisma.auditLog.create({ data: { ...event, metadata: event.metadata ?? undefined } });
  }

  list(projectId?: string) {
    return this.prisma.auditLog.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, userId: true, action: true, entityType: true, entityId: true, projectId: true, metadata: true, createdAt: true },
    });
  }
}
