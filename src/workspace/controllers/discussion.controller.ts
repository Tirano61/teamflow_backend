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
import { ValidRoles } from '../../auth/interfaces/valid-roles';
import { DiscussionCreateDto } from '../dto/create-discussion.dto';
import { DiscussionAssignmentsUpdateDto } from '../dto/update-discussion-assignments.dto';
import { DiscussionStatusUpdateDto } from '../dto/update-discussion-status.dto';
import { DiscussionUpdateDto } from '../dto/update-discussion.dto';
import { DiscussionStatus } from '../enums/discussion-status.enum';
import { DiscussionType } from '../enums/discussion-type.enum';
import { DiscussionService } from '../services/discussion.service';

@Controller('workspace')
export class DiscussionController {
	constructor(private readonly discussionService: DiscussionService) { }

	@Post('discussions')
	@Auth()
	createDiscussion(@Body() dto: DiscussionCreateDto, @GetUser() user: User) {
		return this.discussionService.createDiscussion(dto, user);
	}

	@Get('discussions')
	@Auth()
	findDiscussions(
		@GetUser() user: User,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
		@Query('type', new ParseEnumPipe(DiscussionType, { optional: true }))
		type?: DiscussionType,
		@Query('status', new ParseEnumPipe(DiscussionStatus, { optional: true }))
		status?: DiscussionStatus,
		@Query('applicationIds') applicationIds?: string,
		@Query('indicatorIds') indicatorIds?: string,
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
			{
				page,
				limit,
				type,
				status,
				applicationIds,
				indicatorIds,
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
		@Param('id', ParseUUIDPipe) id: string,
		@GetUser() user: User,
	) {
		return this.discussionService.findDiscussionByIdForUser(id, user);
	}

	@Post('discussions/:id/read')
	@Auth()
	markDiscussionAsRead(
		@Param('id', ParseUUIDPipe) id: string,
		@GetUser() user: User,
	) {
		return this.discussionService.markDiscussionAsRead(id, user);
	}

	@Patch('discussions/:id')
	@Auth()
	updateDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: DiscussionUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.updateDiscussion(id, dto, user);
	}

	@Patch('discussions/:id/status')
	@Auth(ValidRoles.developer)
	updateDiscussionStatus(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: DiscussionStatusUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.updateDiscussionStatus(id, dto.status, user);
	}

	@Post('discussions/:id/assignments')
	@Auth(ValidRoles.developer)
	addDiscussionAssignments(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: DiscussionAssignmentsUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.addDeveloperAssignments(
			id,
			dto.developerUserIds,
			user,
		);
	}

	@Put('discussions/:id/assignments')
	@Auth(ValidRoles.developer)
	replaceDiscussionAssignments(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: DiscussionAssignmentsUpdateDto,
		@GetUser() user: User,
	) {
		return this.discussionService.replaceDeveloperAssignments(
			id,
			dto.developerUserIds,
			user,
		);
	}

	@Delete('discussions/:id/assignments/:developerUserId')
	@Auth(ValidRoles.developer)
	removeDiscussionAssignment(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('developerUserId', ParseUUIDPipe) developerUserId: string,
		@GetUser() user: User,
	) {
		return this.discussionService.removeDeveloperAssignment(
			id,
			developerUserId,
			user,
		);
	}

	@Get('developers')
	@Auth()
	findAssignableDevelopers() {
		return this.discussionService.findAssignableDevelopers();
	}
}
