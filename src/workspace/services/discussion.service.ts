import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { User } from '../../auth/entities/user.entity';
import { ValidRoles } from '../../auth/interfaces/valid-roles';
import { DiscussionCreateDto } from '../dto/create-discussion.dto';
import { DiscussionUpdateDto } from '../dto/update-discussion.dto';
import { Discussion } from '../entities/discussion.entity';
import { Application } from '../entities/application.entity';
import { Indicator } from '../entities/indicator.entity';
import { DiscussionMessage } from '../entities/discussion_message.entity';
import { DiscussionReadState } from '../entities/discussion_read_state.entity';
import { Tag } from '../entities/tag.entity';
import { DiscussionListFilters } from '../interfaces/discussion-list-filters.interface';
import { DiscussionListResponse } from '../interfaces/discussion-list-response.interface';
import { DiscussionStatus } from '../enums/discussion-status.enum';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';
import { WorkspaceNotificationService } from './workspace-notification.service';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

@Injectable()
export class DiscussionService {
	private readonly logger = new Logger(DiscussionService.name);

	constructor(
		@InjectRepository(Discussion)
		private readonly discussionRepository: Repository<Discussion>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private readonly dataSource: DataSource,
		private readonly workflowNotificationService: WorkspaceNotificationService,
	) { }

	private normalizeTitle(title: string): string {
		const normalized = title.trim();
		if (!normalized) throw new BadRequestException('Title cannot be empty');
		return normalized;
	}

	private normalizeInitialMessageContent(content: string): string {
		const normalized = content.trim();
		if (!normalized) {
			throw new BadRequestException('Initial message content cannot be empty');
		}
		return normalized;
	}

	private isDeveloper(user: User): boolean {
		return (user.roles ?? []).includes(ValidRoles.developer);
	}

	private assertCanEditDiscussion(user: User, discussion: Discussion): void {
		const ownerId = discussion.createdBy?.id;
		if (this.isDeveloper(user) || ownerId === user.id) return;
		throw new ForbiddenException('You can only modify your own discussions');
	}

	private assertCanModifyDiscussionContext(user: User): void {
		if (this.isDeveloper(user)) return;
		throw new ForbiddenException(
			'Only developers can modify discussion applications and indicators',
		);
	}

	private assertCanAccessDiscussion(user: User): void {
		if (!user?.id) {
			throw new ForbiddenException('User not authenticated');
		}
	}

	private parseIdsCsv(raw: string | undefined, fieldName: string): string[] {
		if (!raw) return [];
		const values = raw
			.split(',')
			.map((value) => value.trim())
			.filter((value) => value.length > 0);

		const uniqueValues = [...new Set(values)];
		if (uniqueValues.length !== values.length) {
			throw new BadRequestException(`${fieldName} contains duplicated ids`);
		}

		for (const id of uniqueValues) {
			if (!isUUID(id, '4')) {
				throw new BadRequestException(`Invalid id in ${fieldName}`);
			}
		}

		return uniqueValues;
	}

	private normalizePagination(page: number, limit: number) {
		if (page < 1) throw new BadRequestException('page must be greater than 0');
		if (limit < 1)
			throw new BadRequestException('limit must be greater than 0');
		return {
			page,
			limit: Math.min(limit, 100),
		};
	}

	private async resolveEntitiesByIds<T extends { id: string }>(
		ids: string[],
		repository: Repository<T>,
		entityName: string,
	): Promise<T[]> {
		if (!ids.length) return [];

		const uniqueIds = [...new Set(ids)];
		if (uniqueIds.length !== ids.length) {
			throw new BadRequestException(`${entityName} ids contain duplicates`);
		}

		const entities = await repository.findBy({
			id: In(uniqueIds),
		} as unknown as Parameters<Repository<T>['findBy']>[0]);

		if (entities.length !== uniqueIds.length) {
			const foundIds = new Set(entities.map((entity) => entity.id));
			const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
			throw new NotFoundException(
				`${entityName} not found: ${missingIds.join(', ')}`,
			);
		}

		const mapById = new Map(entities.map((entity) => [entity.id, entity]));
		return uniqueIds.map((id) => mapById.get(id)!);
	}

