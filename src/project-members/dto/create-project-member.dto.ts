import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ProjectMemberRole } from '@prisma/client';

export class CreateProjectMemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(ProjectMemberRole)
  role!: ProjectMemberRole;
}