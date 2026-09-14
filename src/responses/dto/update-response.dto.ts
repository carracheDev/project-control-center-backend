import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateResponseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  questionId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  value?: string;
}