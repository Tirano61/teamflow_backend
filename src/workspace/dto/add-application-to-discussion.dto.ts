import { IsUUID } from 'class-validator';

export class AddApplicationToDiscussionDto {
  @IsUUID('4')
  applicationId!: string;
}
