import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ApplicationCreateDto } from '../dto/create-application.dto';
import { IndicatorCreateDto } from '../dto/create-indicator.dto';
import { TagCreateDto } from '../dto/create-tag.dto';
import { ApplicationUpdateDto } from '../dto/update-application.dto';
import { IndicatorUpdateDto } from '../dto/update-indicator.dto';
import { TagUpdateDto } from '../dto/update-tag.dto';
import { Application } from '../entities/application.entity';
import { Indicator } from '../entities/indicator.entity';
import { Tag } from '../entities/tag.entity';

@Injectable()
export class WorkspaceCatalogService {
	constructor(
		@InjectRepository(Application)
		private readonly applicationRepository: Repository<Application>,
		@InjectRepository(Indicator)
		private readonly indicatorRepository: Repository<Indicator>,
		@InjectRepository(Tag)
		private readonly tagRepository: Repository<Tag>,
	) { }

	private normalizeName(name: string): string {
		const normalized = name.trim();
		if (!normalized) throw new BadRequestException('Name cannot be empty');
		return normalized;
	}

	async createApplication(dto: ApplicationCreateDto): Promise<Application> {
		const name = this.normalizeName(dto.name);
		const existing = await this.applicationRepository.findOne({
			where: { name: ILike(name) },
		});
		if (existing) throw new BadRequestException('Application already exists');

		const entity = this.applicationRepository.create({
			name,
			description: dto.description,
			active: true,
		});

		return this.applicationRepository.save(entity);
	}

	async findApplicationById(
		id: string,
		includeInactive = false,
	): Promise<Application> {
		const where = includeInactive ? { id } : { id, active: true };
		const application = await this.applicationRepository.findOne({
			where,
			relations: ['indicators'],
		});
		if (!application) throw new NotFoundException('Application not found');
		return application;
	}

	async findAllApplications(includeInactive = false): Promise<Application[]> {
		const where = includeInactive ? {} : { active: true };
		return this.applicationRepository.find({
			where,
			order: { createdAt: 'DESC' },
			relations: ['indicators'],
		});
	}

	async updateApplication(
		id: string,
		dto: ApplicationUpdateDto,
	): Promise<Application> {
		const application = await this.applicationRepository.findOne({
			where: { id },
		});
		if (!application) throw new NotFoundException('Application not found');

		if (dto.name) {
			const normalizedName = this.normalizeName(dto.name);
			const existing = await this.applicationRepository.findOne({
				where: { name: ILike(normalizedName) },
			});
			if (existing && existing.id !== id)
				throw new BadRequestException('Application already exists');
			application.name = normalizedName;
		}

		if (dto.description !== undefined)
			application.description = dto.description;

		return this.applicationRepository.save(application);
	}

	async setApplicationActive(
		id: string,
		active: boolean,
	): Promise<Application> {
		const application = await this.applicationRepository.findOne({
			where: { id },
		});
		if (!application) throw new NotFoundException('Application not found');
		application.active = active;
		return this.applicationRepository.save(application);
	}

	async findApplicationByName(name: string): Promise<Application | null> {
		return this.applicationRepository.findOne({
			where: { name: ILike(this.normalizeName(name)) },
			relations: ['indicators'],
		});
	}

	async createIndicator(dto: IndicatorCreateDto): Promise<Indicator> {
		const name = this.normalizeName(dto.name);
		const existing = await this.indicatorRepository.findOne({
			where: { name: ILike(name) },
		});
		if (existing) throw new BadRequestException('Indicator already exists');

		const entity = this.indicatorRepository.create({
			name,
			description: dto.description,
			active: true,
		});

		return this.indicatorRepository.save(entity);
	}

	async findIndicatorById(
		id: string,
		includeInactive = false,
	): Promise<Indicator> {
		const where = includeInactive ? { id } : { id, active: true };
		const indicator = await this.indicatorRepository.findOne({
			where,
			relations: ['applications'],
		});
		if (!indicator) throw new NotFoundException('Indicator not found');
		return indicator;
	}

