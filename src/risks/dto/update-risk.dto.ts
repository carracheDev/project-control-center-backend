import { RiskStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateRiskDto {
	@IsOptional() @IsString() @IsNotEmpty() title?: string;
	@IsOptional() @IsString() description?: string | null;
	@IsOptional() @IsString() @IsNotEmpty() phaseId?: string | null;
	@IsOptional() @IsString() @IsNotEmpty() ownerId?: string | null;
	@IsOptional() @IsInt() @Min(1) @Max(5) probability?: number;
	@IsOptional() @IsInt() @Min(1) @Max(5) impact?: number;
	@IsOptional() @IsEnum(RiskStatus) status?: RiskStatus;
	@IsOptional() @IsString() mitigation?: string | null;
	@IsOptional() @IsDateString() deadline?: string | null;
}
