import {
	Controller,
	Delete,
	Get,
	Post,
	Patch,
	Put,
	Body,
	Param,
	ParseUUIDPipe,
	Query,
	DefaultValuePipe,
	ParseIntPipe,
	ParseEnumPipe,
	ParseBoolPipe,
} from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { DiscussionCreateDto } from '../dto/create-discussion.dto';
import { DiscussionAssignmentsUpdateDto } from '../dto/update-discussion-assignments.dto';
import { DiscussionStatusUpdateDto } from '../dto/update-discussion-status.dto';
import { DiscussionUpdateDto } from '../dto/update-discussion.dto';
import { DiscussionStatus } from '../enums/discussion-status.enum';
import { DiscussionType } from '../enums/discussion-type.enum';
import { DiscussionService } from '../services/discussion.service';

@Controller('organizations/:organizationId/workspace')
export class DiscussionController {
	constructor(private readonly discussionService: DiscussionService) {}

	@Post('discussions')
	@Auth()
	createDiscussion(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Body() dto: DiscussionCreateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.createDiscussion(organizationId, dto, user);
	}

	@Get('discussions')
	@Auth()
	findDiscussions(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@GetUser() user: User,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
		@Query('type', new ParseEnumPipe(DiscussionType, { optional: true }))
		type?: DiscussionType,
		@Query('status', new ParseEnumPipe(DiscussionStatus, { optional: true }))
		status?: DiscussionStatus,
		@Query('moduleIds') moduleIds?: string,
		@Query('componentIds') componentIds?: string,
		@Query('tagIds') tagIds?: string,
		@Query('createdBy') createdBy?: string,
		@Query('mine', new DefaultValuePipe(false), ParseBoolPipe) mine?: boolean,
		@Query('assignedToMe', new DefaultValuePipe(false), ParseBoolPipe)
		assignedToMe?: boolean,
		@Query('assignedDeveloperId') assignedDeveloperId?: string,
		@Query('unread', new DefaultValuePipe(false), ParseBoolPipe)
		unread?: boolean,
	) {
		return this.discussionService.findDiscussions(
			organizationId,
			{
				page,
				limit,
				type,
				status,
				moduleIds,
				componentIds,
				tagIds,
				createdBy,
				mine: mine ?? false,
				assignedToMe: assignedToMe ?? false,
				assignedDeveloperId,
				unread: unread ?? false,
			},
			user,
		);
	}

	@Get('discussions/:id')
	@Auth()
	findDiscussionById(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@GetUser() user: User,
	) {
		return this.discussionService.findDiscussionByIdForUser(organizationId, id, user);
	}

	@Post('discussions/:id/read')
	@Auth()
	markDiscussionAsRead(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@GetUser() user: User,
	) {
		return this.discussionService.markDiscussionAsRead(organizationId, id, user);
	}

	@Patch('discussions/:id')
	@Auth()
	updateDiscussion(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: DiscussionUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.updateDiscussion(organizationId, id, dto, user);
	}

	@Patch('discussions/:id/status')
	@Auth()
	updateDiscussionStatus(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: DiscussionStatusUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.updateDiscussionStatus(
			organizationId,
			id,
			dto.status,
			user,
		);
	}

	@Post('discussions/:id/assignments')
	@Auth()
	addDiscussionAssignments(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: DiscussionAssignmentsUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.addDeveloperAssignments(
			organizationId,
			id,
			dto.developerUserIds,
			user,
		);
	}

	@Put('discussions/:id/assignments')
	@Auth()
	replaceDiscussionAssignments(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: DiscussionAssignmentsUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.replaceDeveloperAssignments(
			organizationId,
			id,
			dto.developerUserIds,
			user,
		);
	}

	@Delete('discussions/:id/assignments/:developerUserId')
	@Auth()
	removeDiscussionAssignment(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('developerUserId', ParseUUIDPipe) developerUserId: string,
		@GetUser() user: User,
	) {
		return this.discussionService.removeDeveloperAssignment(
			organizationId,
			id,
			developerUserId,
			user,
		);
	}

	@Get('developers')
	@Auth()
	findAssignableDevelopers(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@GetUser() user: User,
	) {
		return this.discussionService.findAssignableDevelopers(organizationId, user);
	}
}
