import { QuestionnaireStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateQuestionnaireDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsEnum(QuestionnaireStatus)
  status?: QuestionnaireStatus;
}