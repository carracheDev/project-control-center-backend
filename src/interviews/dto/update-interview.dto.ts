import { InterviewStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateInterviewDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  questionnaireId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  respondentName?: string;

  @IsOptional()
  @IsString()
  respondentRole?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string | null;

  @IsOptional()
  @IsDateString()
  completedAt?: string | null;

  @IsOptional()
  @IsEnum(InterviewStatus)
  status?: InterviewStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}