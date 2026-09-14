import { IsNotEmpty, IsString } from 'class-validator';

export class CreateResponseDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;
}