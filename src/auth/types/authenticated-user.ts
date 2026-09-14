import { GlobalRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  globalRole: GlobalRole;
  isActive: boolean;
}