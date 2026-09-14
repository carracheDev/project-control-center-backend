import { EvidenceType } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateEvidenceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  criterionId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  interviewId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(EvidenceType)
  type!: EvidenceType;

  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsString()
  filePath?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  collectedAt?: string;
}