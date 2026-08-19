import {
	Body,
	Controller,
	DefaultValuePipe,
	Delete,
	Get,
	Param,
	ParseEnumPipe,
	ParseIntPipe,
	ParseUUIDPipe,
	Options,
	Patch,
	Post,
	Query,
	Res,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { DiscussionAttachmentCreateDto } from '../dto/create-discussion-attachment.dto';
import { DiscussionMessageCreateDto } from '../dto/create-discussion-message.dto';
import { DiscussionMessageUpdateDto } from '../dto/update-discussion-message.dto';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';
import { DiscussionMessageService } from '../services/discussion-message.service';

const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const configuredMaxFileSize = Number(process.env.WORKSPACE_ATTACHMENT_MAX_FILE_SIZE_BYTES);
const MAX_FILE_SIZE_BYTES =
	Number.isFinite(configuredMaxFileSize) && configuredMaxFileSize > 0
		? configuredMaxFileSize
		: DEFAULT_MAX_FILE_SIZE_BYTES;

@Controller('organizations/:organizationId/workspace')
export class DiscussionMessageController {
	constructor(private readonly discussionMessageService: DiscussionMessageService) {}

	@Post('discussions/:discussionId/messages')
	@Auth()
	createDiscussionMessage(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('discussionId', ParseUUIDPipe) discussionId: string,
		@Body() dto: DiscussionMessageCreateDto,
		@GetUser() user: User,
	) {
		return this.discussionMessageService.createDiscussionMessage(
			organizationId,
			discussionId,
			dto,
			user,
		);
	}

	@Post('discussions/:discussionId/messages/files')
	@Auth()
	@UseInterceptors(
		FileInterceptor('file', {
			storage: memoryStorage(),
			limits: {
				fileSize: MAX_FILE_SIZE_BYTES,
			},
		}),
	)
	createDiscussionAttachmentMessage(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('discussionId', ParseUUIDPipe) discussionId: string,
		@Body() dto: DiscussionAttachmentCreateDto,
		@UploadedFile() file: Express.Multer.File,
		@GetUser() user: User,
	) {
		return this.discussionMessageService.createDiscussionAttachmentMessage(
			organizationId,
			discussionId,
			dto,
			file,
			user,
		);
	}

	@Options('discussions/:discussionId/messages/files')
	optionsDiscussionAttachmentMessageUpload(@Res() response: Response) {
		response.status(204).send();
	}

	@Get('discussions/:discussionId/messages')
	@Auth()
	findDiscussionMessages(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('discussionId', ParseUUIDPipe) discussionId: string,
		@GetUser() user: User,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
		@Query('type', new ParseEnumPipe(DiscussionMessageType, { optional: true }))
		type?: DiscussionMessageType,
	) {
		return this.discussionMessageService.findDiscussionMessages(
			organizationId,
			discussionId,
			page,
			limit,
			user,
			type,
		);
	}

	@Patch('discussions/:discussionId/messages/:messageId')
	@Auth()
	updateDiscussionMessage(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('discussionId', ParseUUIDPipe) discussionId: string,
		@Param('messageId', ParseUUIDPipe) messageId: string,
		@Body() dto: DiscussionMessageUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionMessageService.updateDiscussionMessage(
			organizationId,
			discussionId,
			messageId,
			dto,
			user,
		);
	}

	@Delete('discussions/:discussionId/messages/:messageId')
	@Auth()
	deleteDiscussionMessage(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('discussionId', ParseUUIDPipe) discussionId: string,
		@Param('messageId', ParseUUIDPipe) messageId: string,
		@GetUser() user: User,
	) {
		return this.discussionMessageService.deleteDiscussionMessage(
			organizationId,
			discussionId,
			messageId,
			user,
		);
	}
}
