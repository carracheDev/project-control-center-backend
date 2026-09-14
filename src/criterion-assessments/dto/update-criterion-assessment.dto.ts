import { CriterionAssessmentStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateCriterionAssessmentDto {
  @IsOptional()
  @IsEnum(CriterionAssessmentStatus)
  status?: CriterionAssessmentStatus;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  evidenceId?: string | null;

  @IsOptional()
  @IsString()
  assessedBy?: string | null;
}