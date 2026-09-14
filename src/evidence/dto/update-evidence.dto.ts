import { EvidenceType } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateEvidenceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  criterionId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  interviewId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(EvidenceType)
  type?: EvidenceType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  source?: string;

  @IsOptional()
  @IsUrl()
  url?: string | null;

  @IsOptional()
  @IsString()
  filePath?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsDateString()
  collectedAt?: string | null;
}