import { Injectable, Logger } from '@nestjs/common';
import { User } from '../../auth/entities/user.entity';
import { Discussion } from '../entities/discussion.entity';
import { DiscussionMessage } from '../entities/discussion_message.entity';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';
import { DiscussionStatus } from '../enums/discussion-status.enum';
import { UserDeviceService } from './user-device.service';
import { WorkspaceNotificationPayload, WorkspacePushNotificationService } from './workspace-push-notification.service';

/**
 * Datos comunes a todos los push de Discussions. `organizationId` es siempre la organization de la
 * Discussion, la misma que se usa para elegir destinatarios. `recipientUserId` lo agrega
 * `WorkspacePushNotificationService` por dispositivo.
 */
type DiscussionPushData = {
	type: string;
	organizationId: string;
	discussionId: string;
} & Record<string, string>;

@Injectable()
export class WorkspaceNotificationService {
	private readonly logger = new Logger(WorkspaceNotificationService.name);

	private readonly statusLabelMap: Record<DiscussionStatus, string> = {
		[DiscussionStatus.NEW]: 'Entrada',
		[DiscussionStatus.REVIEW]: 'Revisión',
		[DiscussionStatus.IN_PROGRESS]: 'Trabajando',
		[DiscussionStatus.RESOLVED]: 'Resuelto',
	};

	constructor(
		private readonly userDeviceService: UserDeviceService,
		private readonly notificationService: WorkspacePushNotificationService,
	) { }

	private async dispatchToActiveUsers(
		organizationId: string,
		actorUserId: string,
		eventType: string,
		discussionId: string,
		payload: WorkspaceNotificationPayload,
	): Promise<void> {
		const invalidKey = Object.entries(payload.data ?? {}).find(
			([, value]) => typeof value !== 'string' || value.length === 0,
		)?.[0];
		if (invalidKey || payload.data?.organizationId !== organizationId) {
			// Un valor vacio o no string haria que Firebase rechace el mensaje completo.
			this.logger.error(
				`Workspace push event=${eventType} discussionId=${discussionId} skipped: invalid data field ${invalidKey ?? 'organizationId'}`,
			);
			return;
		}

		const devices = await this.userDeviceService.findPushRecipientsForOrganization(
			organizationId,
			actorUserId,
		);

		if (!devices.length) {
			this.logger.log(
				`Workspace push event=${eventType} organizationId=${organizationId} discussionId=${discussionId} recipients=0 devices=0`,
			);
			return;
		}

		const result = await this.notificationService.sendToDevices(devices, payload);

		this.logger.log(
			`Workspace push event=${eventType} organizationId=${organizationId} discussionId=${discussionId} recipients=${result.totalUsers} devices=${result.totalDevices} successCount=${result.successCount} failureCount=${result.failureCount} removedInvalidTokens=${result.removedInvalidTokens}`,
		);
	}

	/**
	 * La operacion funcional ya se confirmo: el push es de mejor esfuerzo y no debe demorar la
	 * respuesta HTTP (consulta de destinatarios + envio a Firebase + limpieza de tokens). Se lanza
	 * sin esperar y sus errores se registran aca. La Promise devuelta se resuelve de inmediato, asi
	 * los llamadores conservan su `await` y su manejo de errores.
	 * No garantiza la entrega: el envio vive solo en memoria. Si el proceso termina (caida, deploy
	 * con SIGTERM, reinicio) antes de que Firebase acepte los mensajes, el push se pierde sin
	 * reintento. Ver "Garantias de entrega" en docs/workspace-endpoints.md.
	 */
	private dispatchInBackground(
		organizationId: string,
		actorUserId: string,
		eventType: string,
		discussionId: string,
		payload: WorkspaceNotificationPayload,
	): Promise<void> {
		void this.dispatchToActiveUsers(
			organizationId,
			actorUserId,
			eventType,
			discussionId,
			payload,
		).catch((error: unknown) => {
			const code = (error as { code?: string } | null)?.code ?? 'unknown';
			const reason = error instanceof Error ? error.message.slice(0, 300) : 'unknown';
			this.logger.warn(
				`Workspace push event=${eventType} organizationId=${organizationId} discussionId=${discussionId} failed code=${code} reason=${reason}`,
			);
		});

		return Promise.resolve();
	}

	private buildVisiblePayload(
		title: string,
		body: string,
		data: DiscussionPushData,
	): WorkspaceNotificationPayload {
		return {
			kind: 'VISIBLE',
			title,
			body,
			data,
		};
	}

	private buildSilentPayload(data: DiscussionPushData): WorkspaceNotificationPayload {
		return {
			kind: 'DATA_ONLY',
			data,
		};
	}

