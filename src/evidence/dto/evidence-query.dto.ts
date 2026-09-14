import { EvidenceStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class EvidenceQueryDto {
  @IsOptional()
  @IsEnum(EvidenceStatus)
  status?: EvidenceStatus;
}