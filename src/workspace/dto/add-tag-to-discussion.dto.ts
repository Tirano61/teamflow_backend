import { IsUUID } from 'class-validator';

export class AddTagToDiscussionDto {
  @IsUUID('4')
  tagId!: string;
}
