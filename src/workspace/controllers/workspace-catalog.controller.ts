import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
} from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { ValidRoles } from '../../auth/interfaces/valid-roles';
import { ApplicationCreateDto } from '../dto/create-application.dto';
import { IndicatorCreateDto } from '../dto/create-indicator.dto';
import { TagCreateDto } from '../dto/create-tag.dto';
import { SetActiveDto } from '../dto/set-active.dto';
import { ApplicationUpdateDto } from '../dto/update-application.dto';
import { IndicatorUpdateDto } from '../dto/update-indicator.dto';
import { TagUpdateDto } from '../dto/update-tag.dto';
import { WorkspaceCatalogService } from '../services/workspace-catalog.service';

@Controller('workspace')
export class WorkspaceCatalogController {
	constructor(
		private readonly workspaceCatalogService: WorkspaceCatalogService,
	) { }

	@Get('applications')
	@Auth()
	findAllApplications() {
		return this.workspaceCatalogService.findAllApplications(false);
	}

	@Get('applications/all')
	@Auth(ValidRoles.developer)
	findAllApplicationsIncludingInactive() {
		return this.workspaceCatalogService.findAllApplications(true);
	}

	@Get('applications/:id')
	@Auth()
	findApplicationById(@Param('id', ParseUUIDPipe) id: string) {
		return this.workspaceCatalogService.findApplicationById(id, false);
	}

	@Get('applications/all/:id')
	@Auth(ValidRoles.developer)
	findApplicationByIdIncludingInactive(@Param('id', ParseUUIDPipe) id: string) {
		return this.workspaceCatalogService.findApplicationById(id, true);
	}

	@Post('applications')
	@Auth(ValidRoles.developer)
	createApplication(@Body() dto: ApplicationCreateDto) {
		return this.workspaceCatalogService.createApplication(dto);
	}

	@Patch('applications/:id')
	@Auth(ValidRoles.developer)
	updateApplication(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: ApplicationUpdateDto,
	) {
		return this.workspaceCatalogService.updateApplication(id, dto);
	}

	@Patch('applications/:id/active')
	@Auth(ValidRoles.developer)
	setApplicationActive(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetActiveDto,
	) {
		return this.workspaceCatalogService.setApplicationActive(id, dto.active);
	}

	@Get('indicators')
	@Auth()
	findAllIndicators() {
		return this.workspaceCatalogService.findAllIndicators(false);
	}

	@Get('indicators/all')
	@Auth(ValidRoles.developer)
	findAllIndicatorsIncludingInactive() {
		return this.workspaceCatalogService.findAllIndicators(true);
	}

	@Get('indicators/:id')
	@Auth()
	findIndicatorById(@Param('id', ParseUUIDPipe) id: string) {
		return this.workspaceCatalogService.findIndicatorById(id, false);
	}

	@Get('indicators/all/:id')
	@Auth(ValidRoles.developer)
	findIndicatorByIdIncludingInactive(@Param('id', ParseUUIDPipe) id: string) {
		return this.workspaceCatalogService.findIndicatorById(id, true);
	}

	@Post('indicators')
	@Auth(ValidRoles.developer)
	createIndicator(@Body() dto: IndicatorCreateDto) {
		return this.workspaceCatalogService.createIndicator(dto);
	}

	@Patch('indicators/:id')
	@Auth(ValidRoles.developer)
	updateIndicator(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: IndicatorUpdateDto,
	) {
		return this.workspaceCatalogService.updateIndicator(id, dto);
	}

	@Patch('indicators/:id/active')
	@Auth(ValidRoles.developer)
	setIndicatorActive(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetActiveDto,
	) {
		return this.workspaceCatalogService.setIndicatorActive(id, dto.active);
	}

	@Post('applications/:applicationId/indicators/:indicatorId')
	@Auth(ValidRoles.developer)
	addIndicatorToApplication(
		@Param('applicationId', ParseUUIDPipe) applicationId: string,
		@Param('indicatorId', ParseUUIDPipe) indicatorId: string,
	) {
		return this.workspaceCatalogService.addIndicatorToApplication(
			applicationId,
			indicatorId,
		);
	}

	@Delete('applications/:applicationId/indicators/:indicatorId')
	@Auth(ValidRoles.developer)
	removeIndicatorFromApplication(
		@Param('applicationId', ParseUUIDPipe) applicationId: string,
		@Param('indicatorId', ParseUUIDPipe) indicatorId: string,
	) {
		return this.workspaceCatalogService.removeIndicatorFromApplication(
			applicationId,
			indicatorId,
		);
	}

	@Get('applications/:applicationId/indicators')
	@Auth()
	getIndicatorsByApplication(
		@Param('applicationId', ParseUUIDPipe) applicationId: string,
	) {
		return this.workspaceCatalogService.getIndicatorsByApplication(
			applicationId,
			false,
		);
	}

	@Get('indicators/:indicatorId/applications')
	@Auth()
	getApplicationsByIndicator(
		@Param('indicatorId', ParseUUIDPipe) indicatorId: string,
	) {
		return this.workspaceCatalogService.getApplicationsByIndicator(
			indicatorId,
			false,
		);
	}

	@Get('tags')
	@Auth()
	findAllTags() {
		return this.workspaceCatalogService.findAllTags(false);
	}

	@Get('tags/all')
	@Auth(ValidRoles.developer)
	findAllTagsIncludingInactive() {
		return this.workspaceCatalogService.findAllTags(true);
	}

	@Post('tags')
	@Auth(ValidRoles.developer)
	createTag(@Body() dto: TagCreateDto) {
		return this.workspaceCatalogService.createTag(dto);
	}

	@Patch('tags/:id')
	@Auth(ValidRoles.developer)
	updateTag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TagUpdateDto) {
		return this.workspaceCatalogService.updateTag(id, dto);
	}

	@Patch('tags/:id/active')
	@Auth(ValidRoles.developer)
	setTagActive(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetActiveDto,
	) {
		return this.workspaceCatalogService.setTagActive(id, dto.active);
	}
}
