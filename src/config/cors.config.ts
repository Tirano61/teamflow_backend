export const ALLOWED_CORS_ORIGINS = [
	'http://localhost:59808',
	'http://127.0.0.1:59074',
	'http://localhost:8080',
	'http://localhost:55905',
	'https://l002n256-3000.brs.devtunnels.ms',
	'https://tranquil-sorbet-4963f7.netlify.app',
	'https://workspace.netlify.app',
] as const;

export const DISCUSSION_FILES_UPLOAD_CORS_ORIGIN =
	'https://workspace.netlify.app';

export const DISCUSSION_FILES_UPLOAD_ALLOWED_HEADERS =
	'Authorization, Content-Type, Accept, Origin, X-Requested-With';

export const DISCUSSION_FILES_UPLOAD_ALLOWED_METHODS =
	'GET,POST,PUT,PATCH,DELETE,OPTIONS';

const DISCUSSION_FILES_UPLOAD_PATH_REGEX =
	/^\/api\/v1\/workspace\/discussions\/[^/]+\/messages\/files\/?$/i;

export function isAllowedCorsOrigin(origin?: string): origin is string {
	if (!origin) return false;
	return ALLOWED_CORS_ORIGINS.includes(origin as (typeof ALLOWED_CORS_ORIGINS)[number]);
}

export function isDiscussionFilesUploadPath(path: string): boolean {
	return DISCUSSION_FILES_UPLOAD_PATH_REGEX.test(path);
}
