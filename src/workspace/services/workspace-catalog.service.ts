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

@Injectable()
export class WorkspaceCatalogService {
	constructor(
		@InjectRepository(WorkModule)
		private readonly workModuleRepository: Repository<WorkModule>,
		@InjectRepository(Component)
		private readonly componentRepository: Repository<Component>,
		@InjectRepository(Tag)
		private readonly tagRepository: Repository<Tag>,
	) { }

	private normalizeName(name: string): string {
		const normalized = name.trim();
		if (!normalized) throw new BadRequestException('Name cannot be empty');
		return normalized;
	}

	async createModule(dto: WorkModuleCreateDto): Promise<WorkModule> {
		const name = this.normalizeName(dto.name);
		const existing = await this.workModuleRepository.findOne({
			where: { name: ILike(name) },
		});
		if (existing) throw new BadRequestException('Module already exists');

		const entity = this.workModuleRepository.create({
			name,
			description: dto.description,
			active: true,
		});

		return this.workModuleRepository.save(entity);
	}

	async findModuleById(
		id: string,
		includeInactive = false,
	): Promise<WorkModule> {
		const where = includeInactive ? { id } : { id, active: true };
		const module = await this.workModuleRepository.findOne({
			where,
			relations: ['components'],
		});
		if (!module) throw new NotFoundException('Module not found');
		return module;
	}

	async findAllModules(includeInactive = false): Promise<WorkModule[]> {
		const where = includeInactive ? {} : { active: true };
		return this.workModuleRepository.find({
			where,
			order: { createdAt: 'DESC' },
			relations: ['components'],
		});
	}

	async updateModule(
		id: string,
		dto: WorkModuleUpdateDto,
	): Promise<WorkModule> {
		const module = await this.workModuleRepository.findOne({
			where: { id },
		});
		if (!module) throw new NotFoundException('Module not found');

		if (dto.name) {
			const normalizedName = this.normalizeName(dto.name);
			const existing = await this.workModuleRepository.findOne({
				where: { name: ILike(normalizedName) },
			});
			if (existing && existing.id !== id)
				throw new BadRequestException('Module already exists');
			module.name = normalizedName;
		}

		if (dto.description !== undefined)
			module.description = dto.description;

		return this.workModuleRepository.save(module);
	}

	async setModuleActive(
		id: string,
		active: boolean,
	): Promise<WorkModule> {
		const module = await this.workModuleRepository.findOne({
			where: { id },
		});
		if (!module) throw new NotFoundException('Module not found');
		module.active = active;
		return this.workModuleRepository.save(module);
	}

	async findModuleByName(name: string): Promise<WorkModule | null> {
		return this.workModuleRepository.findOne({
			where: { name: ILike(this.normalizeName(name)) },
			relations: ['components'],
		});
	}

	async createComponent(dto: ComponentCreateDto): Promise<Component> {
		const name = this.normalizeName(dto.name);
		const existing = await this.componentRepository.findOne({
			where: { name: ILike(name) },
		});
		if (existing) throw new BadRequestException('Component already exists');

		const entity = this.componentRepository.create({
			name,
			description: dto.description,
			active: true,
		});

		return this.componentRepository.save(entity);
	}

	async findComponentById(
		id: string,
		includeInactive = false,
	): Promise<Component> {
		const where = includeInactive ? { id } : { id, active: true };
		const component = await this.componentRepository.findOne({
			where,
			relations: ['workModules'],
		});
		if (!component) throw new NotFoundException('Component not found');
		return component;
	}

	async findAllComponents(includeInactive = false): Promise<Component[]> {
		const where = includeInactive ? {} : { active: true };
		return this.componentRepository.find({
			where,
			order: { createdAt: 'DESC' },
			relations: ['workModules'],
		});
	}

	async updateComponent(
		id: string,
		dto: ComponentUpdateDto,
	): Promise<Component> {
		const component = await this.componentRepository.findOne({ where: { id } });
		if (!component) throw new NotFoundException('Component not found');

		if (dto.name) {
			const normalizedName = this.normalizeName(dto.name);
			const existing = await this.componentRepository.findOne({
				where: { name: ILike(normalizedName) },
			});
			if (existing && existing.id !== id)
				throw new BadRequestException('Component already exists');
			component.name = normalizedName;
		}

		if (dto.description !== undefined) component.description = dto.description;

		return this.componentRepository.save(component);
	}

