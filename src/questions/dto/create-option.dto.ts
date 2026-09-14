import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateOptionDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsInt()
  @Min(1)
  order!: number;
}