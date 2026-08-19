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
import { WorkModuleCreateDto } from '../dto/create-work-module.dto';
import { ComponentCreateDto } from '../dto/create-component.dto';
import { TagCreateDto } from '../dto/create-tag.dto';
import { SetActiveDto } from '../dto/set-active.dto';
import { WorkModuleUpdateDto } from '../dto/update-work-module.dto';
import { ComponentUpdateDto } from '../dto/update-component.dto';
import { TagUpdateDto } from '../dto/update-tag.dto';
import { WorkspaceCatalogService } from '../services/workspace-catalog.service';

@Controller('workspace')
export class WorkspaceCatalogController {
	constructor(
		private readonly workspaceCatalogService: WorkspaceCatalogService,
	) { }

	@Get('modules')
	@Auth()
	findAllModules() {
		return this.workspaceCatalogService.findAllModules(false);
	}

	@Get('modules/all')
	@Auth(ValidRoles.developer)
	findAllModulesIncludingInactive() {
		return this.workspaceCatalogService.findAllModules(true);
	}

	@Get('modules/:id')
	@Auth()
	findModuleById(@Param('id', ParseUUIDPipe) id: string) {
		return this.workspaceCatalogService.findModuleById(id, false);
	}

	@Get('modules/all/:id')
	@Auth(ValidRoles.developer)
	findModuleByIdIncludingInactive(@Param('id', ParseUUIDPipe) id: string) {
		return this.workspaceCatalogService.findModuleById(id, true);
	}

	@Post('modules')
	@Auth(ValidRoles.developer)
	createModule(@Body() dto: WorkModuleCreateDto) {
		return this.workspaceCatalogService.createModule(dto);
	}

	@Patch('modules/:id')
	@Auth(ValidRoles.developer)
	updateModule(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: WorkModuleUpdateDto,
	) {
		return this.workspaceCatalogService.updateModule(id, dto);
	}

	@Patch('modules/:id/active')
	@Auth(ValidRoles.developer)
	setModuleActive(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetActiveDto,
	) {
		return this.workspaceCatalogService.setModuleActive(id, dto.active);
	}

	@Get('components')
	@Auth()
	findAllComponents() {
		return this.workspaceCatalogService.findAllComponents(false);
	}

	@Get('components/all')
	@Auth(ValidRoles.developer)
	findAllComponentsIncludingInactive() {
		return this.workspaceCatalogService.findAllComponents(true);
	}

	@Get('components/:id')
	@Auth()
	findComponentById(@Param('id', ParseUUIDPipe) id: string) {
		return this.workspaceCatalogService.findComponentById(id, false);
	}

	@Get('components/all/:id')
	@Auth(ValidRoles.developer)
	findComponentByIdIncludingInactive(@Param('id', ParseUUIDPipe) id: string) {
		return this.workspaceCatalogService.findComponentById(id, true);
	}

	@Post('components')
	@Auth(ValidRoles.developer)
	createComponent(@Body() dto: ComponentCreateDto) {
		return this.workspaceCatalogService.createComponent(dto);
	}

	@Patch('components/:id')
	@Auth(ValidRoles.developer)
	updateComponent(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: ComponentUpdateDto,
	) {
		return this.workspaceCatalogService.updateComponent(id, dto);
	}

	@Patch('components/:id/active')
	@Auth(ValidRoles.developer)
	setComponentActive(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetActiveDto,
	) {
		return this.workspaceCatalogService.setComponentActive(id, dto.active);
	}

	@Post('modules/:moduleId/components/:componentId')
	@Auth(ValidRoles.developer)
	addComponentToModule(
		@Param('moduleId', ParseUUIDPipe) moduleId: string,
		@Param('componentId', ParseUUIDPipe) componentId: string,
	) {
		return this.workspaceCatalogService.addComponentToModule(
			moduleId,
			componentId,
		);
	}

	@Delete('modules/:moduleId/components/:componentId')
	@Auth(ValidRoles.developer)
	removeComponentFromModule(
		@Param('moduleId', ParseUUIDPipe) moduleId: string,
		@Param('componentId', ParseUUIDPipe) componentId: string,
	) {
		return this.workspaceCatalogService.removeComponentFromModule(
			moduleId,
			componentId,
		);
	}

	@Get('modules/:moduleId/components')
	@Auth()
	getComponentsByModule(
		@Param('moduleId', ParseUUIDPipe) moduleId: string,
	) {
		return this.workspaceCatalogService.getComponentsByModule(
			moduleId,
			false,
		);
	}

	@Get('components/:componentId/modules')
	@Auth()
	getModulesByComponent(
		@Param('componentId', ParseUUIDPipe) componentId: string,
	) {
		return this.workspaceCatalogService.getModulesByComponent(
			componentId,
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
