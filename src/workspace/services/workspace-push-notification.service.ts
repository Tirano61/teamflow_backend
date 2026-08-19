import { Injectable } from '@nestjs/common';
import { FirebaseMessagingService } from '../../firebase/firebase-messaging.service';
import { UserDeviceService } from './user-device.service';

export interface WorkspaceNotificationPayload {
	kind: 'VISIBLE' | 'DATA_ONLY';
	title?: string;
	body?: string;
	data?: Record<string, string>;
}

export interface WorkspaceNotificationSendResult {
	totalDevices: number;
	successCount: number;
	failureCount: number;
	removedInvalidTokens: number;
	invalidTokens: string[];
}

export interface WorkspaceNotificationSendUsersResult extends WorkspaceNotificationSendResult {
	totalUsers: number;
}

@Injectable()
export class WorkspacePushNotificationService {
	constructor(
		private readonly firebaseMessagingService: FirebaseMessagingService,
		private readonly userDeviceService: UserDeviceService,
	) { }

	async sendToDevice(token: string, payload: WorkspaceNotificationPayload) {
		return this.firebaseMessagingService.sendToDevice(token, payload);
	}

	private async handleMulticastResponse(
		tokens: string[],
		payload: WorkspaceNotificationPayload,
	): Promise<WorkspaceNotificationSendResult> {
		if (!tokens.length) {
			return {
				totalDevices: 0,
				successCount: 0,
				failureCount: 0,
				removedInvalidTokens: 0,
				invalidTokens: [],
			};
		}

		const response = await this.firebaseMessagingService.sendMulticast(
			tokens,
			payload,
		);

		const invalidTokens: string[] = [];

		response.responses.forEach((item, index) => {
			if (item.success) return;

			const errorCode = item.error?.code;
			if (
				this.firebaseMessagingService.isInvalidRegistrationTokenErrorCode(
					errorCode,
				)
			) {
				invalidTokens.push(tokens[index]);
				return;
			}

			this.firebaseMessagingService.logNonInvalidTokenFailure(
				errorCode,
				item.error?.message ?? 'Unknown Firebase messaging error',
			);
		});

		const removedInvalidTokens = await this.userDeviceService.removeByTokenList(
			invalidTokens,
		);

		return {
			totalDevices: tokens.length,
			successCount: response.successCount,
			failureCount: response.failureCount,
			removedInvalidTokens,
			invalidTokens,
		};
	}

	async sendToUser(
		userId: string,
		payload: WorkspaceNotificationPayload,
	): Promise<WorkspaceNotificationSendResult> {
		const devices = await this.userDeviceService.findByUserId(userId);
		const tokens = devices.map((device) => device.fcmToken).filter(Boolean);
		return this.handleMulticastResponse(tokens, payload);
	}

	async sendToUsers(
		userIds: string[],
		payload: WorkspaceNotificationPayload,
	): Promise<WorkspaceNotificationSendUsersResult> {
		if (!userIds.length) {
			return {
				totalUsers: 0,
				totalDevices: 0,
				successCount: 0,
				failureCount: 0,
				removedInvalidTokens: 0,
				invalidTokens: [],
			};
		}

		const devices = await this.userDeviceService.findByUserIds(userIds);
		const tokens = [...new Set(devices.map((device) => device.fcmToken).filter(Boolean))];
		const result = await this.handleMulticastResponse(tokens, payload);

		return {
			totalUsers: userIds.length,
			...result,
		};
	}
}
