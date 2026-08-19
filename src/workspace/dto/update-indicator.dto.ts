import { PartialType } from '@nestjs/mapped-types';
import { IndicatorCreateDto } from './create-indicator.dto';

export class IndicatorUpdateDto extends PartialType(IndicatorCreateDto) {}
