import { PartialType } from '@nestjs/mapped-types';
import { ComponentCreateDto } from './create-component.dto';

export class ComponentUpdateDto extends PartialType(ComponentCreateDto) {}
