import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkModule } from '../entities/work-module.entity';
import { Component } from '../entities/component.entity';
import { Discussion } from '../entities/discussion.entity';
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
		@InjectRepository(WorkModule)
		private readonly workModuleRepository: Repository<WorkModule>,
		@InjectRepository(Component)
		private readonly componentRepository: Repository<Component>,
		@InjectRepository(Tag)
		private readonly tagRepository: Repository<Tag>,
		private readonly discussionService: DiscussionService,
		private readonly workflowNotificationService: WorkspaceNotificationService,
	) { }

	async addModuleToDiscussion(
		discussionId: string,
		moduleId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId },
		});
		if (!module) throw new NotFoundException('Module not found');

		const alreadyRelated = (discussion.workModules ?? []).some(
			(item) => item.id === module.id,
		);
		if (alreadyRelated) {
			throw new BadRequestException(
				'Discussion and module relation already exists',
			);
		}

		discussion.workModules = [...(discussion.workModules ?? []), module];
		await this.discussionRepository.save(discussion);

		try {
			await this.workflowNotificationService.syncDiscussionContextChanged(
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context add module discussionId=${discussionId} moduleId=${moduleId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionById(discussionId);
	}

	async removeModuleFromDiscussion(
		discussionId: string,
		moduleId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const hasRelation = (discussion.workModules ?? []).some(
			(item) => item.id === moduleId,
		);
		if (!hasRelation) {
			throw new NotFoundException(
				'Discussion and module relation not found',
			);
		}

		discussion.workModules = (discussion.workModules ?? []).filter(
			(item) => item.id !== moduleId,
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
				`Silent sync failed for discussion context remove module discussionId=${discussionId} moduleId=${moduleId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionById(discussionId);
	}

	async addComponentToDiscussion(
		discussionId: string,
		componentId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const component = await this.componentRepository.findOne({
			where: { id: componentId },
		});
		if (!component) throw new NotFoundException('Component not found');

		const alreadyRelated = (discussion.components ?? []).some(
			(item) => item.id === component.id,
		);
		if (alreadyRelated) {
			throw new BadRequestException(
				'Discussion and component relation already exists',
			);
		}

		discussion.components = [...(discussion.components ?? []), component];
		await this.discussionRepository.save(discussion);

		try {
			await this.workflowNotificationService.syncDiscussionContextChanged(
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context add component discussionId=${discussionId} componentId=${componentId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionById(discussionId);
	}

	async removeComponentFromDiscussion(
		discussionId: string,
		componentId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.discussionService.findDiscussionById(discussionId);
		const hasRelation = (discussion.components ?? []).some(
			(item) => item.id === componentId,
		);
		if (!hasRelation) {
			throw new NotFoundException(
				'Discussion and component relation not found',
			);
		}

		discussion.components = (discussion.components ?? []).filter(
			(item) => item.id !== componentId,
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
				`Silent sync failed for discussion context remove component discussionId=${discussionId} componentId=${componentId} reason=${reason}`,
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
