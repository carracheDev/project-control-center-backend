import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCriterionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  objectiveId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsBoolean()
  required!: boolean;

  @IsInt()
  @Min(1)
  order!: number;
}