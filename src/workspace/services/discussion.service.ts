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
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/enums/membership-status.enum';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { DiscussionCreateDto } from '../dto/create-discussion.dto';
import { DiscussionUpdateDto } from '../dto/update-discussion.dto';
import { Discussion } from '../entities/discussion.entity';
import { WorkModule } from '../entities/work-module.entity';
import { Component } from '../entities/component.entity';
import { DiscussionMessage } from '../entities/discussion_message.entity';
import { DiscussionReadState } from '../entities/discussion_read_state.entity';
import { Tag } from '../entities/tag.entity';
import { DiscussionListFilters } from '../interfaces/discussion-list-filters.interface';
import { DiscussionListResponse } from '../interfaces/discussion-list-response.interface';
import { DiscussionStatus } from '../enums/discussion-status.enum';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';
import { WorkspaceNotificationService } from './workspace-notification.service';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { WorkspaceOrganizationAccessService } from './workspace-organization-access.service';

@Injectable()
export class DiscussionService {
	private readonly logger = new Logger(DiscussionService.name);

	constructor(
		@InjectRepository(Discussion)
		private readonly discussionRepository: Repository<Discussion>,
		@InjectRepository(Membership)
		private readonly membershipRepository: Repository<Membership>,
		private readonly dataSource: DataSource,
		private readonly workflowNotificationService: WorkspaceNotificationService,
		private readonly orgAccessService: WorkspaceOrganizationAccessService,
	) {}

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

	private assertCanManageDiscussion(membership: Membership): void {
		this.orgAccessService.assertCanManageDiscussion(membership);
	}

	private assertCanEditDiscussion(user: User, discussion: Discussion, membership: Membership): void {
		const ownerId = discussion.createdBy?.id;
		if (ownerId === user.id) return;

		if (
			membership.role === OrganizationRole.OWNER ||
			membership.role === OrganizationRole.ADMIN ||
			membership.role === OrganizationRole.DEVELOPER
		) {
			return;
		}

		throw new ForbiddenException('You can only modify your own discussions');
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
		if (limit < 1) {
			throw new BadRequestException('limit must be greater than 0');
		}
		return {
			page,
			limit: Math.min(limit, 100),
		};
	}

	/**
	 * Valida en una sola consulta (UNION ALL) que los ids de modulos, componentes y tags existan
	 * en la organizacion. Reemplaza a una consulta `findBy({ id: In(ids), organizationId })` por
	 * grupo, con los mismos errores y en el mismo orden (Module, Component, Tag).
	 */
	private async assertContextIdsBelongToOrganization(
		manager: EntityManager,
		organizationId: string,
		request: { moduleIds?: string[]; componentIds?: string[]; tagIds?: string[] },
	): Promise<void> {
		const groups = [
			{ entityName: 'Module', target: WorkModule, ids: request.moduleIds ?? [] },
			{ entityName: 'Component', target: Component, ids: request.componentIds ?? [] },
			{ entityName: 'Tag', target: Tag, ids: request.tagIds ?? [] },
		].filter((group) => group.ids.length > 0);
		if (!groups.length) return;

		const driver = manager.connection.driver;
		const parameters: unknown[] = [organizationId];
		const selects = groups.map((group, index) => {
			const metadata = manager.connection.getMetadata(group.target);
			const organizationColumn = metadata.findColumnWithPropertyName('organizationId')!.databaseName;
			parameters.push([...new Set(group.ids)]);
			return `SELECT ${index} AS "group", id FROM ${driver.escape(metadata.tableName)} WHERE ${driver.escape(organizationColumn)} = $1 AND id = ANY($${parameters.length}::uuid[])`;
		});

		const rows: Array<{ group: number; id: string }> = await manager.query(
			selects.join(' UNION ALL '),
			parameters,
		);
		const foundIdsByGroup = groups.map(() => new Set<string>());
		for (const row of rows) foundIdsByGroup[Number(row.group)].add(row.id);

		groups.forEach((group, index) => {
			const uniqueIds = [...new Set(group.ids)];
			if (uniqueIds.length !== group.ids.length) {
				throw new BadRequestException(`${group.entityName} ids contain duplicates`);
			}
			const missingIds = uniqueIds.filter((id) => !foundIdsByGroup[index].has(id));
			if (missingIds.length) {
				throw new NotFoundException(`${group.entityName} not found: ${missingIds.join(', ')}`);
			}
		});
	}

