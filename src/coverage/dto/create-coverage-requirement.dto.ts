import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCoverageRequirementDto {
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

  @IsInt()
  @Min(1)
  minimumInterviews!: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}