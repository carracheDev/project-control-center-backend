import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePhaseValidationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  validatedBy?: string;

  @IsOptional()
  @IsString()
  note?: string;
}