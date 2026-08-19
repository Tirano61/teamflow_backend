import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Request, Response, NextFunction, json, urlencoded } from 'express';
import {
	DISCUSSION_FILES_UPLOAD_ALLOWED_HEADERS,
	DISCUSSION_FILES_UPLOAD_ALLOWED_METHODS,
	DISCUSSION_FILES_UPLOAD_CORS_ORIGIN,
	isAllowedCorsOrigin,
	isDiscussionFilesUploadPath,
} from './config/cors.config';
import { GlobalHttpExceptionFilter } from './filters/global-http-exception.filter';

const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 25 * 1024 * 1024;

function resolveRequestBodyLimit(): string | number {
	const explicitLimit = process.env.REQUEST_BODY_LIMIT;
	if (explicitLimit && explicitLimit.trim()) return explicitLimit.trim();

	const uploadLimitBytes = Number(process.env.WORKSPACE_ATTACHMENT_MAX_FILE_SIZE_BYTES);
	if (Number.isFinite(uploadLimitBytes) && uploadLimitBytes > 0) {
		return uploadLimitBytes;
	}

	return DEFAULT_REQUEST_BODY_LIMIT_BYTES;
}

function setVaryOriginHeader(response: Response): void {
	const previous = response.getHeader('Vary');
	if (typeof previous === 'string') {
		if (!previous.split(',').map((value) => value.trim()).includes('Origin')) {
			response.setHeader('Vary', `${previous}, Origin`);
		}
		return;
	}

	response.setHeader('Vary', 'Origin');
}

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const requestBodyLimit = resolveRequestBodyLimit();

	app.use(json({ limit: requestBodyLimit }));
	app.use(urlencoded({ extended: true, limit: requestBodyLimit }));

	app.use((req: Request, res: Response, next: NextFunction) => {
		const requestPath = req.path ?? req.url.split('?')[0];
		if (!isDiscussionFilesUploadPath(requestPath)) {
			next();
			return;
		}

		if (req.headers.origin === DISCUSSION_FILES_UPLOAD_CORS_ORIGIN) {
			res.setHeader('Access-Control-Allow-Origin', DISCUSSION_FILES_UPLOAD_CORS_ORIGIN);
			res.setHeader('Access-Control-Allow-Credentials', 'true');
			setVaryOriginHeader(res);
		}

		res.setHeader('Access-Control-Allow-Headers', DISCUSSION_FILES_UPLOAD_ALLOWED_HEADERS);
		res.setHeader('Access-Control-Allow-Methods', DISCUSSION_FILES_UPLOAD_ALLOWED_METHODS);
		setVaryOriginHeader(res);

		if (req.method === 'OPTIONS') {
			res.status(204).send();
			return;
		}

		next();
	});

	app.enableCors({
		origin: (origin, callback) => {
			if (!origin || isAllowedCorsOrigin(origin)) {
				callback(null, true);
				return;
			}

			callback(new Error('Origin not allowed by CORS'), false);
		},
		methods: DISCUSSION_FILES_UPLOAD_ALLOWED_METHODS,
		allowedHeaders: DISCUSSION_FILES_UPLOAD_ALLOWED_HEADERS,
		exposedHeaders: 'Content-Type, Authorization, Accept',
		credentials: true,
		preflightContinue: false,
		optionsSuccessStatus: 204,
	});

	app.setGlobalPrefix('api/v1');

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	);

	app.useGlobalFilters(new GlobalHttpExceptionFilter());
	await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
