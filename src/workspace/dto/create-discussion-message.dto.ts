import {
	IsEnum,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from 'class-validator';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';

export class DiscussionMessageCreateDto {
	@IsOptional()
	@IsEnum(DiscussionMessageType)
	type?: DiscussionMessageType;

	@IsString()
	@MinLength(1)
	@MaxLength(4000)
	content!: string;
}
