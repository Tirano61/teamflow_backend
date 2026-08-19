import { IsUUID } from 'class-validator';

export class AddIndicatorToDiscussionDto {
  @IsUUID('4')
  indicatorId!: string;
}