	private async findDiscussionWithRelations(
		id: string,
	): Promise<Discussion | null> {
		return this.discussionRepository.findOne({
			where: { id },
			relations: [
				'createdBy',
				'applications',
				'indicators',
				'tags',
				'assignedDevelopers',
			],
		});
	}

	private parseRawBoolean(value: unknown): boolean {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value === 1;
		if (typeof value === 'string') {
			const normalized = value.toLowerCase();
			return normalized === 'true' || normalized === 't' || normalized === '1';
		}
		return false;
	}

	private buildUnreadConditionSql(): string {
		const lastActivityAtSql =
			'GREATEST(discussion.updated_at, COALESCE(last_message.last_message_at, discussion.created_at))';
		return `(read_state.last_read_at IS NULL OR read_state.last_read_at < ${lastActivityAtSql})`;
	}

	private applyUnreadJoins(
		queryBuilder: SelectQueryBuilder<Discussion>,
		currentUserId: string,
	): string {
		const lastMessageSubQuery = queryBuilder
			.subQuery()
			.select('message.discussion_id', 'discussion_id')
			.addSelect('MAX(message.created_at)', 'last_message_at')
			.from(DiscussionMessage, 'message')
			.groupBy('message.discussion_id')
			.getQuery();

		queryBuilder
			.leftJoin(
				`(${lastMessageSubQuery})`,
				'last_message',
				'last_message.discussion_id = discussion.id',
			)
			.leftJoin(
				DiscussionReadState,
				'read_state',
				'read_state.discussion_id = discussion.id AND read_state.user_id = :readStateUserId',
				{ readStateUserId: currentUserId },
			);

		return this.buildUnreadConditionSql();
	}

	private attachUnreadFlags(
		discussions: Discussion[],
		unreadByDiscussionId: Map<string, boolean>,
	): Discussion[] {
		return discussions.map((discussion) => {
			discussion.isUnread = unreadByDiscussionId.get(discussion.id) ?? false;
			return discussion;
		});
	}

	private async findUnreadByDiscussionIds(
		discussionIds: string[],
		currentUserId: string,
	): Promise<Map<string, boolean>> {
		if (!discussionIds.length) return new Map<string, boolean>();

		const queryBuilder = this.discussionRepository
			.createQueryBuilder('discussion')
			.select('discussion.id', 'id')
			.where('discussion.id IN (:...discussionIds)', { discussionIds });

		const unreadConditionSql = this.applyUnreadJoins(queryBuilder, currentUserId);

		const rows = await queryBuilder
			.addSelect(
				`CASE WHEN ${unreadConditionSql} THEN true ELSE false END`,
				'isUnread',
			)
			.getRawMany<{ id: string; isUnread: boolean | string | number }>();

		return new Map(
			rows.map((row) => [row.id, this.parseRawBoolean(row.isUnread)]),
		);
	}

	async upsertDiscussionReadState(
		discussionId: string,
		userId: string,
		manager?: EntityManager,
		lastReadAt: Date = new Date(),
	): Promise<void> {
		const effectiveManager = manager ?? this.dataSource.manager;

		await effectiveManager.query(
			`
				INSERT INTO public.discussion_read_states (
					discussion_id,
					user_id,
					last_read_at
				)
				VALUES ($1, $2, $3)
				ON CONFLICT (discussion_id, user_id)
				DO UPDATE SET
					last_read_at = GREATEST(discussion_read_states.last_read_at, EXCLUDED.last_read_at),
					updated_at = now()
			`,
			[discussionId, userId, lastReadAt],
		);
	}

	private sanitizeDiscussionAssignees(discussion: Discussion): Discussion {
		discussion.assignedDevelopers = (discussion.assignedDevelopers ?? []).map(
			(developer) =>
			({
				id: developer.id,
				fullName: developer.fullName,
				email: developer.email,
			} as User),
		);

		return discussion;
	}

	private sanitizeDiscussionListAssignees(
		discussions: Discussion[],
	): Discussion[] {
		return discussions.map((discussion) =>
			this.sanitizeDiscussionAssignees(discussion),
		);
	}

