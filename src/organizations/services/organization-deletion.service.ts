import {
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { MembershipsService } from '../../memberships/services/memberships.service';
import { SecurityVerificationPurpose } from '../../security_verifications/enums/security-verification-purpose.enum';
import { SecurityVerificationsService } from '../../security_verifications/services/security-verifications.service';
import { Discussion } from '../../workspace/entities/discussion.entity';
import { DiscussionMessage } from '../../workspace/entities/discussion_message.entity';
import {
	CloudinaryAttachmentResourceType,
	resolveStoredAttachmentResourceType,
} from '../../workspace/helpers/attachment-resource-type.helper';
import { Organization } from '../entities/organization.entity';

/// Adjunto externo de un mensaje de la organization: lo minimo para borrarlo de Cloudinary
/// despues del commit, cuando la fila del mensaje ya no existe.
interface ExternalAttachment {
	messageId: string;
	publicId: string;
	resourceType: CloudinaryAttachmentResourceType;
}

interface OrganizationDeletionResult {
	attachments: ExternalAttachment[];
	deletedRows: Record<string, number>;
}

const DISCUSSIONS_OF_ORGANIZATION = 'SELECT id FROM discussions WHERE organization_id = $1';
const WORK_MODULES_OF_ORGANIZATION = 'SELECT id FROM work_modules WHERE organization_id = $1';
const COMPONENTS_OF_ORGANIZATION = 'SELECT id FROM components WHERE organization_id = $1';
const TAGS_OF_ORGANIZATION = 'SELECT id FROM tags WHERE organization_id = $1';

/**
 * Borrado explicito de todo lo que pertenece a la organization, hijos antes que padres segun
 * las FKs reales. Cada paso esta scoped por `organization_id` ($1), directo o via discussions /
 * catalogos de la organization. Las FKs ON DELETE CASCADE existentes quedan como red de seguridad,
 * pero no se depende de ellas. Ningun paso borra `users` ni `user_devices` (globales).
 * Las tablas intermedias tambien se limpian por el lado del catalogo: su FK hacia work_modules,
 * components y tags es NO ACTION, asi que un vinculo que apuntara a un catalogo de esta
 * organization desde otra (no deberia existir) bloquearia el borrado.
 */
const ORGANIZATION_DELETION_STEPS: ReadonlyArray<{ table: string; sql: string }> = [
	{
		table: 'discussion_messages',
		sql: `DELETE FROM discussion_messages WHERE discussion_id IN (${DISCUSSIONS_OF_ORGANIZATION})`,
	},
	{
		table: 'discussion_read_states',
		sql: `DELETE FROM discussion_read_states WHERE discussion_id IN (${DISCUSSIONS_OF_ORGANIZATION})`,
	},
	{
		table: 'discussion_assignments',
		sql: `DELETE FROM discussion_assignments WHERE discussion_id IN (${DISCUSSIONS_OF_ORGANIZATION})`,
	},
	{
		table: 'discussion_work_modules',
		sql: `DELETE FROM discussion_work_modules WHERE discussion_id IN (${DISCUSSIONS_OF_ORGANIZATION}) OR work_module_id IN (${WORK_MODULES_OF_ORGANIZATION})`,
	},
	{
		table: 'discussion_components',
		sql: `DELETE FROM discussion_components WHERE discussion_id IN (${DISCUSSIONS_OF_ORGANIZATION}) OR component_id IN (${COMPONENTS_OF_ORGANIZATION})`,
	},
	{
		table: 'discussion_tags',
		sql: `DELETE FROM discussion_tags WHERE discussion_id IN (${DISCUSSIONS_OF_ORGANIZATION}) OR tag_id IN (${TAGS_OF_ORGANIZATION})`,
	},
	{ table: 'discussions', sql: 'DELETE FROM discussions WHERE organization_id = $1' },
	{
		table: 'work_module_components',
		sql: `DELETE FROM work_module_components WHERE work_module_id IN (${WORK_MODULES_OF_ORGANIZATION}) OR component_id IN (${COMPONENTS_OF_ORGANIZATION})`,
	},
	{ table: 'work_modules', sql: 'DELETE FROM work_modules WHERE organization_id = $1' },
	{ table: 'components', sql: 'DELETE FROM components WHERE organization_id = $1' },
	{ table: 'tags', sql: 'DELETE FROM tags WHERE organization_id = $1' },
	{
		table: 'organization_invitations',
		sql: 'DELETE FROM organization_invitations WHERE organization_id = $1',
	},
	{ table: 'memberships', sql: 'DELETE FROM memberships WHERE organization_id = $1' },
	/// Incluye la verificacion recien consumida por esta misma operacion.
	{
		table: 'security_verifications',
		sql: 'DELETE FROM security_verifications WHERE organization_id = $1',
	},
	{ table: 'organizations', sql: 'DELETE FROM organizations WHERE id = $1' },
];

/// Borrados simultaneos en Cloudinary durante la limpieza posterior al commit.
const EXTERNAL_CLEANUP_CONCURRENCY = 5;

const DEADLOCK_DETECTED = '40P01';

/**
 * Eliminacion definitiva de una organization (`DELETE /organizations/:organizationId`).
 * Requiere OWNER ACTIVE y una autorizacion `DELETE_ORGANIZATION` verificada, que se consume en
 * la misma transaccion que borra los datos. Los adjuntos de Cloudinary se borran recien despues
 * del commit: un borrado externo no puede deshacerse con un rollback.
 */
@Injectable()
export class OrganizationDeletionService {
	private readonly logger = new Logger(OrganizationDeletionService.name);

	constructor(
		private readonly membershipsService: MembershipsService,
		private readonly securityVerificationsService: SecurityVerificationsService,
		private readonly cloudinaryService: CloudinaryService,
		private readonly dataSource: DataSource,
	) {}

	async deleteOrganization(organizationId: string, user: User): Promise<void> {
		/// Mismo orden que el resto de recursos tenant: sin Membership -> 403 (no revela si la
		/// organization existe), Membership no ACTIVE -> 403, role distinto de OWNER -> 403.
		const membership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.membershipsService.assertCanDeleteOrganization(membership);

		let result: OrganizationDeletionResult;
		try {
			result = await this.dataSource.transaction((manager) =>
				this.deleteOrganizationData(organizationId, user.id, manager),
			);
		} catch (error) {
			if (this.isDeadlock(error)) {
				throw new ConflictException('Organization was modified concurrently, retry the operation');
			}
			throw error;
		}

		const deletedRows = Object.entries(result.deletedRows)
			.map(([table, count]) => `${table}=${count}`)
			.join(' ');
		this.logger.log(
			`Organization deleted organizationId=${organizationId} deletedBy=${user.id} ${deletedRows} externalAttachments=${result.attachments.length}`,
		);

		/// Despues del commit y sin bloquear la response: la organization ya no existe y un fallo
		/// externo no puede revertirse ni cambiar el resultado. Cada fallo queda registrado.
		void this.deleteExternalAttachments(organizationId, result.attachments).catch((error) => {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.error(
				`External attachment cleanup aborted organizationId=${organizationId} reason=${reason}`,
			);
		});
	}

	private async deleteOrganizationData(
		organizationId: string,
		userId: string,
		manager: EntityManager,
	): Promise<OrganizationDeletionResult> {
		/// FOR UPDATE sobre la organization: serializa DELETEs concurrentes y bloquea todo INSERT
		/// que la referencie (discussions, catalogos, invitations, memberships, verificaciones)
		/// hasta el commit, despues del cual ese INSERT falla por FK. Si otro DELETE gano la
		/// carrera, la fila ya no existe: mismo 403 que un segundo DELETE.
		const organization = await manager
			.getRepository(Organization)
			.createQueryBuilder('organization')
			.select('organization.id')
			.where('organization.id = :organizationId', { organizationId })
			.setLock('pessimistic_write')
			.getOne();

		if (!organization) {
			throw new ForbiddenException('User does not belong to this organization');
		}

		/// UPDATE condicional VERIFIED -> CONSUMED dentro de esta transaccion: si algo posterior
		/// falla y hay rollback, la autorizacion vuelve a quedar VERIFIED.
		const consumed = await this.securityVerificationsService.consumeAuthorization(
			userId,
			organizationId,
			SecurityVerificationPurpose.DELETE_ORGANIZATION,
			manager,
		);

		if (!consumed) {
			throw new ForbiddenException(
				'A verified DELETE_ORGANIZATION security verification is required',
			);
		}

		/// FOR UPDATE sobre las discussions: mensajes, read states, asignaciones y relaciones
		/// nuevas quedan bloqueados (y luego fallan por FK), asi que ningun adjunto subido en
		/// paralelo escapa a la lista que se arma a continuacion.
		await manager
			.getRepository(Discussion)
			.createQueryBuilder('discussion')
			.select('discussion.id')
			.where('discussion.organizationId = :organizationId', { organizationId })
			.setLock('pessimistic_write')
			.getMany();

		const attachments = await this.findExternalAttachments(organizationId, manager);

		const deletedRows: Record<string, number> = {};
		for (const step of ORGANIZATION_DELETION_STEPS) {
			/// En Postgres, un DELETE via `query` devuelve `[filas, cantidad afectada]`.
			const [, affected] = await manager.query<[unknown, number | null]>(step.sql, [
				organizationId,
			]);
			deletedRows[step.table] = affected ?? 0;
		}

		return { attachments, deletedRows };
	}

	/// Mensajes de la organization con archivo en Cloudinary. Se identifican por
	/// `cloudinary_public_id` guardado al subir; nunca se deduce nada desde `file_url`.
	private async findExternalAttachments(
		organizationId: string,
		manager: EntityManager,
	): Promise<ExternalAttachment[]> {
		const messages = await manager
			.getRepository(DiscussionMessage)
			.createQueryBuilder('message')
			.innerJoin('message.discussion', 'discussion')
			.select(['message.id', 'message.type', 'message.mimeType', 'message.cloudinaryPublicId'])
			.where('discussion.organizationId = :organizationId', { organizationId })
			.andWhere('message.cloudinaryPublicId IS NOT NULL')
			.getMany();

		return messages.map((message) => ({
			messageId: message.id,
			publicId: message.cloudinaryPublicId as string,
			resourceType: resolveStoredAttachmentResourceType(message.type, message.mimeType),
		}));
	}

	private async deleteExternalAttachments(
		organizationId: string,
		attachments: ExternalAttachment[],
	): Promise<void> {
		if (attachments.length === 0) return;

		let failed = 0;
		for (let index = 0; index < attachments.length; index += EXTERNAL_CLEANUP_CONCURRENCY) {
			const batch = attachments.slice(index, index + EXTERNAL_CLEANUP_CONCURRENCY);
			const results = await Promise.all(
				batch.map((attachment) => this.deleteExternalAttachment(organizationId, attachment)),
			);
			failed += results.filter((deleted) => !deleted).length;
		}

		if (failed > 0) {
			this.logger.error(
				`External attachment cleanup finished with failures organizationId=${organizationId} total=${attachments.length} failed=${failed}`,
			);
			return;
		}

		this.logger.log(
			`External attachment cleanup finished organizationId=${organizationId} total=${attachments.length}`,
		);
	}

	/// Devuelve `false` si el asset no pudo borrarse. El log de error es el unico registro que
	/// queda del asset huerfano: la fila del mensaje ya no existe.
	private async deleteExternalAttachment(
		organizationId: string,
		attachment: ExternalAttachment,
	): Promise<boolean> {
		const context = `organizationId=${organizationId} messageId=${attachment.messageId} publicId=${attachment.publicId} resourceType=${attachment.resourceType}`;

		try {
			const deleteResult = await this.cloudinaryService.deleteAsset(
				attachment.publicId,
				attachment.resourceType,
			);
			const deleteStatus = (deleteResult?.result ?? '').toLowerCase();
			if (deleteStatus === 'ok' || deleteStatus === 'not found') return true;

			this.logger.error(`Orphaned Cloudinary asset after organization deletion ${context} result=${deleteStatus}`);
			return false;
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.error(`Orphaned Cloudinary asset after organization deletion ${context} reason=${reason}`);
			return false;
		}
	}

	private isDeadlock(error: unknown): boolean {
		if (!(error instanceof QueryFailedError)) return false;
		const driverError = error.driverError as { code?: string } | undefined;
		return driverError?.code === DEADLOCK_DETECTED;
	}
}
