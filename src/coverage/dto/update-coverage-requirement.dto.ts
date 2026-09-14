import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCoverageRequirementDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  objectiveId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumInterviews?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}