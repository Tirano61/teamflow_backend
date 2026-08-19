import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as FileType from 'file-type';
import { Repository } from 'typeorm';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { User } from '../../auth/entities/user.entity';
import { DiscussionAttachmentCreateDto } from '../dto/create-discussion-attachment.dto';
import { DiscussionMessageCreateDto } from '../dto/create-discussion-message.dto';
import { DiscussionMessageUpdateDto } from '../dto/update-discussion-message.dto';
import { Discussion } from '../entities/discussion.entity';
import { DiscussionMessage } from '../entities/discussion_message.entity';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';
import { DiscussionMessageListResponse } from '../interfaces/discussion-message-list-response.interface';
import { WorkspaceNotificationService } from './workspace-notification.service';
import { DiscussionService } from './discussion.service';

@Injectable()
export class DiscussionMessageService {
	private readonly logger = new Logger(DiscussionMessageService.name);

	constructor(
		@InjectRepository(DiscussionMessage)
		private readonly discussionMessageRepository: Repository<DiscussionMessage>,
		private readonly discussionService: DiscussionService,
		private readonly cloudinaryService: CloudinaryService,
		private readonly workflowNotificationService: WorkspaceNotificationService,
	) { }

	private normalizeMessageContent(content: string): string {
		const normalized = content.trim();
		if (!normalized)
			throw new BadRequestException('Message content cannot be empty');
		return normalized;
	}

	private normalizeOptionalMessageContent(content?: string): string | null {
		if (content === undefined || content === null) return null;
		return this.normalizeMessageContent(content);
	}

	private assertTextMessageType(type?: DiscussionMessageType): void {
		if (type === undefined || type === DiscussionMessageType.TEXT) return;
		throw new BadRequestException(
			'Only TEXT is supported in this endpoint. Use the file upload endpoint for attachments.',
		);
	}

	private assertAttachmentFile(file: Express.Multer.File | undefined): void {
		if (!file || !file.buffer || file.buffer.length === 0) {
			throw new BadRequestException('file is required');
		}
	}

	private mapAttachmentResourceType(
		type: DiscussionMessageType,
	): 'image' | 'video' | 'raw' {
		switch (type) {
			case DiscussionMessageType.IMAGE:
				return 'image';
			case DiscussionMessageType.VIDEO:
				return 'video';
			case DiscussionMessageType.AUDIO:
				return 'video';
			case DiscussionMessageType.FILE:
				return 'raw';
			default:
				throw new BadRequestException('Invalid attachment type');
		}
	}

	private assertAttachmentTypeMatchesMime(
		type: DiscussionMessageType,
		mimeType: string,
	): void {
		if (type === DiscussionMessageType.IMAGE && !mimeType.startsWith('image/')) {
			throw new BadRequestException('type IMAGE requires an image MIME type');
		}

		if (type === DiscussionMessageType.AUDIO && !mimeType.startsWith('audio/')) {
			throw new BadRequestException('type AUDIO requires an audio MIME type');
		}

		if (type === DiscussionMessageType.VIDEO && !mimeType.startsWith('video/')) {
			throw new BadRequestException('type VIDEO requires a video MIME type');
		}
	}

	private assertIsMessageAuthor(
		user: User,
		message: DiscussionMessage,
	): void {
		const authorId = message.author?.id;
		if (authorId === user.id) return;
		throw new ForbiddenException('You can only modify your own messages');
	}

	private mapStoredAttachmentResourceType(
		message: DiscussionMessage,
	): 'image' | 'video' | 'raw' {
		switch (message.type) {
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

		const mimeType = message.mimeType?.toLowerCase() ?? '';
		if (mimeType.startsWith('image/')) return 'image';
		if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
			return 'video';
		}
		return 'raw';
	}

	private normalizePagination(page: number, limit: number) {
		if (page < 1) throw new BadRequestException('page must be greater than 0');
		if (limit < 1)
			throw new BadRequestException('limit must be greater than 0');
		return {
			page,
			limit: Math.min(limit, 100),
		};
	}

