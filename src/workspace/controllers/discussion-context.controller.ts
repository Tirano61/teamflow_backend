import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { AddModuleToDiscussionDto } from '../dto/add-module-to-discussion.dto';
import { AddComponentToDiscussionDto } from '../dto/add-component-to-discussion.dto';
import { AddTagToDiscussionDto } from '../dto/add-tag-to-discussion.dto';
import { DiscussionContextService } from '../services/discussion-context.service';

@Controller('organizations/:organizationId/workspace')
export class DiscussionContextController {
	constructor(private readonly discussionContextService: DiscussionContextService) {}

	@Post('discussions/:id/modules')
	@Auth()
	addModuleToDiscussion(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AddModuleToDiscussionDto,
		@GetUser() user: User,
	) {
		return this.discussionContextService.addModuleToDiscussion(
			organizationId,
			id,
			dto.moduleId,
			user,
		);
	}

	@Delete('discussions/:id/modules/:moduleId')
	@Auth()
	removeModuleFromDiscussion(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('moduleId', ParseUUIDPipe) moduleId: string,
		@GetUser() user: User,
	) {
		return this.discussionContextService.removeModuleFromDiscussion(
			organizationId,
			id,
			moduleId,
			user,
		);
	}

	@Post('discussions/:id/components')
	@Auth()
	addComponentToDiscussion(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AddComponentToDiscussionDto,
		@GetUser() user: User,
	) {
		return this.discussionContextService.addComponentToDiscussion(
			organizationId,
			id,
			dto.componentId,
			user,
		);
	}

	@Delete('discussions/:id/components/:componentId')
	@Auth()
	removeComponentFromDiscussion(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('componentId', ParseUUIDPipe) componentId: string,
		@GetUser() user: User,
	) {
		return this.discussionContextService.removeComponentFromDiscussion(
			organizationId,
			id,
			componentId,
			user,
		);
	}

	@Post('discussions/:id/tags')
	@Auth()
	addTagToDiscussion(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AddTagToDiscussionDto,
		@GetUser() user: User,
	) {
		return this.discussionContextService.addTagToDiscussion(
			organizationId,
			id,
			dto.tagId,
			user,
		);
	}

	@Delete('discussions/:id/tags/:tagId')
	@Auth()
	removeTagFromDiscussion(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('tagId', ParseUUIDPipe) tagId: string,
		@GetUser() user: User,
	) {
		return this.discussionContextService.removeTagFromDiscussion(
			organizationId,
			id,
			tagId,
			user,
		);
	}
}