	private async findDiscussionWithRelations(
		organizationId: string,
		id: string,
	): Promise<Discussion | null> {
		// `find` en lugar de `findOne`: con relaciones, el `take: 1` de `findOne` obliga a TypeORM
		// a emitir antes un `SELECT DISTINCT` de ids (un viaje extra). `id` es la clave primaria,
		// por lo que el resultado tiene como maximo una Discussion.
		const [discussion] = await this.discussionRepository.find({
			where: { id, organizationId },
			relations: ['createdBy', 'workModules', 'components', 'tags', 'assignedDevelopers'],
		});
		return discussion ?? null;
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
		organizationId: string,
		discussionIds: string[],
		currentUserId: string,
	): Promise<Map<string, boolean>> {
		if (!discussionIds.length) return new Map<string, boolean>();

		const queryBuilder = this.discussionRepository
			.createQueryBuilder('discussion')
			.select('discussion.id', 'id')
			.where('discussion.organization_id = :organizationId', { organizationId })
			.andWhere('discussion.id IN (:...discussionIds)', { discussionIds });

		const unreadConditionSql = this.applyUnreadJoins(queryBuilder, currentUserId);

		const rows = await queryBuilder
			.addSelect(`CASE WHEN ${unreadConditionSql} THEN true ELSE false END`, 'isUnread')
			.getRawMany<{ id: string; isUnread: boolean | string | number }>();

		return new Map(rows.map((row) => [row.id, this.parseRawBoolean(row.isUnread)]));
	}

	/**
	 * Marca la Discussion como leida para `userId` hasta su ultima actividad visible (reloj de la
	 * base), sin retroceder un `last_read_at` posterior. No usa la hora de la aplicacion, que puede
	 * estar desfasada respecto de la base, ni `now()`: cualquier actividad todavia no confirmada se
	 * escribe bajo el bloqueo de actividad (ver `withActivityLock`) con una hora posterior a toda la
	 * actividad ya confirmada, asi que sigue no leida. Devuelve el `last_read_at` resultante, o
	 * `null` si la Discussion no existe en la organizacion.
	 */
	private async markReadUpToCurrentActivity(
		manager: EntityManager,
		organizationId: string,
		discussionId: string,
		userId: string,
	): Promise<Date | null> {
		const rows: Array<{ last_read_at: Date }> = await manager.query(
			`
				INSERT INTO public.discussion_read_states (discussion_id, user_id, last_read_at)
				SELECT d.id, $2, ${DiscussionService.activityAtSql()}
				FROM public.discussions d
				WHERE d.id = $1 AND d.organization_id = $3
				ON CONFLICT (discussion_id, user_id)
				DO UPDATE SET
					last_read_at = GREATEST(discussion_read_states.last_read_at, EXCLUDED.last_read_at),
					updated_at = now()
				RETURNING last_read_at
			`,
			[discussionId, userId, organizationId],
		);
		return rows[0]?.last_read_at ?? null;
	}

	/**
	 * Ultima actividad de la Discussion `d`: misma expresion que `buildUnreadConditionSql`.
	 */
	private static activityAtSql(): string {
		return `GREATEST(d.updated_at, COALESCE((SELECT MAX(m.created_at) FROM public.discussion_messages m WHERE m.discussion_id = d.id), d.created_at))`;
	}

