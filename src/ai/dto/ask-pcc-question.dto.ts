import { IsString, MaxLength, MinLength } from 'class-validator';

export class AskPccQuestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  message!: string;
}
