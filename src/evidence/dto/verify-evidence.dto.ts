import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyEvidenceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  verifiedBy?: string;
}