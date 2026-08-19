import {
	Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/enums/membership-status.enum';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { MembershipsService } from '../../memberships/services/memberships.service';
import { CreateOrganizationDto } from '../dto/create-organization.dto';
import { Organization } from '../entities/organization.entity';

@Injectable()
export class OrganizationsService {
	constructor(
		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>,
		private readonly membershipsService: MembershipsService,
		private readonly dataSource: DataSource,
	) {}

	private toSlug(name: string): string {
		return name
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 140);
	}

	private async generateUniqueSlug(baseName: string): Promise<string> {
		const baseSlug = this.toSlug(baseName) || 'organization';
		let slug = baseSlug;
		let suffix = 2;

		while (await this.organizationRepository.exist({ where: { slug } })) {
			slug = `${baseSlug}-${suffix}`;
			suffix += 1;
		}

		return slug;
	}

	async createOrganization(dto: CreateOrganizationDto, user: User): Promise<Organization> {
		const name = dto.name.trim();
		const slug = await this.generateUniqueSlug(name);

		return this.dataSource.transaction(async (manager) => {
			const organization = manager.getRepository(Organization).create({
				name,
				slug,
				createdBy: { id: user.id } as User,
			});

			const savedOrganization = await manager.getRepository(Organization).save(organization);

			const membership = manager.getRepository(Membership).create({
				user: { id: user.id } as User,
				organization: { id: savedOrganization.id } as Organization,
				role: OrganizationRole.OWNER,
				status: MembershipStatus.ACTIVE,
				joinedAt: new Date(),
			});

			await manager.getRepository(Membership).save(membership);

			return savedOrganization;
		});
	}

	async getMyOrganizations(user: User): Promise<Organization[]> {
		const memberships = await this.membershipsService.listActiveOrganizationMemberships(user.id);
		return memberships.map((membership) => membership.organization);
	}

	async getOrganizationMembers(organizationId: string, user: User): Promise<Membership[]> {
		await this.membershipsService.requireActiveMembership(user.id, organizationId);
		return this.membershipsService.listActiveOrganizationMembers(organizationId);
	}
}
