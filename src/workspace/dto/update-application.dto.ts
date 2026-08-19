import { PartialType } from '@nestjs/mapped-types';
import { ApplicationCreateDto } from './create-application.dto';

export class ApplicationUpdateDto extends PartialType(ApplicationCreateDto) {}
