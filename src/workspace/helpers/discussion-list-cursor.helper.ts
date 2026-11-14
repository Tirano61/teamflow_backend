import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { isUUID } from 'class-validator';

/**
 * Cursor del listado de Discussions (keyset sobre `created_at DESC, id ASC`).
 *
 * Formato (opaco para el cliente): `base64url(JSON del payload) + "." + base64url(HMAC-SHA256)`.
 * El payload esta versionado (`v`) para poder cambiarlo: una version desconocida se rechaza.
 * El cursor solo aporta la posicion; la organizacion, el usuario y los filtros salen siempre de la
 * ruta, del token y de los query params, y el cursor se rechaza si no coincide con ellos.
 */
export const DISCUSSION_LIST_CURSOR_VERSION = 1;

/** Contexto para derivar la clave de firma: separa estos cursores de cualquier otro uso del secreto. */
const SIGNING_KEY_CONTEXT = 'teamflow:discussion-list-cursor';
const MAX_CURSOR_LENGTH = 1024;
const CURSOR_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** `created_at` tal como lo devuelve PostgreSQL (`timestamp`, microsegundos). */
const CREATED_AT_SHAPE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/;

export interface DiscussionListCursorPosition {
	/** `created_at` de la ultima Discussion de la pagina, con precision de microsegundos. */
	createdAt: string;
	/** `id` de la ultima Discussion de la pagina. */
	id: string;
}

export interface DiscussionListCursorContext {
	organizationId: string;
	userId: string;
	/** Huella de los filtros efectivos (ver `fingerprintDiscussionListFilters`). */
	filtersFingerprint: string;
}

interface DiscussionListCursorPayload {
	v: number;
	o: string;
	u: string;
	f: string;
	c: string;
	i: string;
}

export type DiscussionListCursorError = 'invalid' | 'filters-mismatch';

export function deriveDiscussionListCursorKey(secret: string): Buffer {
	return createHmac('sha256', secret).update(SIGNING_KEY_CONTEXT).digest();
}

/**
 * Huella estable de los filtros efectivos. Las listas se ordenan, de modo que el mismo filtro
 * escrito en otro orden produce la misma huella.
 */
export function fingerprintDiscussionListFilters(filters: {
	type?: string;
	status?: string;
	moduleIds: string[];
	componentIds: string[];
	tagIds: string[];
	createdByUserId?: string;
	assignedUserId?: string;
	unread: boolean;
}): string {
	const canonical = JSON.stringify([
		filters.type ?? null,
		filters.status ?? null,
		[...filters.moduleIds].sort(),
		[...filters.componentIds].sort(),
		[...filters.tagIds].sort(),
		filters.createdByUserId ?? null,
		filters.assignedUserId ?? null,
		filters.unread,
	]);
	return createHash('sha256').update(canonical).digest('base64url').slice(0, 22);
}

function sign(key: Buffer, encodedPayload: string): Buffer {
	return createHmac('sha256', key).update(encodedPayload).digest();
}

export function encodeDiscussionListCursor(
	key: Buffer,
	context: DiscussionListCursorContext,
	position: DiscussionListCursorPosition,
): string {
	const payload: DiscussionListCursorPayload = {
		v: DISCUSSION_LIST_CURSOR_VERSION,
		o: context.organizationId,
		u: context.userId,
		f: context.filtersFingerprint,
		c: position.createdAt,
		i: position.id,
	};
	const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	return `${encodedPayload}.${sign(key, encodedPayload).toString('base64url')}`;
}

/**
 * Valida el cursor contra el contexto de la peticion y devuelve la posicion, o el motivo del
 * rechazo. Nunca lanza: un cursor malformado, con firma invalida, de otra version, de otra
 * organizacion o de otro usuario es `invalid`; uno valido pero emitido con otros filtros es
 * `filters-mismatch`. La firma se comprueba antes de interpretar el contenido.
 */
export function decodeDiscussionListCursor(
	key: Buffer,
	context: DiscussionListCursorContext,
	cursor: string,
): DiscussionListCursorPosition | DiscussionListCursorError {
	if (typeof cursor !== 'string' || cursor.length > MAX_CURSOR_LENGTH || !CURSOR_SHAPE.test(cursor)) {
		return 'invalid';
	}

	const [encodedPayload, encodedSignature] = cursor.split('.');
	const signature = Buffer.from(encodedSignature, 'base64url');
	const expectedSignature = sign(key, encodedPayload);
	if (
		signature.length !== expectedSignature.length ||
		!timingSafeEqual(signature, expectedSignature)
	) {
		return 'invalid';
	}

	let payload: Partial<DiscussionListCursorPayload>;
	try {
		payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
	} catch {
		return 'invalid';
	}

	if (
		!payload ||
		typeof payload !== 'object' ||
		payload.v !== DISCUSSION_LIST_CURSOR_VERSION ||
		typeof payload.c !== 'string' ||
		!CREATED_AT_SHAPE.test(payload.c) ||
		typeof payload.i !== 'string' ||
		!isUUID(payload.i) ||
		payload.o !== context.organizationId ||
		payload.u !== context.userId
	) {
		return 'invalid';
	}

	if (payload.f !== context.filtersFingerprint) return 'filters-mismatch';

	return { createdAt: payload.c, id: payload.i };
}
