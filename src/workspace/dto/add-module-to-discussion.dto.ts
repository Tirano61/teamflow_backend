import { IsUUID } from 'class-validator';

export class AddModuleToDiscussionDto {
  @IsUUID('4')
  moduleId!: string;
}
