import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { AuditLogService } from './audit-log.service.js';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method: string; originalUrl?: string; route?: { path?: string }; params: Record<string, string>; body: Record<string, unknown>; user?: AuthenticatedUser }>();
    if (request.method === 'GET' || request.originalUrl?.startsWith('/auth')) return next.handle();
    return next.handle().pipe(mergeMap((result) => this.record(request).then(() => result)));
  }

  private async record(request: { method: string; originalUrl?: string; route?: { path?: string }; params: Record<string, string>; user?: AuthenticatedUser }): Promise<void> {
      const path = request.route?.path ?? request.originalUrl ?? '';
      const segments = path.split('/').filter(Boolean);
      const entityType = segments.find((segment) => !segment.startsWith(':')) ?? 'request';
      const entityId = Object.values(request.params ?? {}).find((value) => value && value.length > 0);
      const projectId = request.params?.projectId ?? (entityType === 'projects' ? entityId : undefined);
      await this.audit.record({
        userId: request.user?.id,
        action: request.method,
        entityType,
        entityId,
        projectId,
      }).catch(() => undefined);
  }
}
