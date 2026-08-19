import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { ValidRoles } from '../../auth/interfaces/valid-roles';
import { AddModuleToDiscussionDto } from '../dto/add-module-to-discussion.dto';
import { AddComponentToDiscussionDto } from '../dto/add-component-to-discussion.dto';
import { AddTagToDiscussionDto } from '../dto/add-tag-to-discussion.dto';
import { DiscussionContextService } from '../services/discussion-context.service';

@Controller('workspace')
export class DiscussionContextController {
	constructor(private readonly discussionContextService: DiscussionContextService) { }

	@Post('discussions/:id/modules')
	@Auth(ValidRoles.developer)
	addModuleToDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AddModuleToDiscussionDto,
		@GetUser() user: User,
	) {
		return this.discussionContextService.addModuleToDiscussion(
			id,
			dto.moduleId,
			user,
		);
	}

	@Delete('discussions/:id/modules/:moduleId')
	@Auth(ValidRoles.developer)
	removeModuleFromDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('moduleId', ParseUUIDPipe) moduleId: string,
		@GetUser() user: User,
	) {
		return this.discussionContextService.removeModuleFromDiscussion(
			id,
			moduleId,
			user,
		);
	}

	@Post('discussions/:id/components')
	@Auth(ValidRoles.developer)
	addComponentToDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AddComponentToDiscussionDto,
		@GetUser() user: User,
	) {
		return this.discussionContextService.addComponentToDiscussion(
			id,
			dto.componentId,
			user,
		);
	}

	@Delete('discussions/:id/components/:componentId')
	@Auth(ValidRoles.developer)
	removeComponentFromDiscussion(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('componentId', ParseUUIDPipe) componentId: string,
		@GetUser() user: User,
	) {
		return this.discussionContextService.removeComponentFromDiscussion(
			id,
			componentId,
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
