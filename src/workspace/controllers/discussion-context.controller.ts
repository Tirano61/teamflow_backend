import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { ValidRoles } from '../../auth/interfaces/valid-roles';
import { AddApplicationToDiscussionDto } from '../dto/add-application-to-discussion.dto';
import { AddIndicatorToDiscussionDto } from '../dto/add-indicator-to-discussion.dto';
import { AddTagToDiscussionDto } from '../dto/add-tag-to-discussion.dto';
import { DiscussionContextService } from '../services/discussion-context.service';

@Controller('workspace')
export class DiscussionContextController {
	constructor(private readonly discussionContextService: DiscussionContextService) { }

	@Post('discussions/:id/applications')
	@Auth(ValidRoles.developer)
	addApplicationToDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AddApplicationToDiscussionDto,
		@GetUser() user: User,
	) {
		return this.discussionContextService.addApplicationToDiscussion(
			id,
			dto.applicationId,
			user,
		);
	}

	@Delete('discussions/:id/applications/:applicationId')
	@Auth(ValidRoles.developer)
	removeApplicationFromDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('applicationId', ParseUUIDPipe) applicationId: string,
		@GetUser() user: User,
	) {
		return this.discussionContextService.removeApplicationFromDiscussion(
			id,
			applicationId,
			user,
		);
	}

	@Post('discussions/:id/indicators')
	@Auth(ValidRoles.developer)
	addIndicatorToDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AddIndicatorToDiscussionDto,
		@GetUser() user: User,
	) {
		return this.discussionContextService.addIndicatorToDiscussion(
			id,
			dto.indicatorId,
			user,
		);
	}

	@Delete('discussions/:id/indicators/:indicatorId')
	@Auth(ValidRoles.developer)
	removeIndicatorFromDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('indicatorId', ParseUUIDPipe) indicatorId: string,
		@GetUser() user: User,
	) {
		return this.discussionContextService.removeIndicatorFromDiscussion(
			id,
			indicatorId,
			user,
		);
	}

	@Post('discussions/:id/tags')
	@Auth(ValidRoles.developer)
	addTagToDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AddTagToDiscussionDto,
	) {
		return this.discussionContextService.addTagToDiscussion(id, dto.tagId);
	}

	@Delete('discussions/:id/tags/:tagId')
	@Auth(ValidRoles.developer)
	removeTagFromDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('tagId', ParseUUIDPipe) tagId: string,
	) {
		return this.discussionContextService.removeTagFromDiscussion(id, tagId);
	}
}
