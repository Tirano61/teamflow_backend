import { DiscussionMessageType } from '../enums/discussion-message-type.enum';

export type CloudinaryAttachmentResourceType = 'image' | 'video' | 'raw';

/**
 * `resource_type` de Cloudinary de un adjunto ya guardado. No se persiste en la base: se deduce
 * del `type` del mensaje (mismo mapeo que al subirlo) y, si no alcanza, del MIME type.
 * Lo comparten el borrado de un mensaje y la eliminacion de una organization.
 */
export function resolveStoredAttachmentResourceType(
	type: DiscussionMessageType,
	mimeType: string | null,
): CloudinaryAttachmentResourceType {
	switch (type) {
		case DiscussionMessageType.IMAGE:
			return 'image';
		case DiscussionMessageType.AUDIO:
		case DiscussionMessageType.VIDEO:
			return 'video';
		case DiscussionMessageType.FILE:
			return 'raw';
		default:
			break;
	}

	const normalizedMimeType = mimeType?.toLowerCase() ?? '';
	if (normalizedMimeType.startsWith('image/')) return 'image';
	if (normalizedMimeType.startsWith('audio/') || normalizedMimeType.startsWith('video/')) {
		return 'video';
	}
	return 'raw';
}
