import { SetMetadata } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';

export const PROJECT_ACCESS_KEY = 'projectAccess';
export interface ProjectAccessMetadata { param: string; resource: string; roles?: ProjectMemberRole[]; }
export const ProjectAccess = (param: string, resource: string, ...roles: ProjectMemberRole[]) => SetMetadata(PROJECT_ACCESS_KEY, { param, resource, roles });