	/**
	 * Ejecuta `work` en una transaccion que primero bloquea la fila de la Discussion
	 * (`FOR NO KEY UPDATE`, acotado por organizacion; 404 si no existe en ella). Toda escritura que
	 * genera actividad (cambio de `title`/`type`/`status`, mensaje nuevo) pasa por aqui, de modo que
	 * esas escrituras quedan serializadas por Discussion. Como el bloqueo se toma en una sentencia
	 * previa, las sentencias de `work` (READ COMMITTED) ven toda la actividad confirmada antes, y la
	 * actividad posterior se escribe despues del COMMIT con una hora mayor. Asi, mantener leido un
	 * cambio propio nunca oculta actividad de terceros concurrente. No bloquea las inserciones de
	 * otras tablas que solo referencian la Discussion (FOR KEY SHARE de las claves foraneas).
	 */
	async withActivityLock<T>(
		organizationId: string,
		discussionId: string,
		work: (manager: EntityManager, discussion: Discussion) => Promise<T>,
		manager?: EntityManager,
	): Promise<T> {
		const run = async (transactionManager: EntityManager): Promise<T> => {
			const discussion = await transactionManager.getRepository(Discussion).findOne({
				where: { id: discussionId, organizationId },
				lock: { mode: 'for_no_key_update' },
			});
			if (!discussion) throw new NotFoundException('Discussion not found');
			return work(transactionManager, discussion);
		};
		return manager ? run(manager) : this.dataSource.transaction(run);
	}

	/**
	 * Inserta un mensaje de `authorId` y, en la misma sentencia, mantiene leida la Discussion para el
	 * autor: mueve su `last_read_at` hasta el `created_at` del mensaje solo si ya habia leido toda la
	 * actividad anterior (la subconsulta de actividad no ve el INSERT de la misma sentencia, asi que
	 * no cuenta el propio mensaje). Si habia actividad de terceros sin leer, la Discussion sigue no
	 * leida; sin read-state previo ("nunca leida") no se crea uno.
	 * Debe ejecutarse dentro de `withActivityLock`: `created_at` es la hora de esta sentencia,
	 * posterior a la toma del bloqueo y por lo tanto a toda la actividad ya confirmada.
	 */
	async insertMessageAsAuthor(
		manager: EntityManager,
		discussionId: string,
		authorId: string,
		message: Pick<
			DiscussionMessage,
			'type' | 'content' | 'fileUrl' | 'fileName' | 'mimeType' | 'fileSize' | 'cloudinaryPublicId'
		>,
	): Promise<{ id: string; createdAt: Date; updatedAt: Date }> {
		const rows: Array<{ id: string; created_at: Date; updated_at: Date }> = await manager.query(
			`
				WITH own AS (
					INSERT INTO public.discussion_messages (
						discussion_id, author_id, type, content, file_url, file_name, mime_type, file_size,
						cloudinary_public_id, created_at, updated_at
					)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, statement_timestamp(), statement_timestamp())
					RETURNING id, created_at, updated_at
				),
				author_read AS (
					UPDATE public.discussion_read_states rs
					SET last_read_at = own.created_at, updated_at = now()
					FROM own, public.discussions d
					WHERE d.id = $1
						AND rs.discussion_id = d.id
						AND rs.user_id = $2
						AND rs.last_read_at < own.created_at
						AND rs.last_read_at >= ${DiscussionService.activityAtSql()}
				)
				SELECT id, created_at, updated_at FROM own
			`,
			[
				discussionId,
				authorId,
				message.type,
				message.content,
				message.fileUrl,
				message.fileName,
				message.mimeType,
				message.fileSize,
				message.cloudinaryPublicId,
			],
		);
		const [inserted] = rows;
		return { id: inserted.id, createdAt: inserted.created_at, updatedAt: inserted.updated_at };
	}