	private async findDiscussionMessageById(
		discussionId: string,
		messageId: string,
	): Promise<DiscussionMessage> {
		const message = await this.discussionMessageRepository.findOne({
			where: {
				id: messageId,
				discussion: { id: discussionId },
			},
			relations: ['author', 'discussion'],
		});

		if (!message) throw new NotFoundException('Discussion message not found');
		return message;
	}

	async createDiscussionMessage(
		discussionId: string,
		dto: DiscussionMessageCreateDto,
		user: User,
	): Promise<DiscussionMessage> {
		await this.discussionService.findDiscussionByIdForUser(discussionId, user);
		this.assertTextMessageType(dto.type);

		const message = this.discussionMessageRepository.create({
			discussion: { id: discussionId } as Discussion,
			author: { id: user.id } as User,
			type: DiscussionMessageType.TEXT,
			content: this.normalizeMessageContent(dto.content),
			fileUrl: null,
			fileName: null,
			mimeType: null,
			fileSize: null,
			cloudinaryPublicId: null,
		});

		const saved = await this.discussionMessageRepository.save(message);
		await this.discussionService.upsertDiscussionReadState(discussionId, user.id);
		const hydratedMessage = await this.findDiscussionMessageById(discussionId, saved.id);

		try {
			await this.workflowNotificationService.notifyDiscussionMessageCreated(
				hydratedMessage.discussion,
				hydratedMessage,
				user,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Push notify failed for discussion message discussionId=${discussionId} messageId=${hydratedMessage.id} reason=${reason}`,
			);
		}

		return hydratedMessage;
	}

	async createDiscussionAttachmentMessage(
		discussionId: string,
		dto: DiscussionAttachmentCreateDto,
		file: Express.Multer.File,
		user: User,
	): Promise<DiscussionMessage> {
		await this.discussionService.findDiscussionByIdForUser(discussionId, user);
		this.assertAttachmentFile(file);

		const detected = await FileType.fromBuffer(file.buffer);
		const detectedMimeType = detected?.mime?.toLowerCase() ?? null;

		if (dto.type !== DiscussionMessageType.FILE && !detectedMimeType) {
			throw new BadRequestException(
				'Unable to determine real MIME type for this file',
			);
		}

		const effectiveMimeType = (
			detectedMimeType ??
			file.mimetype?.toLowerCase() ??
			'application/octet-stream'
		).trim();

		this.assertAttachmentTypeMatchesMime(dto.type, effectiveMimeType);

		const uploadedAsset = await this.cloudinaryService.uploadDiscussionAttachment({
			buffer: file.buffer,
			filename: file.originalname,
			resourceType: this.mapAttachmentResourceType(dto.type),
		});

		const message = this.discussionMessageRepository.create({
			discussion: { id: discussionId } as Discussion,
			author: { id: user.id } as User,
			type: dto.type,
			content: this.normalizeOptionalMessageContent(dto.content),
			fileUrl: uploadedAsset.url,
			fileName: file.originalname,
			mimeType: effectiveMimeType,
			fileSize: file.size,
			cloudinaryPublicId: uploadedAsset.publicId,
		});

		let saved: DiscussionMessage;
		try {
			saved = await this.discussionMessageRepository.save(message);
			await this.discussionService.upsertDiscussionReadState(discussionId, user.id);
		} catch (error) {
			await this.cloudinaryService
				.deleteAsset(uploadedAsset.publicId, uploadedAsset.resourceType)
				.catch(() => undefined);
			throw error;
		}

		const hydratedMessage = await this.findDiscussionMessageById(discussionId, saved.id);

		try {
			await this.workflowNotificationService.notifyDiscussionMessageCreated(
				hydratedMessage.discussion,
				hydratedMessage,
				user,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Push notify failed for discussion attachment discussionId=${discussionId} messageId=${hydratedMessage.id} reason=${reason}`,
			);
		}

		return hydratedMessage;
	}

