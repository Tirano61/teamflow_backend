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
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { WorkModuleCreateDto } from '../dto/create-work-module.dto';
import { ComponentCreateDto } from '../dto/create-component.dto';
import { TagCreateDto } from '../dto/create-tag.dto';
import { SetActiveDto } from '../dto/set-active.dto';
import { WorkModuleUpdateDto } from '../dto/update-work-module.dto';
import { ComponentUpdateDto } from '../dto/update-component.dto';
import { TagUpdateDto } from '../dto/update-tag.dto';
import { WorkspaceCatalogService } from '../services/workspace-catalog.service';

@Controller('organizations/:organizationId/workspace')
export class WorkspaceCatalogController {
	constructor(private readonly workspaceCatalogService: WorkspaceCatalogService) {}

	@Get('modules')
	@Auth()
	findAllModules(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findAllModules(
			organizationId,
			user.id,
			false,
		);
	}

	@Get('modules/all')
	@Auth()
	findAllModulesIncludingInactive(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findAllModules(
			organizationId,
			user.id,
			true,
		);
	}

	@Get('modules/:id')
	@Auth()
	findModuleById(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findModuleById(
			organizationId,
			user.id,
			id,
			false,
		);
	}

	@Get('modules/all/:id')
	@Auth()
	findModuleByIdIncludingInactive(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findModuleById(
			organizationId,
			user.id,
			id,
			true,
		);
	}

	@Post('modules')
	@Auth()
	createModule(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Body() dto: WorkModuleCreateDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.createModule(organizationId, user.id, dto);
	}

	@Patch('modules/:id')
	@Auth()
	updateModule(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: WorkModuleUpdateDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.updateModule(
			organizationId,
			user.id,
			id,
			dto,
		);
	}

	@Patch('modules/:id/active')
	@Auth()
	setModuleActive(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetActiveDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.setModuleActive(
			organizationId,
			user.id,
			id,
			dto.active,
		);
	}

	@Get('components')
	@Auth()
	findAllComponents(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findAllComponents(
			organizationId,
			user.id,
			false,
		);
	}

	@Get('components/all')
	@Auth()
	findAllComponentsIncludingInactive(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findAllComponents(
			organizationId,
			user.id,
			true,
		);
	}

	@Get('components/:id')
	@Auth()
	findComponentById(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findComponentById(
			organizationId,
			user.id,
			id,
			false,
		);
	}

	@Get('components/all/:id')
	@Auth()
	findComponentByIdIncludingInactive(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findComponentById(
			organizationId,
			user.id,
			id,
			true,
		);
	}

	@Post('components')
	@Auth()
	createComponent(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Body() dto: ComponentCreateDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.createComponent(organizationId, user.id, dto);
	}

	@Patch('components/:id')
	@Auth()
	updateComponent(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: ComponentUpdateDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.updateComponent(
			organizationId,
			user.id,
			id,
			dto,
		);
	}

	@Patch('components/:id/active')
	@Auth()
	setComponentActive(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetActiveDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.setComponentActive(
			organizationId,
			user.id,
			id,
			dto.active,
		);
	}

	@Post('modules/:moduleId/components/:componentId')
	@Auth()
	addComponentToModule(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('moduleId', ParseUUIDPipe) moduleId: string,
		@Param('componentId', ParseUUIDPipe) componentId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.addComponentToModule(
			organizationId,
			user.id,
			moduleId,
			componentId,
		);
	}

	@Delete('modules/:moduleId/components/:componentId')
	@Auth()
	removeComponentFromModule(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('moduleId', ParseUUIDPipe) moduleId: string,
		@Param('componentId', ParseUUIDPipe) componentId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.removeComponentFromModule(
			organizationId,
			user.id,
			moduleId,
			componentId,
		);
	}

	@Get('modules/:moduleId/components')
	@Auth()
	getComponentsByModule(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('moduleId', ParseUUIDPipe) moduleId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.getComponentsByModule(
			organizationId,
			user.id,
			moduleId,
			false,
		);
	}

	@Get('components/:componentId/modules')
	@Auth()
	getModulesByComponent(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('componentId', ParseUUIDPipe) componentId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.getModulesByComponent(
			organizationId,
			user.id,
			componentId,
			false,
		);
	}

	@Get('tags')
	@Auth()
	findAllTags(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findAllTags(organizationId, user.id, false);
	}

	@Get('tags/all')
	@Auth()
	findAllTagsIncludingInactive(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.findAllTags(organizationId, user.id, true);
	}

	@Post('tags')
	@Auth()
	createTag(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Body() dto: TagCreateDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.createTag(organizationId, user.id, dto);
	}

	@Patch('tags/:id')
	@Auth()
	updateTag(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: TagUpdateDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.updateTag(organizationId, user.id, id, dto);
	}

	@Patch('tags/:id/active')
	@Auth()
	setTagActive(
		@Param('organizationId', ParseUUIDPipe) organizationId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetActiveDto,
		@GetUser() user: User,
	) {
		return this.workspaceCatalogService.setTagActive(
			organizationId,
			user.id,
			id,
			dto.active,
		);
	}
}
