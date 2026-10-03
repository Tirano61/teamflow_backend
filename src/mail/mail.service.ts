import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BREVO_SEND_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const MAIL_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_SENDER_NAME = 'TeamFlow';

export interface SendMailParams {
	to: { email: string; name?: string };
	subject: string;
	htmlContent: string;
	textContent: string;
}

/**
 * El email no pudo entregarse al proveedor (configuracion faltante, error de red, timeout o
 * rechazo de Brevo). No es una HttpException: cada caller decide como exponerlo, para que el
 * mensaje interno nunca llegue al cliente a traves del filtro global.
 */
export class MailDeliveryError extends Error {}

/**
 * Envio de emails transaccionales con la API HTTP de Brevo (fetch nativo, sin SDK).
 * Nunca registra en logs el contenido del email ni el destinatario: solo el status y el
 * error que devuelve el proveedor.
 */
@Injectable()
export class MailService {
	private readonly logger = new Logger(MailService.name);

	constructor(private readonly configService: ConfigService) {}

	async sendMail(params: SendMailParams): Promise<void> {
		const apiKey = this.configService.get<string>('BREVO_API_KEY')?.trim();
		const senderEmail = this.configService.get<string>('MAIL_FROM_EMAIL')?.trim();
		const senderName =
			this.configService.get<string>('MAIL_FROM_NAME')?.trim() || DEFAULT_SENDER_NAME;

		if (!apiKey || !senderEmail) {
			this.logger.error('Email is not configured: BREVO_API_KEY and MAIL_FROM_EMAIL are required');
			throw new MailDeliveryError('Email provider is not configured');
		}

		let response: Response;
		try {
			response = await fetch(BREVO_SEND_EMAIL_URL, {
				method: 'POST',
				headers: {
					'api-key': apiKey,
					accept: 'application/json',
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					sender: { name: senderName, email: senderEmail },
					to: [params.to],
					subject: params.subject,
					htmlContent: params.htmlContent,
					textContent: params.textContent,
				}),
				signal: AbortSignal.timeout(MAIL_REQUEST_TIMEOUT_MS),
			});
		} catch (error) {
			const reason = error instanceof Error ? error.name : 'UnknownError';
			this.logger.error(`Brevo request failed (${reason})`);
			throw new MailDeliveryError('Email provider request failed');
		}

		if (!response.ok) {
			const providerError = await this.readProviderError(response);
			this.logger.error(
				`Brevo rejected the email (status ${response.status}${providerError ? `: ${providerError}` : ''})`,
			);
			throw new MailDeliveryError('Email provider rejected the email');
		}
	}

	/**
	 * Brevo responde errores como `{ code, message }`. Solo se leen esos dos campos.
	 */
	private async readProviderError(response: Response): Promise<string | null> {
		try {
			const body = (await response.json()) as { code?: unknown; message?: unknown };
			const parts = [body.code, body.message].filter(
				(value): value is string => typeof value === 'string' && value.length > 0,
			);
			return parts.length > 0 ? parts.join(' - ') : null;
		} catch {
			return null;
		}
	}
}
