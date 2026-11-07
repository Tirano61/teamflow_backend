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
import { Membership } from '../../memberships/entities/membership.entity';
import { WorkspaceOrganizationAccessService } from './workspace-organization-access.service';

type DiscussionContextRelation = 'workModules' | 'components' | 'tags';

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

	private async requireDiscussionManager(
		actor: User,
		organizationId: string,
	): Promise<Membership> {
		const membership = await this.orgAccessService.requireActiveMembership(
			actor.id,
			organizationId,
		);
		this.orgAccessService.assertCanManageDiscussion(membership);
		return membership;
	}

	/**
	 * Ids actualmente relacionados con la Discussion para una sola relacion, en una consulta
	 * acotada por organizacion. Mismo 404 que la lectura completa que se usaba antes.
	 */
	private async findRelatedIds(
		organizationId: string,
		discussionId: string,
		relation: DiscussionContextRelation,
	): Promise<Set<string>> {
		const [discussion] = await this.discussionRepository.find({
			where: { id: discussionId, organizationId },
			relations: [relation],
		});
		if (!discussion) throw new NotFoundException('Discussion not found');
		const related: Array<{ id: string }> = discussion[relation] ?? [];
		return new Set(related.map((item) => item.id));
	}

	/**
	 * INSERT/DELETE directo sobre la tabla intermedia. `save()` volvia a leer la Discussion y sus
	 * relaciones y abria una transaccion para una unica sentencia.
	 */
	private relationOf(relation: DiscussionContextRelation, discussionId: string) {
		return this.discussionRepository
			.createQueryBuilder()
			.relation(Discussion, relation)
			.of(discussionId);
	}

	private async syncContextChanged(
		organizationId: string,
		discussionId: string,
		actor: User,
		logContext: string,
	): Promise<void> {
		try {
			await this.workflowNotificationService.syncDiscussionContextChanged(
				organizationId,
				discussionId,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for discussion context ${logContext} reason=${reason}`,
			);
		}
	}

	async addModuleToDiscussion(
		organizationId: string,
		discussionId: string,
		moduleId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.requireDiscussionManager(actor, organizationId);

		const relatedIds = await this.findRelatedIds(organizationId, discussionId, 'workModules');
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId, organizationId },
		});
		if (!module) throw new NotFoundException('Module not found');

		if (relatedIds.has(module.id)) {
			throw new BadRequestException(
				'Discussion and module relation already exists',
			);
		}

		await this.relationOf('workModules', discussionId).add(module.id);

		await this.syncContextChanged(
			organizationId,
			discussionId,
			actor,
			`add module discussionId=${discussionId} moduleId=${moduleId}`,
		);

		return this.discussionService.findDiscussionByIdForMembership(
			organizationId,
			discussionId,
			membership,
		);
	}

	async removeModuleFromDiscussion(
		organizationId: string,
		discussionId: string,
		moduleId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.requireDiscussionManager(actor, organizationId);

		const relatedIds = await this.findRelatedIds(organizationId, discussionId, 'workModules');
		if (!relatedIds.has(moduleId)) {
			throw new NotFoundException(
				'Discussion and module relation not found',
			);
		}

		await this.relationOf('workModules', discussionId).remove(moduleId);

		await this.syncContextChanged(
			organizationId,
			discussionId,
			actor,
			`remove module discussionId=${discussionId} moduleId=${moduleId}`,
		);

		return this.discussionService.findDiscussionByIdForMembership(
			organizationId,
			discussionId,
			membership,
		);
	}

	async addComponentToDiscussion(
		organizationId: string,
		discussionId: string,
		componentId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.requireDiscussionManager(actor, organizationId);

		const relatedIds = await this.findRelatedIds(organizationId, discussionId, 'components');
		const component = await this.componentRepository.findOne({
			where: { id: componentId, organizationId },
		});
		if (!component) throw new NotFoundException('Component not found');

		if (relatedIds.has(component.id)) {
			throw new BadRequestException(
				'Discussion and component relation already exists',
			);
		}

		await this.relationOf('components', discussionId).add(component.id);

		await this.syncContextChanged(
			organizationId,
			discussionId,
			actor,
			`add component discussionId=${discussionId} componentId=${componentId}`,
		);

		return this.discussionService.findDiscussionByIdForMembership(
			organizationId,
			discussionId,
			membership,
		);
	}

	async removeComponentFromDiscussion(
		organizationId: string,
		discussionId: string,
		componentId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.requireDiscussionManager(actor, organizationId);

		const relatedIds = await this.findRelatedIds(organizationId, discussionId, 'components');
		if (!relatedIds.has(componentId)) {
			throw new NotFoundException(
				'Discussion and component relation not found',
			);
		}

		await this.relationOf('components', discussionId).remove(componentId);

		await this.syncContextChanged(
			organizationId,
			discussionId,
			actor,
			`remove component discussionId=${discussionId} componentId=${componentId}`,
		);

		return this.discussionService.findDiscussionByIdForMembership(
			organizationId,
			discussionId,
			membership,
		);
	}

	async addTagToDiscussion(
		organizationId: string,
		discussionId: string,
		tagId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.requireDiscussionManager(actor, organizationId);

		const relatedIds = await this.findRelatedIds(organizationId, discussionId, 'tags');
		const tag = await this.tagRepository.findOne({
			where: { id: tagId, organizationId },
		});
		if (!tag) throw new NotFoundException('Tag not found');

		if (relatedIds.has(tag.id)) {
			throw new BadRequestException('Discussion and tag relation already exists');
		}

		await this.relationOf('tags', discussionId).add(tag.id);
		return this.discussionService.findDiscussionByIdForMembership(
			organizationId,
			discussionId,
			membership,
		);
	}

	async removeTagFromDiscussion(
		organizationId: string,
		discussionId: string,
		tagId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.requireDiscussionManager(actor, organizationId);

		const relatedIds = await this.findRelatedIds(organizationId, discussionId, 'tags');
		if (!relatedIds.has(tagId)) {
			throw new NotFoundException('Discussion and tag relation not found');
		}

		await this.relationOf('tags', discussionId).remove(tagId);
		return this.discussionService.findDiscussionByIdForMembership(
			organizationId,
			discussionId,
			membership,
		);
	}
}
