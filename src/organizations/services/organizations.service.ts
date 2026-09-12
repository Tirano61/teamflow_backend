import {
	Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { OrganizationMemberResponse } from '../../memberships/dto/organization-member.response';
import { UpdateMembershipRoleDto } from '../../memberships/dto/update-membership-role.dto';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/enums/membership-status.enum';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { MembershipsService } from '../../memberships/services/memberships.service';
import { UserContextOrganizationResponse } from '../../me/dto/user-context.response';
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

	mapMembershipsToOrganizationSummaries(
		memberships: Membership[],
	): UserContextOrganizationResponse[] {
		return memberships.map((membership) => ({
			id: membership.organization.id,
			name: membership.organization.name,
			slug: membership.organization.slug,
			role: membership.role,
			joinedAt: membership.joinedAt,
		}));
	}

	async getOrganizationBasicForUser(organizationId: string, user: User) {
		const membership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);

		return {
			id: membership.organization.id,
			name: membership.organization.name,
			slug: membership.organization.slug,
			role: membership.role,
		};
	}

	/**
	 * Directorio general de miembros: quienes forman parte actualmente de la organization.
	 * Puede consultarlo cualquier Membership ACTIVE (OWNER, ADMIN, DEVELOPER o MEMBER) y todos
	 * reciben exactamente lo mismo: memberships ACTIVE de cualquier role.
	 * No es una pantalla administrativa: los memberships SUSPENDED no aparecen aca, viven en
	 * `getOrganizationMembersForManagement`.
	 */
	async getOrganizationMembers(
		organizationId: string,
		user: User,
	): Promise<OrganizationMemberResponse[]> {
		await this.membershipsService.requireActiveMembership(user.id, organizationId);

		return this.membershipsService.listOrganizationDirectoryMembers(organizationId);
	}

	/**
	 * Listado administrativo de memberships: solo OWNER/ADMIN ACTIVE.
	 * Devuelve memberships ACTIVE y SUSPENDED, sin filtrar por role, porque es el listado desde
	 * el que se administra: cambiar roles, suspender y reactivar.
	 * Orden de validacion identico al de las acciones administrativas: Membership ACTIVE del
	 * requester -> permiso OWNER/ADMIN -> query scoped por organizationId.
	 */
	async getOrganizationMembersForManagement(
		organizationId: string,
		user: User,
	): Promise<OrganizationMemberResponse[]> {
		const requesterMembership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.membershipsService.assertCanManageMembers(requesterMembership);

		return this.membershipsService.listOrganizationMembersForManagement(organizationId);
	}

	/**
	 * Cambia el rol de un miembro existente de la organization.
	 * Orden de validacion: Membership ACTIVE del requester -> permiso OWNER/ADMIN ->
	 * reglas por rol objetivo y rol solicitado (resueltas en MembershipsService).
	 */
	async updateMemberRole(
		organizationId: string,
		membershipId: string,
		dto: UpdateMembershipRoleDto,
		user: User,
	): Promise<OrganizationMemberResponse> {
		const requesterMembership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.membershipsService.assertCanManageMemberRoles(requesterMembership);

		return this.membershipsService.changeMembershipRole(
			organizationId,
			membershipId,
			requesterMembership,
			dto.role,
		);
	}

	/**
	 * Suspende un miembro de la organization (ACTIVE -> SUSPENDED).
	 * Orden de validacion: Membership ACTIVE del requester -> permiso OWNER/ADMIN ->
	 * reglas sobre el membership objetivo y transicion de estado (en MembershipsService).
	 */
	async suspendMember(
		organizationId: string,
		membershipId: string,
		user: User,
	): Promise<OrganizationMemberResponse> {
		return this.changeMemberStatus(
			organizationId,
			membershipId,
			user,
			MembershipStatus.SUSPENDED,
		);
	}

	/**
	 * Reactiva un miembro suspendido de la organization (SUSPENDED -> ACTIVE).
	 * Conserva el role que el Membership tenia antes de la suspension.
	 */
	async reactivateMember(
		organizationId: string,
		membershipId: string,
		user: User,
	): Promise<OrganizationMemberResponse> {
		return this.changeMemberStatus(
			organizationId,
			membershipId,
			user,
			MembershipStatus.ACTIVE,
		);
	}

	private async changeMemberStatus(
		organizationId: string,
		membershipId: string,
		user: User,
		newStatus: MembershipStatus,
	): Promise<OrganizationMemberResponse> {
		const requesterMembership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.membershipsService.assertCanManageMemberStatus(requesterMembership);

		return this.membershipsService.changeMembershipStatus(
			organizationId,
			membershipId,
			requesterMembership,
			newStatus,
		);
	}
}
