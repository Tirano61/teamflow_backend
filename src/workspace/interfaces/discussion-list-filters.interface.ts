import { DiscussionStatus } from '../enums/discussion-status.enum';
import { DiscussionType } from '../enums/discussion-type.enum';

export interface DiscussionListFilters {
	page: number;
	limit: number;
	type?: DiscussionType;
	status?: DiscussionStatus;
	moduleIds?: string;
	componentIds?: string;
	tagIds?: string;
	createdBy?: string;
	mine?: boolean;
	assignedToMe?: boolean;
	assignedDeveloperId?: string;
	unread?: boolean;
}