	async findAllIndicators(includeInactive = false): Promise<Indicator[]> {
		const where = includeInactive ? {} : { active: true };
		return this.indicatorRepository.find({
			where,
			order: { createdAt: 'DESC' },
			relations: ['applications'],
		});
	}

	async updateIndicator(
		id: string,
		dto: IndicatorUpdateDto,
	): Promise<Indicator> {
		const indicator = await this.indicatorRepository.findOne({ where: { id } });
		if (!indicator) throw new NotFoundException('Indicator not found');

		if (dto.name) {
			const normalizedName = this.normalizeName(dto.name);
			const existing = await this.indicatorRepository.findOne({
				where: { name: ILike(normalizedName) },
			});
			if (existing && existing.id !== id)
				throw new BadRequestException('Indicator already exists');
			indicator.name = normalizedName;
		}

		if (dto.description !== undefined) indicator.description = dto.description;

		return this.indicatorRepository.save(indicator);
	}

	async setIndicatorActive(id: string, active: boolean): Promise<Indicator> {
		const indicator = await this.indicatorRepository.findOne({ where: { id } });
		if (!indicator) throw new NotFoundException('Indicator not found');
		indicator.active = active;
		return this.indicatorRepository.save(indicator);
	}

	async findIndicatorByName(name: string): Promise<Indicator | null> {
		return this.indicatorRepository.findOne({
			where: { name: ILike(this.normalizeName(name)) },
			relations: ['applications'],
		});
	}

	async addIndicatorToApplication(
		applicationId: string,
		indicatorId: string,
	): Promise<Application> {
		const application = await this.applicationRepository.findOne({
			where: { id: applicationId },
			relations: ['indicators'],
		});
		if (!application) throw new NotFoundException('Application not found');

		const indicator = await this.indicatorRepository.findOne({
			where: { id: indicatorId },
		});
		if (!indicator) throw new NotFoundException('Indicator not found');

		const alreadyRelated = (application.indicators ?? []).some(
			(item) => item.id === indicator.id,
		);
		if (alreadyRelated)
			throw new BadRequestException(
				'Application and indicator relation already exists',
			);

		application.indicators = [...(application.indicators ?? []), indicator];
		return this.applicationRepository.save(application);
	}

	async removeIndicatorFromApplication(
		applicationId: string,
		indicatorId: string,
	): Promise<Application> {
		const application = await this.applicationRepository.findOne({
			where: { id: applicationId },
			relations: ['indicators'],
		});
		if (!application) throw new NotFoundException('Application not found');

		const hasRelation = (application.indicators ?? []).some(
			(item) => item.id === indicatorId,
		);
		if (!hasRelation)
			throw new NotFoundException(
				'Application and indicator relation not found',
			);

		application.indicators = (application.indicators ?? []).filter(
			(item) => item.id !== indicatorId,
		);
		return this.applicationRepository.save(application);
	}

	async getIndicatorsByApplication(
		applicationId: string,
		includeInactive = false,
	): Promise<Indicator[]> {
		const application = await this.applicationRepository.findOne({
			where: { id: applicationId },
			relations: ['indicators'],
		});
		if (!application) throw new NotFoundException('Application not found');
		if (includeInactive) return application.indicators ?? [];
		return (application.indicators ?? []).filter((item) => item.active);
	}

	async getApplicationsByIndicator(
		indicatorId: string,
		includeInactive = false,
	): Promise<Application[]> {
		const indicator = await this.indicatorRepository.findOne({
			where: { id: indicatorId },
			relations: ['applications'],
		});
		if (!indicator) throw new NotFoundException('Indicator not found');
		if (includeInactive) return indicator.applications ?? [];
		return (indicator.applications ?? []).filter((item) => item.active);
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
