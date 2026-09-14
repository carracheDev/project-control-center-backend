import { QuestionType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsBoolean()
  required!: boolean;

  @IsInt()
  @Min(1)
  order!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  objectiveId?: string;
}