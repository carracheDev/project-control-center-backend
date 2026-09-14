import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PROJECT_ACCESS_KEY, ProjectAccessMetadata } from './decorators/project-access.decorator.js';
import { ProjectAccessService } from './project-access.service.js';
import { AuthenticatedUser } from '../auth/types/authenticated-user.js';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly access: ProjectAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<ProjectAccessMetadata>(PROJECT_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    if (!metadata) return true;
    const request = context.switchToHttp().getRequest<{ params: Record<string, string>; user: AuthenticatedUser }>();
    const resourceId = request.params[metadata.param];
    const projectId = metadata.resource === 'project' ? resourceId : await this.access.resolveProjectId(metadata.resource, resourceId);
    await this.access.assertProjectAccess(request.user, projectId, metadata.roles);
    return true;
  }
}