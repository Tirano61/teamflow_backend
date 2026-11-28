import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MulterError } from 'multer';
import {
	DISCUSSION_FILES_UPLOAD_ALLOWED_HEADERS,
	DISCUSSION_FILES_UPLOAD_ALLOWED_METHODS,
	isAllowedCorsOrigin,
	isDiscussionFilesUploadPath,
} from '../config/cors.config';
import { describeErrorForLog } from './error-log.util';

/// Unico mensaje de un 500: el detalle (driver, SQL, rutas, configuracion) solo va al log.
const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error';

interface NormalizedErrorResponse {
	statusCode: number;
	error: string;
	message: string | string[];
	timestamp: string;
	path: string;
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger('HttpExceptionFilter');

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<Response>();
		const request = ctx.getRequest<Request>();

		if (response.headersSent) return;

		const requestPath = request.path ?? request.url;
		const isUploadPath = isDiscussionFilesUploadPath(requestPath);

		this.applyCorsHeaders(response, request, isUploadPath);

		const normalized = this.normalizeException(exception, request.url);
		if (normalized.statusCode >= 500) {
			this.logServerError(exception, request, normalized.statusCode);
		}
		response.status(normalized.statusCode).json(normalized);
	}

	/// Los 5xx se registran con su causa real, redactada. Se usa el patron de la ruta
	/// (`/organization-invitations/:token/accept`) para no escribir tokens de la URL en el log.
	private logServerError(exception: unknown, request: Request, statusCode: number): void {
		const routePattern =
			typeof request.route?.path === 'string' ? request.route.path : request.path;
		const { message, stack } = describeErrorForLog(exception);
		this.logger.error(`${request.method} ${routePattern} -> ${statusCode}: ${message}`, stack);
	}

	private applyCorsHeaders(
		response: Response,
		request: Request,
		isUploadPath: boolean,
	): void {
		const requestOrigin = request.headers.origin;
		if (typeof requestOrigin === 'string' && isAllowedCorsOrigin(requestOrigin)) {
			response.setHeader('Access-Control-Allow-Origin', requestOrigin);
			response.setHeader('Access-Control-Allow-Credentials', 'true');
		}

		this.setVaryOrigin(response);

		if (isUploadPath) {
			response.setHeader(
				'Access-Control-Allow-Headers',
				DISCUSSION_FILES_UPLOAD_ALLOWED_HEADERS,
			);
			response.setHeader(
				'Access-Control-Allow-Methods',
				DISCUSSION_FILES_UPLOAD_ALLOWED_METHODS,
			);
		}
	}

	private setVaryOrigin(response: Response): void {
		const previous = response.getHeader('Vary');
		if (typeof previous === 'string') {
			const values = previous
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean);

			if (!values.includes('Origin')) {
				response.setHeader('Vary', `${previous}, Origin`);
			}
			return;
		}

		response.setHeader('Vary', 'Origin');
	}

	private normalizeException(
		exception: unknown,
		path: string,
	): NormalizedErrorResponse {
		if (exception instanceof MulterError) {
			if (exception.code === 'LIMIT_FILE_SIZE') {
				return this.makePayload(
					HttpStatus.PAYLOAD_TOO_LARGE,
					'Uploaded file exceeds the allowed size limit',
					path,
				);
			}

			return this.makePayload(
				HttpStatus.BAD_REQUEST,
				exception.message || 'Invalid multipart upload payload',
				path,
			);
		}

		if (this.isPayloadTooLargeError(exception)) {
			return this.makePayload(
				HttpStatus.PAYLOAD_TOO_LARGE,
				'Uploaded payload is too large',
				path,
			);
		}

		if (exception instanceof HttpException) {
			const status = exception.getStatus();

			/// Un InternalServerErrorException puede llevar detalles de configuracion o del
			/// entorno. Los demas 5xx (por ejemplo 503) conservan su mensaje, escrito para el cliente.
			if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
				return this.makePayload(status, INTERNAL_SERVER_ERROR_MESSAGE, path);
			}

			const response = exception.getResponse();

			if (typeof response === 'string') {
				return this.makePayload(status, response, path);
			}

			const message = this.readMessageFromResponse(response);
			return this.makePayload(status, message, path);
		}

		/// Errores no controlados (TypeORM/pg, fs, librerias): nunca se devuelve `exception.message`.
		return this.makePayload(
			HttpStatus.INTERNAL_SERVER_ERROR,
			INTERNAL_SERVER_ERROR_MESSAGE,
			path,
		);
	}

	private isPayloadTooLargeError(exception: unknown): boolean {
		if (!exception || typeof exception !== 'object') return false;

		const candidate = exception as {
			status?: number;
			statusCode?: number;
			type?: string;
			code?: string;
			message?: string;
		};

		return (
			candidate.status === HttpStatus.PAYLOAD_TOO_LARGE ||
			candidate.statusCode === HttpStatus.PAYLOAD_TOO_LARGE ||
			candidate.type === 'entity.too.large' ||
			candidate.code === 'LIMIT_FILE_SIZE' ||
			candidate.message === 'File too large'
		);
	}

	private readMessageFromResponse(
		response: unknown,
	): string | string[] {
		if (!response || typeof response !== 'object') {
			return 'Unexpected error';
		}

		const typedResponse = response as {
			message?: string | string[];
			error?: string;
		};

		if (typedResponse.message) return typedResponse.message;
		if (typedResponse.error) return typedResponse.error;

		return 'Unexpected error';
	}

	private makePayload(
		statusCode: number,
		message: string | string[],
		path: string,
	): NormalizedErrorResponse {
		return {
			statusCode,
			error: HttpStatus[statusCode] ?? 'Error',
			message,
			timestamp: new Date().toISOString(),
			path,
		};
	}
}
