import { Discussion } from '../entities/discussion.entity';

export interface DiscussionListResponse {
	data: Discussion[];
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}
