import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { WorkModuleCreateDto } from '../dto/create-work-module.dto';
import { ComponentCreateDto } from '../dto/create-component.dto';
import { TagCreateDto } from '../dto/create-tag.dto';
import { WorkModuleUpdateDto } from '../dto/update-work-module.dto';
import { ComponentUpdateDto } from '../dto/update-component.dto';
import { TagUpdateDto } from '../dto/update-tag.dto';
import { WorkModule } from '../entities/work-module.entity';
import { Component } from '../entities/component.entity';
import { Tag } from '../entities/tag.entity';
import { WorkspaceOrganizationAccessService } from './workspace-organization-access.service';

@Injectable()
export class WorkspaceCatalogService {
	constructor(
		@InjectRepository(WorkModule)
		private readonly workModuleRepository: Repository<WorkModule>,
		@InjectRepository(Component)
		private readonly componentRepository: Repository<Component>,
		@InjectRepository(Tag)
		private readonly tagRepository: Repository<Tag>,
		private readonly orgAccessService: WorkspaceOrganizationAccessService,
	) {}

	private normalizeName(name: string): { display: string; normalized: string } {
		const display = name.trim();
		if (!display) throw new BadRequestException('Name cannot be empty');
		return { display, normalized: display.toLocaleLowerCase() };
	}

	private async requireActiveMembership(userId: string, organizationId: string) {
		return this.orgAccessService.requireActiveMembership(userId, organizationId);
	}

	private async requireCatalogManagement(userId: string, organizationId: string) {
		const membership = await this.requireActiveMembership(userId, organizationId);
		this.orgAccessService.assertCanManageCatalog(membership);
		return membership;
	}

	async createModule(
		organizationId: string,
		userId: string,
		dto: WorkModuleCreateDto,
	): Promise<WorkModule> {
		await this.requireCatalogManagement(userId, organizationId);
		const name = this.normalizeName(dto.name).display;
		const existing = await this.workModuleRepository.findOne({
			where: { organizationId, name: ILike(name) },
		});
		if (existing) throw new BadRequestException('Module already exists');

		const entity = this.workModuleRepository.create({
			organizationId,
			organization: { id: organizationId } as any,
			name,
			description: dto.description,
			active: true,
		});

		return this.workModuleRepository.save(entity);
	}

	async findModuleById(
		organizationId: string,
		userId: string,
		id: string,
		includeInactive = false,
	): Promise<WorkModule> {
		await this.requireActiveMembership(userId, organizationId);
		const where = includeInactive
			? { id, organizationId }
			: { id, organizationId, active: true };
		const module = await this.workModuleRepository.findOne({
			where,
			relations: ['components'],
		});
		if (!module) throw new NotFoundException('Module not found');
		return module;
	}

	async findAllModules(
		organizationId: string,
		userId: string,
		includeInactive = false,
	): Promise<WorkModule[]> {
		await this.requireActiveMembership(userId, organizationId);
		const where = includeInactive
			? { organizationId }
			: { organizationId, active: true };
		return this.workModuleRepository.find({
			where,
			order: { createdAt: 'DESC' },
			relations: ['components'],
		});
	}

	async updateModule(
		organizationId: string,
		userId: string,
		id: string,
		dto: WorkModuleUpdateDto,
	): Promise<WorkModule> {
		await this.requireCatalogManagement(userId, organizationId);
		const module = await this.workModuleRepository.findOne({
			where: { id, organizationId },
		});
		if (!module) throw new NotFoundException('Module not found');

		if (dto.name) {
			const normalizedName = this.normalizeName(dto.name).display;
			const existing = await this.workModuleRepository.findOne({
				where: { organizationId, name: ILike(normalizedName) },
			});
			if (existing && existing.id !== id)
				throw new BadRequestException('Module already exists');
			module.name = normalizedName;
		}

		if (dto.description !== undefined) module.description = dto.description;

		return this.workModuleRepository.save(module);
	}

	async setModuleActive(
		organizationId: string,
		userId: string,
		id: string,
		active: boolean,
	): Promise<WorkModule> {
		await this.requireCatalogManagement(userId, organizationId);
		const module = await this.workModuleRepository.findOne({
			where: { id, organizationId },
		});
		if (!module) throw new NotFoundException('Module not found');
		module.active = active;
		return this.workModuleRepository.save(module);
	}

	async createComponent(
		organizationId: string,
		userId: string,
		dto: ComponentCreateDto,
	): Promise<Component> {
		await this.requireCatalogManagement(userId, organizationId);
		const name = this.normalizeName(dto.name).display;
		const existing = await this.componentRepository.findOne({
			where: { organizationId, name: ILike(name) },
		});
		if (existing) throw new BadRequestException('Component already exists');

		const entity = this.componentRepository.create({
			organizationId,
			organization: { id: organizationId } as any,
			name,
			description: dto.description,
			active: true,
		});

		return this.componentRepository.save(entity);
	}

	async findComponentById(
		organizationId: string,
		userId: string,
		id: string,
		includeInactive = false,
	): Promise<Component> {
		await this.requireActiveMembership(userId, organizationId);
		const where = includeInactive
			? { id, organizationId }
			: { id, organizationId, active: true };
		const component = await this.componentRepository.findOne({
			where,
			relations: ['workModules'],
		});
		if (!component) throw new NotFoundException('Component not found');
		return component;
	}

	async findAllComponents(
		organizationId: string,
		userId: string,
		includeInactive = false,
	): Promise<Component[]> {
		await this.requireActiveMembership(userId, organizationId);
		const where = includeInactive
			? { organizationId }
			: { organizationId, active: true };
		return this.componentRepository.find({
			where,
			order: { createdAt: 'DESC' },
			relations: ['workModules'],
		});
	}

