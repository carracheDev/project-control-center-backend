import { InterviewStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInterviewDto {
  @IsString()
  @IsNotEmpty()
  questionnaireId!: string;

  @IsString()
  @IsNotEmpty()
  respondentName!: string;

  @IsOptional()
  @IsString()
  respondentRole?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsEnum(InterviewStatus)
  status?: InterviewStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}