	private hasDifferentEntityIds(
		current: Array<{ id: string }> | undefined,
		next: Array<{ id: string }> | undefined,
	): boolean {
		const currentIds = new Set((current ?? []).map((item) => item.id));
		const nextIds = new Set((next ?? []).map((item) => item.id));

		if (currentIds.size !== nextIds.size) return true;
		return [...currentIds].some((id) => !nextIds.has(id));
	}

	private async resolveAssignableDevelopersByIds(ids: string[]): Promise<User[]> {
		if (!ids.length) return [];

		const uniqueIds = [...new Set(ids)];
		if (uniqueIds.length !== ids.length) {
			throw new BadRequestException('developerUserIds contains duplicates');
		}

		const developers = await this.userRepository
			.createQueryBuilder('user')
			.where('user.id IN (:...ids)', { ids: uniqueIds })
			.andWhere('user.isActive = true')
			.andWhere(':developerRole = ANY(user.roles)', {
				developerRole: ValidRoles.developer,
			})
			.getMany();

		if (developers.length !== uniqueIds.length) {
			const foundIds = new Set(developers.map((developer) => developer.id));
			const missingOrInvalid = uniqueIds.filter((id) => !foundIds.has(id));
			throw new BadRequestException(
				`Users not assignable as developers: ${missingOrInvalid.join(', ')}`,
			);
		}

		const mapById = new Map(developers.map((developer) => [developer.id, developer]));
		return uniqueIds.map((id) => mapById.get(id)!);
	}

