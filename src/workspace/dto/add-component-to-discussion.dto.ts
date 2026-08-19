import { IsUUID } from 'class-validator';

export class AddComponentToDiscussionDto {
  @IsUUID('4')
  componentId!: string;
}
