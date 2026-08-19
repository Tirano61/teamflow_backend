import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class DiscussionAssignmentsUpdateDto {
	@IsArray()
	@ArrayUnique()
	@IsUUID('4', { each: true })
	developerUserIds!: string[];
}