	async createDiscussion(
		dto: DiscussionCreateDto,
		user: User,
	): Promise<Discussion> {
		const title = this.normalizeTitle(dto.title);
		const initialMessageContent = this.normalizeInitialMessageContent(
			dto.initialMessageContent,
		);

		const discussionId = await this.dataSource.transaction(async (manager) => {
			const discussionRepository = manager.getRepository(Discussion);
			const applicationRepository = manager.getRepository(Application);
			const indicatorRepository = manager.getRepository(Indicator);
			const discussionMessageRepository = manager.getRepository(DiscussionMessage);
			const tagRepository = manager.getRepository(Tag);

			const [applications, indicators, tags] = await Promise.all([
				this.resolveEntitiesByIds(
					dto.applicationIds ?? [],
					applicationRepository,
					'Application',
				),
				this.resolveEntitiesByIds(
					dto.indicatorIds ?? [],
					indicatorRepository,
					'Indicator',
				),
				this.resolveEntitiesByIds(dto.tagIds ?? [], tagRepository, 'Tag'),
			]);

			const discussion = discussionRepository.create({
				type: dto.type,
				title,
				status: DiscussionStatus.NEW,
				createdBy: { id: user.id } as User,
				applications,
				indicators,
				tags,
			});

			const saved = await discussionRepository.save(discussion);

			const initialMessage = discussionMessageRepository.create({
				discussion: { id: saved.id } as Discussion,
				author: { id: user.id } as User,
				type: DiscussionMessageType.TEXT,
				content: initialMessageContent,
			});
			await discussionMessageRepository.save(initialMessage);
			await this.upsertDiscussionReadState(saved.id, user.id, manager);

			return saved.id;
		});

		const discussion = await this.findDiscussionByIdForUser(discussionId, user);

		try {
			await this.workflowNotificationService.notifyDiscussionCreated(
				discussion,
				user,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Push notify failed for discussion creation discussionId=${discussion.id} reason=${reason}`,
			);
		}

		return discussion;
	}

	async findDiscussions(
		filters: DiscussionListFilters,
		currentUser: User,
	): Promise<DiscussionListResponse> {
		const { page, limit } = this.normalizePagination(
			filters.page,
			filters.limit,
		);
		const applicationIds = this.parseIdsCsv(
			filters.applicationIds,
			'applicationIds',
		);
		const indicatorIds = this.parseIdsCsv(filters.indicatorIds, 'indicatorIds');
		const tagIds = this.parseIdsCsv(filters.tagIds, 'tagIds');

		if (filters.createdBy && !isUUID(filters.createdBy, '4')) {
			throw new BadRequestException('createdBy must be a valid UUID');
		}

		if (filters.assignedDeveloperId && !isUUID(filters.assignedDeveloperId, '4')) {
			throw new BadRequestException('assignedDeveloperId must be a valid UUID');
		}

		const queryBuilder = this.discussionRepository
			.createQueryBuilder('discussion')
			.leftJoin('discussion.createdBy', 'createdByFilter')
			.leftJoin('discussion.applications', 'applicationFilter')
			.leftJoin('discussion.indicators', 'indicatorFilter')
			.leftJoin('discussion.tags', 'tagFilter')
			.leftJoin('discussion.assignedDevelopers', 'assignedDeveloperFilter');

		const unreadConditionSql = this.applyUnreadJoins(queryBuilder, currentUser.id);

		if (filters.type) {
			queryBuilder.andWhere('discussion.type = :type', { type: filters.type });
		}

		if (filters.status) {
			queryBuilder.andWhere('discussion.status = :status', {
				status: filters.status,
			});
		}

		if (applicationIds.length > 0) {
			queryBuilder.andWhere('applicationFilter.id IN (:...applicationIds)', {
				applicationIds,
			});
		}

		if (indicatorIds.length > 0) {
			queryBuilder.andWhere('indicatorFilter.id IN (:...indicatorIds)', {
				indicatorIds,
			});
		}

		if (tagIds.length > 0) {
			queryBuilder.andWhere('tagFilter.id IN (:...tagIds)', { tagIds });
		}

		if (filters.mine) {
			queryBuilder.andWhere('createdByFilter.id = :currentUserId', {
				currentUserId: currentUser.id,
			});
		} else if (filters.createdBy) {
			queryBuilder.andWhere('createdByFilter.id = :createdBy', {
				createdBy: filters.createdBy,
			});
		}

		if (filters.assignedToMe) {
			queryBuilder.andWhere('assignedDeveloperFilter.id = :assignedToMeUserId', {
				assignedToMeUserId: currentUser.id,
			});
		} else if (filters.assignedDeveloperId) {
			queryBuilder.andWhere(
				'assignedDeveloperFilter.id = :assignedDeveloperId',
				{
					assignedDeveloperId: filters.assignedDeveloperId,
				},
			);
		}

		if (filters.unread) {
			queryBuilder.andWhere(unreadConditionSql);
		}

		const total = await queryBuilder
			.clone()
			.select('discussion.id')
			.distinct(true)
			.getCount();

		const discussionRows = await queryBuilder
			.clone()
			.select('discussion.id', 'id')
			.addSelect('discussion.createdAt', 'createdAt')
			.addSelect(
				`CASE WHEN ${unreadConditionSql} THEN true ELSE false END`,
				'isUnread',
			)
			.distinct(true)
			.orderBy('discussion.createdAt', 'DESC')
			.addOrderBy('discussion.id', 'ASC')
			.offset((page - 1) * limit)
			.limit(limit)
			.getRawMany<{ id: string; isUnread: boolean | string | number }>();

		const discussionIds = discussionRows.map((row) => row.id);
		const unreadByDiscussionId = new Map(
			discussionRows.map((row) => [row.id, this.parseRawBoolean(row.isUnread)]),
		);
		const data = discussionIds.length
			? await this.discussionRepository.find({
				where: { id: In(discussionIds) },
				relations: [
					'createdBy',
					'applications',
					'indicators',
					'tags',
					'assignedDevelopers',
				],
				order: { createdAt: 'DESC' },
			})
			: [];

		const dataById = new Map(data.map((discussion) => [discussion.id, discussion]));
		const orderedData = discussionIds
			.map((discussionId) => dataById.get(discussionId))
			.filter((discussion): discussion is Discussion => Boolean(discussion));
		const hydratedData = this.attachUnreadFlags(
			orderedData,
			unreadByDiscussionId,
		);

		return {
			data: this.sanitizeDiscussionListAssignees(hydratedData),
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		};
	}

	async findDiscussionById(id: string): Promise<Discussion> {
		const discussion = await this.findDiscussionWithRelations(id);
		if (!discussion) throw new NotFoundException('Discussion not found');
		return this.sanitizeDiscussionAssignees(discussion);
	}

	async findDiscussionByIdForUser(id: string, user: User): Promise<Discussion> {
		const discussion = await this.findDiscussionById(id);
		this.assertCanAccessDiscussion(user);
		const unreadByDiscussionId = await this.findUnreadByDiscussionIds(
			[id],
			user.id,
		);
		discussion.isUnread = unreadByDiscussionId.get(id) ?? false;
		return discussion;
	}

	async markDiscussionAsRead(
		discussionId: string,
		user: User,
	): Promise<{ discussionId: string; lastReadAt: string; isUnread: false }> {
		await this.findDiscussionByIdForUser(discussionId, user);
		const lastReadAt = new Date();
		await this.upsertDiscussionReadState(discussionId, user.id, undefined, lastReadAt);

		return {
			discussionId,
			lastReadAt: lastReadAt.toISOString(),
			isUnread: false,
		};
	}

	async updateDiscussion(
		id: string,
		dto: DiscussionUpdateDto,
		user: User,
	): Promise<Discussion> {
		let didChangeContext = false;

		const discussionId = await this.dataSource.transaction(async (manager) => {
			const discussionRepository = manager.getRepository(Discussion);
			const applicationRepository = manager.getRepository(Application);
			const indicatorRepository = manager.getRepository(Indicator);
			const tagRepository = manager.getRepository(Tag);

			const discussion = await discussionRepository.findOne({
				where: { id },
				relations: ['createdBy', 'applications', 'indicators', 'tags'],
			});

			if (!discussion) throw new NotFoundException('Discussion not found');
			this.assertCanEditDiscussion(user, discussion);

			if (dto.title !== undefined) {
				discussion.title = this.normalizeTitle(dto.title);
			}

			if (dto.type !== undefined) {
				discussion.type = dto.type;
			}

			if (dto.applicationIds !== undefined || dto.indicatorIds !== undefined) {
				this.assertCanModifyDiscussionContext(user);
			}

			if (dto.applicationIds !== undefined) {
				const nextApplications = await this.resolveEntitiesByIds(
					dto.applicationIds,
					applicationRepository,
					'Application',
				);
				didChangeContext =
					didChangeContext ||
					this.hasDifferentEntityIds(discussion.applications, nextApplications);
				discussion.applications = nextApplications;
			}

			if (dto.indicatorIds !== undefined) {
				const nextIndicators = await this.resolveEntitiesByIds(
					dto.indicatorIds,
					indicatorRepository,
					'Indicator',
				);
				didChangeContext =
					didChangeContext ||
					this.hasDifferentEntityIds(discussion.indicators, nextIndicators);
				discussion.indicators = nextIndicators;
			}

			if (dto.tagIds !== undefined) {
				discussion.tags = await this.resolveEntitiesByIds(
					dto.tagIds,
					tagRepository,
					'Tag',
				);
			}

			await discussionRepository.save(discussion);
			return discussion.id;
		});

		const updatedDiscussion = await this.findDiscussionById(discussionId);

		if (didChangeContext) {
			try {
				await this.workflowNotificationService.syncDiscussionContextChanged(
					discussionId,
					user,
				);
			} catch (error) {
				const reason = error instanceof Error ? error.message : 'unknown';
				this.logger.warn(
					`Silent sync failed for discussion context replace discussionId=${discussionId} reason=${reason}`,
				);
			}
		}

		return updatedDiscussion;
	}

	async updateDiscussionStatus(
		id: string,
		status: DiscussionStatus,
		user: User,
	): Promise<Discussion> {
		if (!this.isDeveloper(user)) {
			throw new ForbiddenException('Only developers can change discussion status');
		}

		const discussion = await this.discussionRepository.findOne({ where: { id } });
		if (!discussion) throw new NotFoundException('Discussion not found');

		discussion.status = status;
		await this.discussionRepository.save(discussion);

		const updatedDiscussion = await this.findDiscussionById(id);

		try {
			await this.workflowNotificationService.notifyDiscussionStatusChanged(
				updatedDiscussion,
				user,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Push notify failed for discussion status change discussionId=${id} reason=${reason}`,
			);
		}

		return updatedDiscussion;
	}

