import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application } from '../entities/application.entity';
import { Discussion } from '../entities/discussion.entity';
import { Indicator } from '../entities/indicator.entity';
import { Tag } from '../entities/tag.entity';
import { WorkspaceNotificationService } from './workspace-notification.service';
import { DiscussionService } from './discussion.service';
import { User } from '../../auth/entities/user.entity';

@Injectable()
export class DiscussionContextService {
	private readonly logger = new Logger(DiscussionContextService.name);

	constructor(
		@InjectRepository(Discussion)
		private readonly discussionRepository: Repository<Discussion>,
		@InjectRepository(Application)
		private readonly applicationRepository: Repository<Application>,
		@InjectRepository(Indicator)
		private readonly indicatorRepository: Repository<Indicator>,
		@InjectRepository(Tag)
		private readonly tagRepository: Repository<Tag>,
		private readonly discussionService: DiscussionService,
		private readonly workflowNotificationService: WorkspaceNotificationService,
	) { }

	async addApplicationToDiscussion(
		discussionId: string,
		applicationId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const application = await this.applicationRepository.findOne({
			where: { id: applicationId },
		});
		if (!application) throw new NotFoundException('Application not found');

		const alreadyRelated = (discussion.applications ?? []).some(
			(item) => item.id === application.id,
		);
		if (alreadyRelated) {
			throw new BadRequestException(
				'Discussion and application relation already exists',
			);
		}

		discussion.applications = [...(discussion.applications ?? []), application];
		await this.discussionRepository.save(discussion);

		try {
			await this.workflowNotificationService.syncDiscussionContextChanged(
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context add application discussionId=${discussionId} applicationId=${applicationId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionById(discussionId);
	}

	async removeApplicationFromDiscussion(
		discussionId: string,
		applicationId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const hasRelation = (discussion.applications ?? []).some(
			(item) => item.id === applicationId,
		);
		if (!hasRelation) {
			throw new NotFoundException(
				'Discussion and application relation not found',
			);
		}

		discussion.applications = (discussion.applications ?? []).filter(
			(item) => item.id !== applicationId,
		);
		await this.discussionRepository.save(discussion);

		try {
			await this.workflowNotificationService.syncDiscussionContextChanged(
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context remove application discussionId=${discussionId} applicationId=${applicationId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionById(discussionId);
	}

	async addIndicatorToDiscussion(
		discussionId: string,
		indicatorId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const indicator = await this.indicatorRepository.findOne({
			where: { id: indicatorId },
		});
		if (!indicator) throw new NotFoundException('Indicator not found');

		const alreadyRelated = (discussion.indicators ?? []).some(
			(item) => item.id === indicator.id,
		);
		if (alreadyRelated) {
			throw new BadRequestException(
				'Discussion and indicator relation already exists',
			);
		}

		discussion.indicators = [...(discussion.indicators ?? []), indicator];
		await this.discussionRepository.save(discussion);

		try {
			await this.workflowNotificationService.syncDiscussionContextChanged(
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context add indicator discussionId=${discussionId} indicatorId=${indicatorId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionById(discussionId);
	}

	async removeIndicatorFromDiscussion(
		discussionId: string,
		indicatorId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const hasRelation = (discussion.indicators ?? []).some(
			(item) => item.id === indicatorId,
		);
		if (!hasRelation) {
			throw new NotFoundException(
				'Discussion and indicator relation not found',
			);
		}

		discussion.indicators = (discussion.indicators ?? []).filter(
			(item) => item.id !== indicatorId,
		);
		await this.discussionRepository.save(discussion);

		try {
			await this.workflowNotificationService.syncDiscussionContextChanged(
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context remove indicator discussionId=${discussionId} indicatorId=${indicatorId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionById(discussionId);
	}

	async addTagToDiscussion(
		discussionId: string,
		tagId: string,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const tag = await this.tagRepository.findOne({ where: { id: tagId } });
		if (!tag) throw new NotFoundException('Tag not found');

		const alreadyRelated = (discussion.tags ?? []).some(
			(item) => item.id === tag.id,
		);
		if (alreadyRelated) {
			throw new BadRequestException('Discussion and tag relation already exists');
		}

		discussion.tags = [...(discussion.tags ?? []), tag];
		await this.discussionRepository.save(discussion);
		return this.discussionService.findDiscussionById(discussionId);
	}

	async removeTagFromDiscussion(
		discussionId: string,
		tagId: string,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const hasRelation = (discussion.tags ?? []).some((item) => item.id === tagId);
		if (!hasRelation) {
			throw new NotFoundException('Discussion and tag relation not found');
		}

		discussion.tags = (discussion.tags ?? []).filter((item) => item.id !== tagId);
		await this.discussionRepository.save(discussion);
		return this.discussionService.findDiscussionById(discussionId);
	}
}
