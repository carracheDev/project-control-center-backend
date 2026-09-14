import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsIn(['android', 'desktop', 'web'])
  platform!: string;
}