	async addDeveloperAssignments(
		discussionId: string,
		developerUserIds: string[],
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.findDiscussionWithRelations(discussionId);
		if (!discussion) throw new NotFoundException('Discussion not found');

		const developersToAdd = await this.resolveAssignableDevelopersByIds(
			developerUserIds,
		);

		const existingById = new Set(
			(discussion.assignedDevelopers ?? []).map((developer) => developer.id),
		);

		const newDevelopers = developersToAdd.filter(
			(developer) => !existingById.has(developer.id),
		);

		discussion.assignedDevelopers = [
			...(discussion.assignedDevelopers ?? []),
			...newDevelopers,
		];

		await this.discussionRepository.save(discussion);
		const updatedDiscussion = await this.findDiscussionById(discussionId);

		if (newDevelopers.length > 0) {
			try {
				await this.workflowNotificationService.notifyDiscussionAssignmentChanged(
					updatedDiscussion,
					actor,
				);
			} catch (error) {
				const reason = error instanceof Error ? error.message : 'unknown';
				this.logger.warn(
					`Push notify failed for assignment add discussionId=${discussionId} reason=${reason}`,
				);
			}
		}

		return updatedDiscussion;
	}

	async replaceDeveloperAssignments(
		discussionId: string,
		developerUserIds: string[],
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.findDiscussionWithRelations(discussionId);
		if (!discussion) throw new NotFoundException('Discussion not found');
		const previousDeveloperIds = new Set(
			(discussion.assignedDevelopers ?? []).map((developer) => developer.id),
		);

		const nextDevelopers = await this.resolveAssignableDevelopersByIds(
			developerUserIds,
		);
		discussion.assignedDevelopers = nextDevelopers;

		await this.discussionRepository.save(discussion);
		const nextDeveloperIds = new Set(nextDevelopers.map((developer) => developer.id));
		const didChange =
			previousDeveloperIds.size !== nextDeveloperIds.size ||
			[...previousDeveloperIds].some((developerId) => !nextDeveloperIds.has(developerId));

		const updatedDiscussion = await this.findDiscussionById(discussionId);

		if (didChange) {
			try {
				await this.workflowNotificationService.notifyDiscussionAssignmentChanged(
					updatedDiscussion,
					actor,
				);
			} catch (error) {
				const reason = error instanceof Error ? error.message : 'unknown';
				this.logger.warn(
					`Push notify failed for assignment replace discussionId=${discussionId} reason=${reason}`,
				);
			}
		}

		return updatedDiscussion;
	}

