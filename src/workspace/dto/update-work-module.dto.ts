import { PartialType } from '@nestjs/mapped-types';
import { WorkModuleCreateDto } from './create-work-module.dto';

export class WorkModuleUpdateDto extends PartialType(WorkModuleCreateDto) {}
