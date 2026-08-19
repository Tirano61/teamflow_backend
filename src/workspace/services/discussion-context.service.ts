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
import { WorkspaceOrganizationAccessService } from './workspace-organization-access.service';

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
		private readonly orgAccessService: WorkspaceOrganizationAccessService,
	) { }

	async addModuleToDiscussion(
		organizationId: string,
		discussionId: string,
		moduleId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(
			actor.id,
			organizationId,
		);
		this.orgAccessService.assertCanManageDiscussion(membership);

		const discussion = await this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId, organizationId },
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
				organizationId,
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context add module discussionId=${discussionId} moduleId=${moduleId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
	}

	async removeModuleFromDiscussion(
		organizationId: string,
		discussionId: string,
		moduleId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(
			actor.id,
			organizationId,
		);
		this.orgAccessService.assertCanManageDiscussion(membership);

		const discussion = await this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
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
				organizationId,
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context remove module discussionId=${discussionId} moduleId=${moduleId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
	}

	async addComponentToDiscussion(
		organizationId: string,
		discussionId: string,
		componentId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(
			actor.id,
			organizationId,
		);
		this.orgAccessService.assertCanManageDiscussion(membership);

		const discussion = await this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
		const component = await this.componentRepository.findOne({
			where: { id: componentId, organizationId },
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
				organizationId,
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context add component discussionId=${discussionId} componentId=${componentId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
	}

	async removeComponentFromDiscussion(
		organizationId: string,
		discussionId: string,
		componentId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(
			actor.id,
			organizationId,
		);
		this.orgAccessService.assertCanManageDiscussion(membership);

		const discussion = await this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
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
				organizationId,
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context remove component discussionId=${discussionId} componentId=${componentId} reason=${reason}`,
			);
		}

		return this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
	}

	async addTagToDiscussion(
		organizationId: string,
		discussionId: string,
		tagId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(
			actor.id,
			organizationId,
		);
		this.orgAccessService.assertCanManageDiscussion(membership);

		const discussion = await this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
		const tag = await this.tagRepository.findOne({
			where: { id: tagId, organizationId },
		});
		if (!tag) throw new NotFoundException('Tag not found');

		const alreadyRelated = (discussion.tags ?? []).some(
			(item) => item.id === tag.id,
		);
		if (alreadyRelated) {
			throw new BadRequestException('Discussion and tag relation already exists');
		}

		discussion.tags = [...(discussion.tags ?? []), tag];
		await this.discussionRepository.save(discussion);
		return this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
	}

	async removeTagFromDiscussion(
		organizationId: string,
		discussionId: string,
		tagId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(
			actor.id,
			organizationId,
		);
		this.orgAccessService.assertCanManageDiscussion(membership);

		const discussion = await this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
		const hasRelation = (discussion.tags ?? []).some((item) => item.id === tagId);
		if (!hasRelation) {
			throw new NotFoundException('Discussion and tag relation not found');
		}

		discussion.tags = (discussion.tags ?? []).filter((item) => item.id !== tagId);
		await this.discussionRepository.save(discussion);
		return this.discussionService.findDiscussionByIdForUser(
			organizationId,
			discussionId,
			actor,
		);
	}
}