	async setComponentActive(id: string, active: boolean): Promise<Component> {
		const component = await this.componentRepository.findOne({ where: { id } });
		if (!component) throw new NotFoundException('Component not found');
		component.active = active;
		return this.componentRepository.save(component);
	}

	async findComponentByName(name: string): Promise<Component | null> {
		return this.componentRepository.findOne({
			where: { name: ILike(this.normalizeName(name)) },
			relations: ['workModules'],
		});
	}

	async addComponentToModule(
		moduleId: string,
		componentId: string,
	): Promise<WorkModule> {
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId },
			relations: ['components'],
		});
		if (!module) throw new NotFoundException('Module not found');

		const component = await this.componentRepository.findOne({
			where: { id: componentId },
		});
		if (!component) throw new NotFoundException('Component not found');

		const alreadyRelated = (module.components ?? []).some(
			(item) => item.id === component.id,
		);
		if (alreadyRelated)
			throw new BadRequestException(
				'Module and component relation already exists',
			);

		module.components = [...(module.components ?? []), component];
		return this.workModuleRepository.save(module);
	}

	async removeComponentFromModule(
		moduleId: string,
		componentId: string,
	): Promise<WorkModule> {
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId },
			relations: ['components'],
		});
		if (!module) throw new NotFoundException('Module not found');

		const hasRelation = (module.components ?? []).some(
			(item) => item.id === componentId,
		);
		if (!hasRelation)
			throw new NotFoundException(
				'Module and component relation not found',
			);

		module.components = (module.components ?? []).filter(
			(item) => item.id !== componentId,
		);
		return this.workModuleRepository.save(module);
	}

	async getComponentsByModule(
		moduleId: string,
		includeInactive = false,
	): Promise<Component[]> {
		const module = await this.workModuleRepository.findOne({
			where: { id: moduleId },
			relations: ['components'],
		});
		if (!module) throw new NotFoundException('Module not found');
		if (includeInactive) return module.components ?? [];
		return (module.components ?? []).filter((item) => item.active);
	}

	async getModulesByComponent(
		componentId: string,
		includeInactive = false,
	): Promise<WorkModule[]> {
		const component = await this.componentRepository.findOne({
			where: { id: componentId },
			relations: ['workModules'],
		});
		if (!component) throw new NotFoundException('Component not found');
		if (includeInactive) return component.workModules ?? [];
		return (component.workModules ?? []).filter((item) => item.active);
	}

	async findAllTags(includeInactive = false): Promise<Tag[]> {
		const where = includeInactive ? {} : { active: true };
		return this.tagRepository.find({
			where,
			order: { createdAt: 'DESC' },
		});
	}

	async createTag(dto: TagCreateDto): Promise<Tag> {
		const name = this.normalizeName(dto.name);
		const existing = await this.tagRepository.findOne({
			where: { name: ILike(name) },
		});
		if (existing) throw new BadRequestException('Tag already exists');

		const tag = this.tagRepository.create({
			name,
			active: true,
		});

		return this.tagRepository.save(tag);
	}

	async updateTag(id: string, dto: TagUpdateDto): Promise<Tag> {
		const tag = await this.tagRepository.findOne({ where: { id } });
		if (!tag) throw new NotFoundException('Tag not found');

		if (dto.name !== undefined) {
			const normalizedName = this.normalizeName(dto.name);
			const existing = await this.tagRepository.findOne({
				where: { name: ILike(normalizedName) },
			});
			if (existing && existing.id !== id) {
				throw new BadRequestException('Tag already exists');
			}
			tag.name = normalizedName;
		}

		return this.tagRepository.save(tag);
	}

	async setTagActive(id: string, active: boolean): Promise<Tag> {
		const tag = await this.tagRepository.findOne({ where: { id } });
		if (!tag) throw new NotFoundException('Tag not found');
		tag.active = active;
		return this.tagRepository.save(tag);
	}
}