	/**
	 * UPDATE de `title`/`type`/`status` hecho por `actorId`, que ademas evita que el propio cambio
	 * deje la Discussion no leida para el actor. Debe ejecutarse dentro de `withActivityLock`.
	 * - escribe solo si algun valor cambia (y solo entonces actualiza `updated_at`, con la hora de
	 *   esta sentencia, posterior a la toma del bloqueo);
	 * - mueve `last_read_at` del actor hasta el nuevo `updated_at` solo si ya habia leido toda la
	 *   actividad previa al cambio. Si habia cambios o mensajes de terceros sin leer, no los oculta.
	 * El resto de los usuarios no se toca: el cambio sigue siendo actividad no leida para ellos.
	 */
	private async updateColumnsAsActor(
		manager: EntityManager,
		organizationId: string,
		discussionId: string,
		actorId: string,
		changes: Partial<Pick<Discussion, 'title' | 'type' | 'status'>>,
	): Promise<void> {
		const columnByProperty = { title: 'title', type: 'type', status: 'status' } as const;
		const parameters: unknown[] = [discussionId, organizationId, actorId];
		const assignments: string[] = [];
		const differences: string[] = [];
		for (const property of Object.keys(columnByProperty) as Array<keyof typeof columnByProperty>) {
			if (changes[property] === undefined) continue;
			parameters.push(changes[property]);
			const column = columnByProperty[property];
			assignments.push(`${column} = $${parameters.length}`);
			differences.push(`d.${column} IS DISTINCT FROM $${parameters.length}`);
		}
		if (!assignments.length) return;

		await manager.query(
			`
				WITH target AS (
					SELECT d.id, ${DiscussionService.activityAtSql()} AS previous_activity_at
					FROM public.discussions d
					WHERE d.id = $1 AND d.organization_id = $2
				),
				changed AS (
					UPDATE public.discussions d
					SET ${assignments.join(', ')}, updated_at = statement_timestamp()
					FROM target
					WHERE d.id = target.id AND (${differences.join(' OR ')})
					RETURNING d.id, d.updated_at
				)
				UPDATE public.discussion_read_states rs
				SET last_read_at = changed.updated_at, updated_at = now()
				FROM changed, target
				WHERE rs.discussion_id = changed.id
					AND rs.user_id = $3
					AND rs.last_read_at >= target.previous_activity_at
					AND rs.last_read_at < changed.updated_at
			`,
			parameters,
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

	private sanitizeDiscussionListAssignees(discussions: Discussion[]): Discussion[] {
		return discussions.map((discussion) => this.sanitizeDiscussionAssignees(discussion));
	}

	private async resolveAssignableDevelopersByIds(
		organizationId: string,
		ids: string[],
	): Promise<User[]> {
		if (!ids.length) return [];

		const uniqueIds = [...new Set(ids)];
		if (uniqueIds.length !== ids.length) {
			throw new BadRequestException('developerUserIds contains duplicates');
		}

		const memberships = await this.membershipRepository.find({
			where: {
				organization: { id: organizationId },
				user: { id: In(uniqueIds) },
			},
			relations: ['user'],
		});

		if (memberships.length !== uniqueIds.length) {
			const foundIds = new Set(memberships.map((membership) => membership.user.id));
			const missing = uniqueIds.filter((id) => !foundIds.has(id));
			throw new BadRequestException(
				`Users not assignable as developers: ${missing.join(', ')}`,
			);
		}

		const membershipByUserId = new Map(
			memberships.map((membership) => [membership.user.id, membership]),
		);

		for (const userId of uniqueIds) {
			const membership = membershipByUserId.get(userId)!;
			if (membership.status !== MembershipStatus.ACTIVE) {
				throw new BadRequestException(`Users not assignable as developers: ${userId}`);
			}
			this.orgAccessService.assertCanReceiveAssignments(membership);
		}

		return uniqueIds.map((id) => membershipByUserId.get(id)!.user);
	}

	async createDiscussion(
		organizationId: string,
		dto: DiscussionCreateDto,
		user: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(user.id, organizationId);
		const title = this.normalizeTitle(dto.title);
		const initialMessageContent = this.normalizeInitialMessageContent(
			dto.initialMessageContent,
		);

		// Validacion de contexto en una sola consulta y antes de abrir la transaccion (lectura sin
		// bloqueo, como la que antes se hacia dentro): la transaccion solo contiene escrituras.
		await this.assertContextIdsBelongToOrganization(this.dataSource.manager, organizationId, dto);

		const discussionId = await this.dataSource.transaction(async (manager) => {
			const discussionRepository = manager.getRepository(Discussion);
			const discussionMessageRepository = manager.getRepository(DiscussionMessage);

			const discussion = discussionRepository.create({
				organizationId,
				organization: { id: organizationId } as any,
				type: dto.type,
				title,
				status: DiscussionStatus.NEW,
				createdBy: { id: user.id } as User,
				workModules: (dto.moduleIds ?? []).map((id) => ({ id }) as WorkModule),
				components: (dto.componentIds ?? []).map((id) => ({ id }) as Component),
				tags: (dto.tagIds ?? []).map((id) => ({ id }) as Tag),
			});

			const saved = await discussionRepository.save(discussion);

			const initialMessage = discussionMessageRepository.create({
				discussion: { id: saved.id } as Discussion,
				author: { id: user.id } as User,
				type: DiscussionMessageType.TEXT,
				content: initialMessageContent,
			});
			await discussionMessageRepository.save(initialMessage);
			// El creador queda leido hasta la creacion (reloj de la base, el mismo que fija
			// `created_at` de la Discussion y de su mensaje inicial en esta transaccion).
			await this.markReadUpToCurrentActivity(manager, organizationId, saved.id, user.id);

			return saved.id;
		});

		// Reutiliza la membership ACTIVE validada al inicio de esta misma operacion.
		const discussion = await this.findDiscussionByIdForMembership(
			organizationId,
			discussionId,
			membership,
		);

		try {
			await this.workflowNotificationService.notifyDiscussionCreated(discussion, user);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Push notify failed for discussion creation discussionId=${discussion.id} reason=${reason}`,
			);
		}

		return discussion;
	}

	async findDiscussions(
		organizationId: string,
		filters: DiscussionListFilters,
		currentUser: User,
	): Promise<DiscussionListResponse> {
		await this.orgAccessService.requireActiveMembership(currentUser.id, organizationId);
		const { page, limit } = this.normalizePagination(filters.page, filters.limit);
		const moduleIds = this.parseIdsCsv(filters.moduleIds, 'moduleIds');
		const componentIds = this.parseIdsCsv(filters.componentIds, 'componentIds');
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
			.leftJoin('discussion.workModules', 'moduleFilter')
			.leftJoin('discussion.components', 'componentFilter')
			.leftJoin('discussion.tags', 'tagFilter')
			.leftJoin('discussion.assignedDevelopers', 'assignedDeveloperFilter')
			.where('discussion.organization_id = :organizationId', { organizationId });

		const unreadConditionSql = this.applyUnreadJoins(queryBuilder, currentUser.id);

		if (filters.type) {
			queryBuilder.andWhere('discussion.type = :type', { type: filters.type });
		}

		if (filters.status) {
			queryBuilder.andWhere('discussion.status = :status', { status: filters.status });
		}

		if (moduleIds.length > 0) {
			queryBuilder.andWhere('moduleFilter.id IN (:...moduleIds)', { moduleIds });
		}

		if (componentIds.length > 0) {
			queryBuilder.andWhere('componentFilter.id IN (:...componentIds)', { componentIds });
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
			queryBuilder.andWhere('assignedDeveloperFilter.id = :assignedDeveloperId', {
				assignedDeveloperId: filters.assignedDeveloperId,
			});
		}

		if (filters.unread) {
			queryBuilder.andWhere(unreadConditionSql);
		}

		const total = await queryBuilder.clone().select('discussion.id').distinct(true).getCount();

		const discussionRows = await queryBuilder
			.clone()
			.select('discussion.id', 'id')
			.addSelect('discussion.createdAt', 'createdAt')
			.addSelect(`CASE WHEN ${unreadConditionSql} THEN true ELSE false END`, 'isUnread')
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
					where: { id: In(discussionIds), organizationId },
					relations: ['createdBy', 'workModules', 'components', 'tags', 'assignedDevelopers'],
					order: { createdAt: 'DESC' },
			  })
			: [];

		const dataById = new Map(data.map((discussion) => [discussion.id, discussion]));
		const orderedData = discussionIds
			.map((discussionId) => dataById.get(discussionId))
			.filter((discussion): discussion is Discussion => Boolean(discussion));
		const hydratedData = this.attachUnreadFlags(orderedData, unreadByDiscussionId);

		return {
			data: this.sanitizeDiscussionListAssignees(hydratedData),
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		};
	}

	async findDiscussionById(organizationId: string, id: string): Promise<Discussion> {
		const discussion = await this.findDiscussionWithRelations(organizationId, id);
		if (!discussion) throw new NotFoundException('Discussion not found');
		return this.sanitizeDiscussionAssignees(discussion);
	}

	/**
	 * Valida membership ACTIVE y que la Discussion exista en la organizacion, devolviendo solo sus
	 * columnas (sin relaciones ni estado de lectura). Mismos errores que `findDiscussionByIdForUser`
	 * para operaciones que no necesitan la Discussion hidratada.
	 */
	async requireDiscussionForUser(
		organizationId: string,
		id: string,
		user: User,
	): Promise<Discussion> {
		await this.orgAccessService.requireActiveMembership(user.id, organizationId);
		const discussion = await this.discussionRepository.findOne({
			where: { id, organizationId },
		});
		if (!discussion) throw new NotFoundException('Discussion not found');
		return discussion;
	}

	async findDiscussionByIdForUser(
		organizationId: string,
		id: string,
		user: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(user.id, organizationId);
		return this.findDiscussionByIdForMembership(organizationId, id, membership);
	}

	/**
	 * Igual que `findDiscussionByIdForUser`, pero reutiliza la membership que el llamador ya
	 * obtuvo con `requireActiveMembership` en la misma operacion, en lugar de volver a consultarla.
	 * Rechaza una membership que no este ACTIVE o que sea de otra organizacion.
	 */
	async findDiscussionByIdForMembership(
		organizationId: string,
		id: string,
		membership: Membership,
	): Promise<Discussion> {
		if (
			membership.status !== MembershipStatus.ACTIVE ||
			membership.organization?.id !== organizationId ||
			!membership.user?.id
		) {
			throw new ForbiddenException('Membership is not active');
		}

		const discussion = await this.findDiscussionById(organizationId, id);
		const unreadByDiscussionId = await this.findUnreadByDiscussionIds(
			organizationId,
			[id],
			membership.user.id,
		);
		discussion.isUnread = unreadByDiscussionId.get(id) ?? false;
		return discussion;
	}

	async markDiscussionAsRead(
		organizationId: string,
		discussionId: string,
		user: User,
	): Promise<{ discussionId: string; lastReadAt: string; isUnread: false }> {
		await this.orgAccessService.requireActiveMembership(user.id, organizationId);
		// El UPSERT esta acotado por organizacion: si la Discussion no existe en ella no escribe
		// nada y responde 404, como la busqueda previa que hacia antes.
		const lastReadAt = await this.markReadUpToCurrentActivity(
			this.dataSource.manager,
			organizationId,
			discussionId,
			user.id,
		);
		if (!lastReadAt) throw new NotFoundException('Discussion not found');

		return {
			discussionId,
			lastReadAt: lastReadAt.toISOString(),
			isUnread: false,
		};
	}

	async updateDiscussion(
		organizationId: string,
		id: string,
		dto: DiscussionUpdateDto,
		user: User,
	): Promise<Discussion> {
		let didChangeContext = false;
		const membership = await this.orgAccessService.requireActiveMembership(user.id, organizationId);

		// Lectura sin bloqueo (READ COMMITTED), igual que la que antes se hacia dentro de la
		// transaccion: el estado actual solo se usa para permisos y para calcular las diferencias.
		const [discussion] = await this.discussionRepository.find({
			where: { id, organizationId },
			relations: ['createdBy', 'workModules', 'components', 'tags'],
		});

		if (!discussion) throw new NotFoundException('Discussion not found');
		this.assertCanEditDiscussion(user, discussion, membership);

		// Mismo criterio que `save()`: solo se escriben las columnas cuyo valor cambia, y solo esas
		// escrituras actualizan `updated_at` (cambiar unicamente relaciones no lo modifica).
		const columnChanges: Partial<Pick<Discussion, 'title' | 'type'>> = {};
		if (dto.title !== undefined) {
			const title = this.normalizeTitle(dto.title);
			if (title !== discussion.title) columnChanges.title = title;
		}

		if (dto.type !== undefined && dto.type !== discussion.type) {
			columnChanges.type = dto.type;
		}

		if (dto.moduleIds !== undefined || dto.componentIds !== undefined || dto.tagIds !== undefined) {
			this.assertCanManageDiscussion(membership);
		}

		await this.assertContextIdsBelongToOrganization(this.dataSource.manager, organizationId, dto);

		const relationChanges: Array<{
			relation: 'workModules' | 'components' | 'tags';
			added: string[];
			removed: string[];
		}> = [];
		const collectRelationChange = (
			relation: 'workModules' | 'components' | 'tags',
			current: Array<{ id: string }>,
			nextIds: string[],
		): boolean => {
			const currentIds = new Set(current.map((item) => item.id));
			const nextIdSet = new Set(nextIds);
			const added = [...nextIdSet].filter((relatedId) => !currentIds.has(relatedId));
			const removed = [...currentIds].filter((relatedId) => !nextIdSet.has(relatedId));
			if (!added.length && !removed.length) return false;
			relationChanges.push({ relation, added, removed });
			return true;
		};

		if (dto.moduleIds !== undefined) {
			didChangeContext =
				collectRelationChange('workModules', discussion.workModules ?? [], dto.moduleIds) ||
				didChangeContext;
		}

		if (dto.componentIds !== undefined) {
			didChangeContext =
				collectRelationChange('components', discussion.components ?? [], dto.componentIds) ||
				didChangeContext;
		}

		if (dto.tagIds !== undefined) {
			collectRelationChange('tags', discussion.tags ?? [], dto.tagIds);
			didChangeContext = true;
		}

		// Escrituras dirigidas (UPDATE de columnas e INSERT/DELETE en las tablas intermedias) en
		// lugar de `save()`, que recargaba la Discussion y sus relaciones antes de escribir.
		// Si hay mas de una sentencia se ejecutan juntas en una transaccion; una sola es atomica.
		// Un cambio de columnas genera actividad: va primero, bajo el bloqueo de actividad (ver
		// `withActivityLock`), que exige transaccion aunque sea la unica escritura.
		const hasColumnChanges = Object.keys(columnChanges).length > 0;
		const writes: Array<(manager: EntityManager) => Promise<unknown>> = [];
		if (hasColumnChanges) {
			writes.push((manager) =>
				this.withActivityLock(
					organizationId,
					id,
					(lockedManager) =>
						this.updateColumnsAsActor(lockedManager, organizationId, id, user.id, columnChanges),
					manager,
				),
			);
		}
		for (const change of relationChanges) {
			const relationQuery = (manager: EntityManager) =>
				manager.createQueryBuilder().relation(Discussion, change.relation).of(id);
			if (change.removed.length) {
				writes.push((manager) => relationQuery(manager).remove(change.removed));
			}
			if (change.added.length) {
				writes.push((manager) => relationQuery(manager).add(change.added));
			}
		}

		if (writes.length > 1 || hasColumnChanges) {
			await this.dataSource.transaction(async (manager) => {
				for (const write of writes) await write(manager);
			});
		} else if (writes.length === 1) {
			await writes[0](this.dataSource.manager);
		}

		const discussionId = discussion.id;
		const updatedDiscussion = await this.findDiscussionById(organizationId, discussionId);

		if (didChangeContext) {
			try {
				await this.workflowNotificationService.syncDiscussionContextChanged(
					organizationId,
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
		organizationId: string,
		id: string,
		status: DiscussionStatus,
		user: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(user.id, organizationId);
		this.assertCanManageDiscussion(membership);

		// Bajo el bloqueo de actividad y acotado por organizacion (404 si la Discussion no existe en
		// ella). Solo escribe (y actualiza `updated_at`) si el status cambia, igual que `save()`, que
		// no emitia UPDATE cuando el valor era el mismo, y mantiene leida la Discussion para el actor
		// sin ocultar actividad de terceros (ver `withActivityLock` y `updateColumnsAsActor`).
		await this.withActivityLock(organizationId, id, (manager) =>
			this.updateColumnsAsActor(manager, organizationId, id, user.id, { status }),
		);

		const updatedDiscussion = await this.findDiscussionById(organizationId, id);

		try {
			await this.workflowNotificationService.notifyDiscussionStatusChanged(updatedDiscussion, user);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Push notify failed for discussion status change discussionId=${id} reason=${reason}`,
			);
		}

		return updatedDiscussion;
	}

	async addDeveloperAssignments(
		organizationId: string,
		discussionId: string,
		developerUserIds: string[],
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(actor.id, organizationId);
		this.assertCanManageDiscussion(membership);

		const discussion = await this.findDiscussionWithRelations(organizationId, discussionId);
		if (!discussion) throw new NotFoundException('Discussion not found');

		const developersToAdd = await this.resolveAssignableDevelopersByIds(
			organizationId,
			developerUserIds,
		);

		const existingById = new Set(
			(discussion.assignedDevelopers ?? []).map((developer) => developer.id),
		);

		const newDevelopers = developersToAdd.filter((developer) => !existingById.has(developer.id));

		discussion.assignedDevelopers = [...(discussion.assignedDevelopers ?? []), ...newDevelopers];

		await this.discussionRepository.save(discussion);
		const updatedDiscussion = await this.findDiscussionById(organizationId, discussionId);

		if (newDevelopers.length > 0) {
			try {
				await this.workflowNotificationService.notifyDiscussionAssignmentChanged(updatedDiscussion, actor);
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
		organizationId: string,
		discussionId: string,
		developerUserIds: string[],
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(actor.id, organizationId);
		this.assertCanManageDiscussion(membership);

		const discussion = await this.findDiscussionWithRelations(organizationId, discussionId);
		if (!discussion) throw new NotFoundException('Discussion not found');
		const previousDeveloperIds = new Set(
			(discussion.assignedDevelopers ?? []).map((developer) => developer.id),
		);

		const nextDevelopers = await this.resolveAssignableDevelopersByIds(
			organizationId,
			developerUserIds,
		);
		discussion.assignedDevelopers = nextDevelopers;

		await this.discussionRepository.save(discussion);
		const nextDeveloperIds = new Set(nextDevelopers.map((developer) => developer.id));
		const didChange =
			previousDeveloperIds.size !== nextDeveloperIds.size ||
			[...previousDeveloperIds].some((developerId) => !nextDeveloperIds.has(developerId));

		const updatedDiscussion = await this.findDiscussionById(organizationId, discussionId);

		if (didChange) {
			try {
				await this.workflowNotificationService.notifyDiscussionAssignmentChanged(updatedDiscussion, actor);
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
		organizationId: string,
		discussionId: string,
		developerUserId: string,
		actor: User,
	): Promise<Discussion> {
		const membership = await this.orgAccessService.requireActiveMembership(actor.id, organizationId);
		this.assertCanManageDiscussion(membership);

		const discussion = await this.findDiscussionWithRelations(organizationId, discussionId);
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
		const updatedDiscussion = await this.findDiscussionById(organizationId, discussionId);

		try {
			await this.workflowNotificationService.notifyDiscussionAssignmentChanged(updatedDiscussion, actor);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Push notify failed for assignment remove discussionId=${discussionId} reason=${reason}`,
			);
		}

		return updatedDiscussion;
	}

	async findAssignableDevelopers(
		organizationId: string,
		user: User,
	): Promise<Array<{ id: string; fullName: string; email: string }>> {
		await this.orgAccessService.requireActiveMembership(user.id, organizationId);
		const memberships = await this.membershipRepository.find({
			where: {
				organization: { id: organizationId },
			},
			relations: ['user'],
			order: { createdAt: 'ASC' },
		});

		const users = memberships
			.filter((membership) => membership.status === MembershipStatus.ACTIVE)
			.filter((membership) =>
				[
					OrganizationRole.DEVELOPER,
					OrganizationRole.ADMIN,
					OrganizationRole.OWNER,
				].includes(membership.role),
			)
			.filter((membership) => membership.user.isActive)
			.map((membership) => ({
				id: membership.user.id,
				fullName: membership.user.fullName,
				email: membership.user.email,
			}));

		users.sort((a, b) => a.fullName.localeCompare(b.fullName));
		return users;
	}
}