	async removeDeveloperAssignment(
		discussionId: string,
		developerUserId: string,
		actor: User,
	): Promise<Discussion> {
		const discussion = await this.findDiscussionWithRelations(discussionId);
		if (!discussion) throw new NotFoundException('Discussion not found');

		const hasAssignment = (discussion.assignedDevelopers ?? []).some(
			(developer) => developer.id === developerUserId,
		);

		if (!hasAssignment) {
			throw new NotFoundException('Discussion assignment not found');
		}

		discussion.assignedDevelopers = (discussion.assignedDevelopers ?? []).filter(
			(developer) => developer.id !== developerUserId,
		);

		await this.discussionRepository.save(discussion);
		const updatedDiscussion = await this.findDiscussionById(discussionId);

		try {
			await this.workflowNotificationService.notifyDiscussionAssignmentChanged(
				updatedDiscussion,
				actor,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Push notify failed for assignment remove discussionId=${discussionId} reason=${reason}`,
			);
		}

		return updatedDiscussion;
	}

	async findAssignableDevelopers(): Promise<
		Array<{ id: string; fullName: string; email: string }>
	> {
		const developers = await this.userRepository
			.createQueryBuilder('user')
			.select(['user.id', 'user.fullName', 'user.email'])
			.where('user.isActive = true')
			.andWhere(':developerRole = ANY(user.roles)', {
				developerRole: ValidRoles.developer,
			})
			.orderBy('user.fullName', 'ASC')
			.addOrderBy('user.id', 'ASC')
			.getMany();

		return developers.map((developer) => ({
			id: developer.id,
			fullName: developer.fullName,
			email: developer.email,
		}));
	}
}
