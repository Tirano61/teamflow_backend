import { IsString, MaxLength, MinLength } from 'class-validator';

export class DiscussionMessageUpdateDto {
	@IsString()
	@MinLength(1)
	@MaxLength(4000)
	content!: string;
}