	async findDiscussionMessages(
		discussionId: string,
		page: number,
		limit: number,
		user: User,
		type?: DiscussionMessageType,
	): Promise<DiscussionMessageListResponse<DiscussionMessage>> {
		await this.discussionService.findDiscussionByIdForUser(discussionId, user);
		const pagination = this.normalizePagination(page, limit);

		const queryBuilder = this.discussionMessageRepository
			.createQueryBuilder('message')
			.leftJoinAndSelect('message.author', 'author')
			.where('message.discussion_id = :discussionId', { discussionId });

		if (type) {
			queryBuilder.andWhere('message.type = :type', { type });
		}

		const total = await queryBuilder.clone().getCount();

		const data = await queryBuilder
			.clone()
			.orderBy('message.createdAt', 'ASC')
			.addOrderBy('message.id', 'ASC')
			.offset((pagination.page - 1) * pagination.limit)
			.limit(pagination.limit)
			.getMany();

		return {
			data,
			page: pagination.page,
			limit: pagination.limit,
			total,
			totalPages: Math.ceil(total / pagination.limit),
		};
	}

	async updateDiscussionMessage(
		discussionId: string,
		messageId: string,
		dto: DiscussionMessageUpdateDto,
		user: User,
	): Promise<DiscussionMessage> {
		await this.discussionService.findDiscussionByIdForUser(discussionId, user);
		const message = await this.findDiscussionMessageById(discussionId, messageId);
		this.assertIsMessageAuthor(user, message);

		if (message.type !== DiscussionMessageType.TEXT) {
			throw new BadRequestException('Only TEXT messages can be updated');
		}

		message.content = this.normalizeMessageContent(dto.content);
		await this.discussionMessageRepository.save(message);

		try {
			await this.workflowNotificationService.syncMessageUpdated(
				discussionId,
				messageId,
				user,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for message update discussionId=${discussionId} messageId=${messageId} reason=${reason}`,
			);
		}

		return this.findDiscussionMessageById(discussionId, messageId);
	}

	async deleteDiscussionMessage(
		discussionId: string,
		messageId: string,
		user: User,
	): Promise<{ deleted: true; messageId: string }> {
		await this.discussionService.findDiscussionByIdForUser(discussionId, user);
		const message = await this.findDiscussionMessageById(discussionId, messageId);
		this.assertIsMessageAuthor(user, message);

		if (message.cloudinaryPublicId) {
			const resourceType = this.mapStoredAttachmentResourceType(message);
			let deleteResult: { result: string } | null;
			try {
				deleteResult = await this.cloudinaryService.deleteAsset(
					message.cloudinaryPublicId,
					resourceType,
				);
			} catch (error) {
				const reason = error instanceof Error ? error.message : 'unknown';
				this.logger.error(
					`Cloudinary delete failed discussionId=${discussionId} messageId=${messageId} publicId=${message.cloudinaryPublicId} reason=${reason}`,
				);
				throw new InternalServerErrorException(
					'Could not delete attachment from Cloudinary',
				);
			}

			const deleteStatus = (deleteResult?.result ?? '').toLowerCase();
			if (deleteStatus && deleteStatus !== 'ok' && deleteStatus !== 'not found') {
				this.logger.error(
					`Unexpected Cloudinary delete response discussionId=${discussionId} messageId=${messageId} publicId=${message.cloudinaryPublicId} result=${deleteStatus}`,
				);
				throw new InternalServerErrorException(
					'Could not delete attachment from Cloudinary',
				);
			}
		}

		await this.discussionMessageRepository.remove(message);

		try {
			await this.workflowNotificationService.syncMessageDeleted(
				discussionId,
				messageId,
				user,
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(
				`Silent sync failed for message delete discussionId=${discussionId} messageId=${messageId} reason=${reason}`,
			);
		}

		return {
			deleted: true,
			messageId,
		};
	}
}
