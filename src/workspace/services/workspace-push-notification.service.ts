import { Injectable, Logger } from '@nestjs/common';
import { FirebaseMessagingService } from '../../firebase/firebase-messaging.service';
import { PushRecipientDevice, UserDeviceService } from './user-device.service';

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
	/** Cantidad de fallos por codigo de Firebase (por ejemplo `messaging/server-unavailable`). */
	failuresByCode: Record<string, number>;
}

export interface WorkspaceNotificationSendUsersResult extends WorkspaceNotificationSendResult {
	totalUsers: number;
}

const MAX_LOGGED_ERROR_MESSAGE_LENGTH = 300;

@Injectable()
export class WorkspacePushNotificationService {
	private readonly logger = new Logger(WorkspacePushNotificationService.name);

	constructor(
		private readonly firebaseMessagingService: FirebaseMessagingService,
		private readonly userDeviceService: UserDeviceService,
	) { }

	async sendToDevice(token: string, payload: WorkspaceNotificationPayload) {
		return this.firebaseMessagingService.sendToDevice(token, payload);
	}

	async sendToUser(
		userId: string,
		payload: WorkspaceNotificationPayload,
	): Promise<WorkspaceNotificationSendResult> {
		const devices = await this.userDeviceService.findPushDevicesByUserId(userId);
		const result = await this.sendToDevices(devices, payload);

		return {
			totalDevices: result.totalDevices,
			successCount: result.successCount,
			failureCount: result.failureCount,
			removedInvalidTokens: result.removedInvalidTokens,
			failuresByCode: result.failuresByCode,
		};
	}

	/**
	 * Envia `payload` a cada dispositivo agregando `data.recipientUserId` (el usuario por cuenta del
	 * cual se envia), para que el cliente pueda descartar un push que llega a un dispositivo donde
	 * ahora hay otra sesion. Los tokens que Firebase rechaza de forma definitiva se eliminan.
	 */
	async sendToDevices(
		devices: PushRecipientDevice[],
		payload: WorkspaceNotificationPayload,
	): Promise<WorkspaceNotificationSendUsersResult> {
		const uniqueDevices = [...new Map(devices.map((device) => [device.token, device])).values()]
			.filter((device) => device.token);
		const totalUsers = new Set(uniqueDevices.map((device) => device.userId)).size;

		if (!uniqueDevices.length) {
			return {
				totalUsers,
				totalDevices: 0,
				successCount: 0,
				failureCount: 0,
				removedInvalidTokens: 0,
				failuresByCode: {},
			};
		}

		const messages = uniqueDevices.map((device) =>
			this.firebaseMessagingService.buildMessage(device.token, {
				...payload,
				data: { ...(payload.data ?? {}), recipientUserId: device.userId },
			}),
		);

		const responses = await this.firebaseMessagingService.sendEachInBatches(messages);

		let successCount = 0;
		const failuresByCode: Record<string, number> = {};
		const firstMessageByCode = new Map<string, string>();
		const invalidDevices: PushRecipientDevice[] = [];
		const rejectedDevices: PushRecipientDevice[] = [];

		responses.forEach((response, index) => {
			if (response.success) {
				successCount += 1;
				return;
			}

			const device = uniqueDevices[index];
			const code = response.error?.code ?? 'unknown';
			failuresByCode[code] = (failuresByCode[code] ?? 0) + 1;

			if (!firstMessageByCode.has(code)) {
				// Nunca se registra el token: se reemplaza si el mensaje de Firebase lo incluyera.
				const message = (response.error?.message ?? 'Unknown Firebase messaging error')
					.split(device.token)
					.join('<token>')
					.slice(0, MAX_LOGGED_ERROR_MESSAGE_LENGTH);
				firstMessageByCode.set(code, message);
			}

			const kind = this.firebaseMessagingService.classifyFailure(response.error?.code);
			if (kind === 'TOKEN_INVALID') invalidDevices.push(device);
			if (kind === 'TOKEN_REJECTED') rejectedDevices.push(device);
		});

		// `invalid-argument` / `mismatched-credential` tambien pueden venir de un payload o una
		// credencial invalidos. Solo se atribuyen al token si otro mensaje del mismo envio (mismo
		// payload salvo `recipientUserId`) fue aceptado; si todos fallaron no se borra nada.
		const devicesToRemove = successCount > 0
			? [...invalidDevices, ...rejectedDevices]
			: invalidDevices;

		const removedInvalidTokens = await this.userDeviceService.removeRejectedDevices(devicesToRemove);
		const failureCount = uniqueDevices.length - successCount;

		if (failureCount > 0) {
			const details = [...firstMessageByCode.entries()]
				.map(([code, message]) => `${code}: ${message}`)
				.join(' | ');
			this.logger.warn(
				`FCM send failures devices=${uniqueDevices.length} failureCount=${failureCount} removedInvalidTokens=${removedInvalidTokens} failuresByCode=${JSON.stringify(failuresByCode)} details=${details}`,
			);
		}

		return {
			totalUsers,
			totalDevices: uniqueDevices.length,
			successCount,
			failureCount,
			removedInvalidTokens,
			failuresByCode,
		};
	}
}
