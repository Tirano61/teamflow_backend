import {
	ArrayUnique,
	IsArray,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	MinLength,
} from 'class-validator';
import { DiscussionType } from '../enums/discussion-type.enum';

export class DiscussionCreateDto {
	@IsEnum(DiscussionType)
	type!: DiscussionType;

	@IsString()
	@MinLength(1)
	@MaxLength(150)
	title!: string;

	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsUUID('4', { each: true })
	applicationIds?: string[];

	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsUUID('4', { each: true })
	indicatorIds?: string[];

	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsUUID('4', { each: true })
	tagIds?: string[];

	@IsString()
	@MinLength(1)
	@MaxLength(4000)
	initialMessageContent!: string;
}