	notifyDiscussionCreated(
		discussion: Discussion,
		actor: User,
	): Promise<void> {
		const payload = this.buildVisiblePayload(
			'Nueva discusión',
			`${actor.fullName} creó: ${discussion.title}`,
			{
				type: 'DISCUSSION_CREATED',
				organizationId: discussion.organizationId,
				discussionId: discussion.id,
			},
		);

		return this.dispatchInBackground(
			discussion.organizationId,
			actor.id,
			'DISCUSSION_CREATED',
			discussion.id,
			payload,
		);
	}

	private getMessagePresentation(type: DiscussionMessageType): {
		title: string;
		bodySuffix: string;
	} {
		switch (type) {
			case DiscussionMessageType.TEXT:
				return {
					title: 'Nuevo mensaje',
					bodySuffix: 'respondió en',
				};
			case DiscussionMessageType.IMAGE:
				return {
					title: 'Nueva imagen',
					bodySuffix: 'agregó una imagen en',
				};
			case DiscussionMessageType.AUDIO:
				return {
					title: 'Nuevo audio',
					bodySuffix: 'agregó un audio en',
				};
			case DiscussionMessageType.VIDEO:
				return {
					title: 'Nuevo video',
					bodySuffix: 'agregó un video en',
				};
			case DiscussionMessageType.FILE:
				return {
					title: 'Nuevo archivo',
					bodySuffix: 'agregó un archivo en',
				};
			default:
				return {
					title: 'Nuevo mensaje',
					bodySuffix: 'respondió en',
				};
		}
	}

	notifyDiscussionMessageCreated(
		discussion: Discussion,
		message: DiscussionMessage,
		actor: User,
	): Promise<void> {
		const presentation = this.getMessagePresentation(message.type);

		const payload = this.buildVisiblePayload(
			presentation.title,
			`${actor.fullName} ${presentation.bodySuffix}: ${discussion.title}`,
			{
				type: 'DISCUSSION_MESSAGE',
				organizationId: discussion.organizationId,
				discussionId: discussion.id,
				messageId: message.id,
				messageType: message.type,
			},
		);

		return this.dispatchInBackground(
			discussion.organizationId,
			actor.id,
			'DISCUSSION_MESSAGE',
			discussion.id,
			payload,
		);
	}

	notifyDiscussionStatusChanged(
		discussion: Discussion,
		actor: User,
	): Promise<void> {
		const visibleStatus = this.statusLabelMap[discussion.status] ?? discussion.status;

		const payload = this.buildVisiblePayload(
			'Estado actualizado',
			`${actor.fullName} movió "${discussion.title}" a ${visibleStatus}`,
			{
				type: 'DISCUSSION_STATUS_CHANGED',
				organizationId: discussion.organizationId,
				discussionId: discussion.id,
				status: discussion.status,
			},
		);

		return this.dispatchInBackground(
			discussion.organizationId,
			actor.id,
			'DISCUSSION_STATUS_CHANGED',
			discussion.id,
			payload,
		);
	}

	notifyDiscussionAssignmentChanged(
		discussion: Discussion,
		actor: User,
	): Promise<void> {
		const payload = this.buildVisiblePayload(
			'Asignación actualizada',
			`${actor.fullName} actualizó responsables de: ${discussion.title}`,
			{
				type: 'DISCUSSION_ASSIGNMENT_CHANGED',
				organizationId: discussion.organizationId,
				discussionId: discussion.id,
			},
		);

		return this.dispatchInBackground(
			discussion.organizationId,
			actor.id,
			'DISCUSSION_ASSIGNMENT_CHANGED',
			discussion.id,
			payload,
		);
	}

	syncMessageUpdated(
		organizationId: string,
		discussionId: string,
		messageId: string,
		actor: User,
	): Promise<void> {
		const payload = this.buildSilentPayload({
			type: 'DISCUSSION_MESSAGE_UPDATED',
			organizationId,
			discussionId,
			messageId,
		});

		return this.dispatchInBackground(
			organizationId,
			actor.id,
			'DISCUSSION_MESSAGE_UPDATED',
			discussionId,
			payload,
		);
	}

	syncMessageDeleted(
		organizationId: string,
		discussionId: string,
		messageId: string,
		actor: User,
	): Promise<void> {
		const payload = this.buildSilentPayload({
			type: 'DISCUSSION_MESSAGE_DELETED',
			organizationId,
			discussionId,
			messageId,
		});

		return this.dispatchInBackground(
			organizationId,
			actor.id,
			'DISCUSSION_MESSAGE_DELETED',
			discussionId,
			payload,
		);
	}

	syncDiscussionContextChanged(
		organizationId: string,
		discussionId: string,
		actor: User,
	): Promise<void> {
		const payload = this.buildSilentPayload({
			type: 'DISCUSSION_CONTEXT_CHANGED',
			organizationId,
			discussionId,
		});

		return this.dispatchInBackground(
			organizationId,
			actor.id,
			'DISCUSSION_CONTEXT_CHANGED',
			discussionId,
			payload,
		);
	}
}
