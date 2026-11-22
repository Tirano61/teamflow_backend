import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { basename } from 'path';
import { getApps, initializeApp, applicationDefault, App } from 'firebase-admin/app';
import {
	getMessaging,
	Messaging,
	Message,
	SendResponse,
} from 'firebase-admin/messaging';

export interface FirebaseNotificationPayload {
	kind: 'VISIBLE' | 'DATA_ONLY';
	title?: string;
	body?: string;
	data?: Record<string, string>;
}

/**
 * Como interpretar el fallo de un mensaje individual:
 * - `TOKEN_INVALID`: Firebase confirma que el token ya no existe o no es un token FCM; se elimina.
 * - `TOKEN_REJECTED`: el error puede deberse al token (formato invalido, token de otro proyecto
 *   Firebase) o al mensaje/credencial. Solo se trata como token invalido si otro mensaje del
 *   mismo envio fue aceptado (el payload y la credencial son validos).
 * - `TRANSIENT`: Firebase o la red no estuvieron disponibles; el token se conserva.
 * - `CONFIGURATION`: credencial o configuracion del proyecto; el token se conserva.
 * - `UNKNOWN`: cualquier otro codigo; el token se conserva.
 */
export type FirebaseSendFailureKind =
	| 'TOKEN_INVALID'
	| 'TOKEN_REJECTED'
	| 'TRANSIENT'
	| 'CONFIGURATION'
	| 'UNKNOWN';

/** Limite de mensajes por llamada a `sendEach` de firebase-admin. */
export const FCM_MAX_MESSAGES_PER_BATCH = 500;

@Injectable()
export class FirebaseMessagingService {
	private readonly logger = new Logger(FirebaseMessagingService.name);
	private readonly app: App;
	private readonly messaging: Messaging;

	constructor(private readonly configService: ConfigService) {
		const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');

		this.logCredentialDiagnostics();

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

	/**
	 * `applicationDefault()` no valida la credencial al iniciar: el error aparece recien en el primer
	 * envio. Se advierte al arrancar para que una ruta inexistente no pase inadvertida. Solo se
	 * registra el nombre del archivo, nunca su contenido.
	 */
	private logCredentialDiagnostics(): void {
		const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

		if (!credentialsPath) {
			this.logger.warn(
				'GOOGLE_APPLICATION_CREDENTIALS is not set: Firebase Admin will look for other Application Default Credentials. Push delivery fails if none is available.',
			);
			return;
		}

		if (!existsSync(credentialsPath)) {
			this.logger.error(
				`GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist (${basename(credentialsPath)}). Every push send will fail until it is fixed.`,
			);
		}
	}

	buildMessage(token: string, notification: FirebaseNotificationPayload): Message {
		if (notification.kind === 'DATA_ONLY') {
			return {
				token,
				android: {
					priority: 'high',
				},
				data: notification.data,
			};
		}

		return {
			token,
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
		return this.messaging.send(this.buildMessage(token, notification));
	}

	/**
	 * Envia cada mensaje (puede llevar `data` distinto por destinatario) en lotes de hasta
	 * `FCM_MAX_MESSAGES_PER_BATCH`. Devuelve una respuesta por mensaje, en el mismo orden.
	 * Rechaza solo si falla un lote completo (por ejemplo, sin project id o sin credencial).
	 */
	async sendEachInBatches(messages: Message[]): Promise<SendResponse[]> {
		const responses: SendResponse[] = [];

		for (let start = 0; start < messages.length; start += FCM_MAX_MESSAGES_PER_BATCH) {
			const batch = messages.slice(start, start + FCM_MAX_MESSAGES_PER_BATCH);
			const result = await this.messaging.sendEach(batch);
			responses.push(...result.responses);
		}

		return responses;
	}

	classifyFailure(code?: string): FirebaseSendFailureKind {
		switch (code) {
			case 'messaging/registration-token-not-registered':
			case 'messaging/invalid-registration-token':
				return 'TOKEN_INVALID';
			case 'messaging/invalid-argument':
			case 'messaging/mismatched-credential':
				return 'TOKEN_REJECTED';
			case 'messaging/server-unavailable':
			case 'messaging/internal-error':
			case 'messaging/message-rate-exceeded':
			case 'messaging/device-message-rate-exceeded':
			case 'app/network-error':
			case 'app/network-timeout':
				return 'TRANSIENT';
			case 'messaging/authentication-error':
			case 'messaging/third-party-auth-error':
			case 'app/invalid-credential':
				return 'CONFIGURATION';
			default:
				return 'UNKNOWN';
		}
	}
}
