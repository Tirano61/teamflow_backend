import { PartialType } from '@nestjs/mapped-types';
import { TagCreateDto } from './create-tag.dto';

export class TagUpdateDto extends PartialType(TagCreateDto) {}
