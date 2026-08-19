import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { MembershipStatus } from '../../memberships/enums/membership-status.enum';
import { Discussion } from '../entities/discussion.entity';
import { DiscussionMessage } from '../entities/discussion_message.entity';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';
import { DiscussionStatus } from '../enums/discussion-status.enum';
import { WorkspaceNotificationPayload, WorkspacePushNotificationService } from './workspace-push-notification.service';

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
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private readonly notificationService: WorkspacePushNotificationService,
	) { }

	private async findActiveRecipientUserIdsExcludingActor(
		organizationId: string,
		actorUserId: string,
	): Promise<string[]> {
		const rows = await this.userRepository
			.createQueryBuilder('user')
			.innerJoin('user.userDevices', 'device')
			.innerJoin('user.memberships', 'membership')
			.select('user.id', 'id')
			.where('user.isActive = true')
			.andWhere('membership.organization_id = :organizationId', {
				organizationId,
			})
			.andWhere('membership.status = :activeStatus', {
				activeStatus: MembershipStatus.ACTIVE,
			})
			.andWhere('user.id <> :actorUserId', { actorUserId })
			.distinct(true)
			.getRawMany<{ id: string }>();

		return rows.map((row) => row.id);
	}

	private async dispatchToActiveUsers(
		organizationId: string,
		actorUserId: string,
		eventType: string,
		discussionId: string,
		payload: WorkspaceNotificationPayload,
	): Promise<void> {
		const recipientUserIds = await this.findActiveRecipientUserIdsExcludingActor(
			organizationId,
			actorUserId,
		);

		if (!recipientUserIds.length) {
			this.logger.log(
				`Workspace push event=${eventType} discussionId=${discussionId} recipients=0 successCount=0 failureCount=0`,
			);
			return;
		}

		const result = await this.notificationService.sendToUsers(
			recipientUserIds,
			payload,
		);

		this.logger.log(
			`Workspace push event=${eventType} discussionId=${discussionId} recipients=${result.totalUsers} devices=${result.totalDevices} successCount=${result.successCount} failureCount=${result.failureCount} removedInvalidTokens=${result.removedInvalidTokens}`,
		);
	}

	private buildVisiblePayload(
		title: string,
		body: string,
		data: Record<string, string>,
	): WorkspaceNotificationPayload {
		return {
			kind: 'VISIBLE',
			title,
			body,
			data,
		};
	}

	private buildSilentPayload(data: Record<string, string>): WorkspaceNotificationPayload {
		return {
			kind: 'DATA_ONLY',
			data,
		};
	}

	async notifyDiscussionCreated(
		discussion: Discussion,
		actor: User,
	): Promise<void> {
		const payload = this.buildVisiblePayload(
			'Nueva discusión',
			`${actor.fullName} creó: ${discussion.title}`,
			{
				type: 'DISCUSSION_CREATED',
				discussionId: discussion.id,
			},
		);

		await this.dispatchToActiveUsers(
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

	async notifyDiscussionMessageCreated(
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
				discussionId: discussion.id,
				messageId: message.id,
				messageType: message.type,
			},
		);

		await this.dispatchToActiveUsers(
			discussion.organizationId,
			actor.id,
			'DISCUSSION_MESSAGE',
			discussion.id,
			payload,
		);
	}

	async notifyDiscussionStatusChanged(
		discussion: Discussion,
		actor: User,
	): Promise<void> {
		const visibleStatus = this.statusLabelMap[discussion.status] ?? discussion.status;

		const payload = this.buildVisiblePayload(
			'Estado actualizado',
			`${actor.fullName} movió "${discussion.title}" a ${visibleStatus}`,
			{
				type: 'DISCUSSION_STATUS_CHANGED',
				discussionId: discussion.id,
				status: discussion.status,
			},
		);

		await this.dispatchToActiveUsers(
			discussion.organizationId,
			actor.id,
			'DISCUSSION_STATUS_CHANGED',
			discussion.id,
			payload,
		);
	}

	async notifyDiscussionAssignmentChanged(
		discussion: Discussion,
		actor: User,
	): Promise<void> {
		const payload = this.buildVisiblePayload(
			'Asignación actualizada',
			`${actor.fullName} actualizó responsables de: ${discussion.title}`,
			{
				type: 'DISCUSSION_ASSIGNMENT_CHANGED',
				discussionId: discussion.id,
			},
		);

		await this.dispatchToActiveUsers(
			discussion.organizationId,
			actor.id,
			'DISCUSSION_ASSIGNMENT_CHANGED',
			discussion.id,
			payload,
		);
	}

	async syncMessageUpdated(
		organizationId: string,
		discussionId: string,
		messageId: string,
		actor: User,
	): Promise<void> {
		const payload = this.buildSilentPayload({
			type: 'DISCUSSION_MESSAGE_UPDATED',
			discussionId,
			messageId,
		});

		await this.dispatchToActiveUsers(
			organizationId,
			actor.id,
			'DISCUSSION_MESSAGE_UPDATED',
			discussionId,
			payload,
		);
	}

	async syncMessageDeleted(
		organizationId: string,
		discussionId: string,
		messageId: string,
		actor: User,
	): Promise<void> {
		const payload = this.buildSilentPayload({
			type: 'DISCUSSION_MESSAGE_DELETED',
			discussionId,
			messageId,
		});

		await this.dispatchToActiveUsers(
			organizationId,
			actor.id,
			'DISCUSSION_MESSAGE_DELETED',
			discussionId,
			payload,
		);
	}

	async syncDiscussionContextChanged(
		organizationId: string,
		discussionId: string,
		actor: User,
	): Promise<void> {
		const payload = this.buildSilentPayload({
			type: 'DISCUSSION_CONTEXT_CHANGED',
			discussionId,
		});

		await this.dispatchToActiveUsers(
			organizationId,
			actor.id,
			'DISCUSSION_CONTEXT_CHANGED',
			discussionId,
			payload,
		);
	}
}
