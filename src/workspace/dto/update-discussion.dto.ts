import { OmitType, PartialType } from '@nestjs/mapped-types';
import { DiscussionCreateDto } from './create-discussion.dto';

export class DiscussionUpdateDto extends PartialType(
	OmitType(DiscussionCreateDto, ['initialMessageContent'] as const),
) { }
