import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApps, initializeApp, applicationDefault, App } from 'firebase-admin/app';
import {
	getMessaging,
	Messaging,
	Message,
	MulticastMessage,
} from 'firebase-admin/messaging';

export interface FirebaseNotificationPayload {
	kind: 'VISIBLE' | 'DATA_ONLY';
	title?: string;
	body?: string;
	data?: Record<string, string>;
}

@Injectable()
export class FirebaseMessagingService {
	private readonly logger = new Logger(FirebaseMessagingService.name);
	private readonly app: App;
	private readonly messaging: Messaging;

	constructor(private readonly configService: ConfigService) {
		const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');

		// Initialize Firebase Admin only once for the whole NestJS process.
		if (getApps().length > 0) {
			this.app = getApps()[0];
		} else {
			this.app = initializeApp({
				credential: applicationDefault(),
				projectId: projectId || undefined,
			});
		}

		this.messaging = getMessaging(this.app);
	}

	private buildNotificationMessagePayload(notification: FirebaseNotificationPayload): {
		notification?: Message['notification'];
		data?: Record<string, string>;
		android: { priority: 'high' };
	} {
		if (notification.kind === 'DATA_ONLY') {
			return {
				android: {
					priority: 'high',
				},
				data: notification.data,
			};
		}

		return {
			notification: {
				title: notification.title ?? '',
				body: notification.body ?? '',
			},
			android: {
				priority: 'high',
			},
			data: notification.data,
		};
	}

	async sendToDevice(
		token: string,
		notification: FirebaseNotificationPayload,
	): Promise<string> {
		const messagePayload = this.buildNotificationMessagePayload(notification);

		const payload: Message = {
			token,
			...messagePayload,
		};

		return this.messaging.send(payload);
	}

	async sendMulticast(
		tokens: string[],
		notification: FirebaseNotificationPayload,
	) {
		if (!tokens.length) {
			return {
				successCount: 0,
				failureCount: 0,
				responses: [],
			};
		}

		const messagePayload = this.buildNotificationMessagePayload(notification);

		const payload: MulticastMessage = {
			tokens,
			...messagePayload,
		};

		return this.messaging.sendEachForMulticast(payload);
	}

	isInvalidRegistrationTokenErrorCode(code?: string): boolean {
		return (
			code === 'messaging/registration-token-not-registered' ||
			code === 'messaging/invalid-registration-token'
		);
	}

	logNonInvalidTokenFailure(code: string | undefined, message: string): void {
		this.logger.warn(
			`FCM send failed with non-removable token error. code=${code ?? 'unknown'} message=${message}`,
		);
	}
}
