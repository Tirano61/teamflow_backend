import {
	IsIn,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from 'class-validator';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';

export class DiscussionAttachmentCreateDto {
	@IsIn([
		DiscussionMessageType.IMAGE,
		DiscussionMessageType.AUDIO,
		DiscussionMessageType.VIDEO,
		DiscussionMessageType.FILE,
	])
	type!: DiscussionMessageType;

	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(4000)
	content?: string;
}
