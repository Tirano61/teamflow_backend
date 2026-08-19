import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class IndicatorCreateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