	async updateComponent(
		organizationId: string,
		userId: string,
		id: string,
		dto: ComponentUpdateDto,
	): Promise<Component> {
		await this.requireCatalogManagement(userId, organizationId);
		const component = await this.componentRepository.findOne({
			where: { id, organizationId },
		});
		if (!component) throw new NotFoundException('Component not found');

		if (dto.name) {
			const normalizedName = this.normalizeName(dto.name).display;
			const existing = await this.componentRepository.findOne({
				where: { organizationId, name: ILike(normalizedName) },
			});
			if (existing && existing.id !== id)
				throw new BadRequestException('Component already exists');
			component.name = normalizedName;
		}

		if (dto.description !== undefined) component.description = dto.description;

		return this.componentRepository.save(component);
	}

	async setComponentActive(
		organizationId: string,
		userId: string,
		id: string,
		active: boolean,
	): Promise<Component> {
		await this.requireCatalogManagement(userId, organizationId);
		const component = await this.componentRepository.findOne({
			where: { id, organizationId },
		});
		if (!component) throw new NotFoundException('Component not found');
		component.active = active;
		return this.componentRepository.save(component);
	}

	async addComponentToModule(
		organizationId: string,
		userId: string,
		moduleId: string,
		componentId: string,
	): Promise<WorkModule> {
		await this.requireCatalogManagement(userId, organizationId);
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId, organizationId },
			relations: ['components'],
		});
		if (!module) throw new NotFoundException('Module not found');

		const component = await this.componentRepository.findOne({
			where: { id: componentId, organizationId },
		});
		if (!component) throw new NotFoundException('Component not found');

		if (module.organizationId !== component.organizationId) {
			throw new BadRequestException('Module and component must belong to the same organization');
		}

		const alreadyRelated = (module.components ?? []).some(
			(item) => item.id === component.id,
		);
		if (alreadyRelated) {
			throw new BadRequestException('Module and component relation already exists');
		}

		module.components = [...(module.components ?? []), component];
		return this.workModuleRepository.save(module);
	}

	async removeComponentFromModule(
		organizationId: string,
		userId: string,
		moduleId: string,
		componentId: string,
	): Promise<WorkModule> {
		await this.requireCatalogManagement(userId, organizationId);
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId, organizationId },
			relations: ['components'],
		});
		if (!module) throw new NotFoundException('Module not found');

		const hasRelation = (module.components ?? []).some(
			(item) => item.id === componentId,
		);
		if (!hasRelation) {
			throw new NotFoundException('Module and component relation not found');
		}

		module.components = (module.components ?? []).filter(
			(item) => item.id !== componentId,
		);
		return this.workModuleRepository.save(module);
	}

	async getComponentsByModule(
		organizationId: string,
		userId: string,
		moduleId: string,
		includeInactive = false,
	): Promise<Component[]> {
		await this.requireActiveMembership(userId, organizationId);
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId, organizationId },
			relations: ['components'],
		});
		if (!module) throw new NotFoundException('Module not found');
		if (includeInactive) return module.components ?? [];
		return (module.components ?? []).filter((item) => item.active);
	}

	async getModulesByComponent(
		organizationId: string,
		userId: string,
		componentId: string,
		includeInactive = false,
	): Promise<WorkModule[]> {
		await this.requireActiveMembership(userId, organizationId);
		const component = await this.componentRepository.findOne({
			where: { id: componentId, organizationId },
			relations: ['workModules'],
		});
		if (!component) throw new NotFoundException('Component not found');
		if (includeInactive) return component.workModules ?? [];
		return (component.workModules ?? []).filter((item) => item.active);
	}

	async findAllTags(
		organizationId: string,
		userId: string,
		includeInactive = false,
	): Promise<Tag[]> {
		await this.requireActiveMembership(userId, organizationId);
		const where = includeInactive
			? { organizationId }
			: { organizationId, active: true };
		return this.tagRepository.find({
			where,
			order: { createdAt: 'DESC' },
		});
	}

	async createTag(
		organizationId: string,
		userId: string,
		dto: TagCreateDto,
	): Promise<Tag> {
		await this.requireCatalogManagement(userId, organizationId);
		const { display, normalized } = this.normalizeName(dto.name);
		const existing = await this.tagRepository.findOne({
			where: { organizationId, normalizedName: normalized },
		});
		if (existing) throw new BadRequestException('Tag already exists');

		const tag = this.tagRepository.create({
			organizationId,
			organization: { id: organizationId } as any,
			name: display,
			normalizedName: normalized,
			active: true,
		});

		return this.tagRepository.save(tag);
	}

	async updateTag(
		organizationId: string,
		userId: string,
		id: string,
		dto: TagUpdateDto,
	): Promise<Tag> {
		await this.requireCatalogManagement(userId, organizationId);
		const tag = await this.tagRepository.findOne({
			where: { id, organizationId },
		});
		if (!tag) throw new NotFoundException('Tag not found');

		if (dto.name !== undefined) {
			const { display, normalized } = this.normalizeName(dto.name);
			const existing = await this.tagRepository.findOne({
				where: { organizationId, normalizedName: normalized },
			});
			if (existing && existing.id !== id) {
				throw new BadRequestException('Tag already exists');
			}
			tag.name = display;
			tag.normalizedName = normalized;
		}

		return this.tagRepository.save(tag);
	}

	async setTagActive(
		organizationId: string,
		userId: string,
		id: string,
		active: boolean,
	): Promise<Tag> {
		await this.requireCatalogManagement(userId, organizationId);
		const tag = await this.tagRepository.findOne({
			where: { id, organizationId },
		});
		if (!tag) throw new NotFoundException('Tag not found');
		tag.active = active;
		return this.tagRepository.save(tag);
	}
}
