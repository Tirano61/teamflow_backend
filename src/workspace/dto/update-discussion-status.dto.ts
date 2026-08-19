import { IsEnum } from 'class-validator';
import { DiscussionStatus } from '../enums/discussion-status.enum';

export class DiscussionStatusUpdateDto {
	@IsEnum(DiscussionStatus)
	status!: DiscussionStatus;
}
