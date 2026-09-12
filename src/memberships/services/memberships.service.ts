import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationMemberResponse } from '../dto/organization-member.response';
import { Membership } from '../entities/membership.entity';
import { MembershipStatus } from '../enums/membership-status.enum';
import { OrganizationRole } from '../enums/organization-role.enum';

/**
 * Alcance de administracion de roles segun el rol del requester.
 * El mismo set define que memberships puede modificar y que roles puede asignar:
 * - OWNER: ADMIN | DEVELOPER | MEMBER
 * - ADMIN: DEVELOPER | MEMBER
 * OWNER nunca aparece como objetivo ni como valor asignable (membership protegido).
 */
const ROLE_SCOPE_BY_REQUESTER_ROLE: Partial<Record<OrganizationRole, OrganizationRole[]>> = {
	[OrganizationRole.OWNER]: [
		OrganizationRole.ADMIN,
		OrganizationRole.DEVELOPER,
		OrganizationRole.MEMBER,
	],
	[OrganizationRole.ADMIN]: [OrganizationRole.DEVELOPER, OrganizationRole.MEMBER],
};

@Injectable()
export class MembershipsService {
	constructor(
		@InjectRepository(Membership)
		private readonly membershipRepository: Repository<Membership>,
	) {}

	async findMembership(userId: string, organizationId: string): Promise<Membership | null> {
		return this.membershipRepository.findOne({
			where: {
				user: { id: userId },
				organization: { id: organizationId },
			},
			relations: ['user', 'organization'],
		});
	}

	async requireMembership(userId: string, organizationId: string): Promise<Membership> {
		const membership = await this.findMembership(userId, organizationId);
		if (!membership) {
			throw new ForbiddenException('User does not belong to this organization');
		}
		return membership;
	}

	async requireActiveMembership(userId: string, organizationId: string): Promise<Membership> {
		const membership = await this.requireMembership(userId, organizationId);
		if (membership.status !== MembershipStatus.ACTIVE) {
			throw new ForbiddenException('Membership is not active');
		}
		return membership;
	}

	private assertActiveOwnerOrAdmin(membership: Membership, forbiddenMessage: string): void {
		if (membership.status !== MembershipStatus.ACTIVE) {
			throw new ForbiddenException('Membership is not active');
		}

		const allowedRoles = [OrganizationRole.OWNER, OrganizationRole.ADMIN];
		if (!allowedRoles.includes(membership.role)) {
			throw new ForbiddenException(forbiddenMessage);
		}
	}

	assertCanInvite(membership: Membership): void {
		this.assertActiveOwnerOrAdmin(membership, 'Only OWNER or ADMIN can create invitations');
	}

	/**
	 * Permiso para operaciones administrativas sobre invitaciones ya creadas
	 * (listar y cancelar). Mismo criterio que `assertCanInvite`: OWNER o ADMIN ACTIVE.
	 */
	assertCanManageInvitations(membership: Membership): void {
		this.assertActiveOwnerOrAdmin(membership, 'Only OWNER or ADMIN can manage invitations');
	}

	/**
	 * Permiso de entrada para administrar roles de miembros: OWNER o ADMIN ACTIVE.
	 * Las diferencias entre OWNER y ADMIN se resuelven despues, segun el membership
	 * objetivo y el rol solicitado.
	 */
	assertCanManageMemberRoles(membership: Membership): void {
		this.assertActiveOwnerOrAdmin(membership, 'Only OWNER or ADMIN can change member roles');
	}

	async listActiveOrganizationMemberships(userId: string): Promise<Membership[]> {
		return this.membershipRepository.find({
			where: {
				user: { id: userId },
				status: MembershipStatus.ACTIVE,
			},
			relations: ['organization', 'organization.createdBy'],
			order: { createdAt: 'DESC' },
		});
	}

	async listActiveOrganizationMembers(organizationId: string): Promise<Membership[]> {
		return this.membershipRepository.find({
			where: {
				organization: { id: organizationId },
				status: MembershipStatus.ACTIVE,
			},
			relations: ['user'],
			order: { createdAt: 'ASC' },
		});
	}

	async ensureUserNotInOrganization(userId: string, organizationId: string): Promise<void> {
		const existing = await this.findMembership(userId, organizationId);
		if (existing) {
			throw new BadRequestException('User already belongs to this organization');
		}
	}

	/**
	 * Vista segura de un Membership: nunca devuelve la entidad `user` completa.
	 */
	toOrganizationMemberResponse(membership: Membership): OrganizationMemberResponse {
		return {
			id: membership.id,
			role: membership.role,
			status: membership.status,
			joinedAt: membership.joinedAt,
			user: {
				id: membership.user.id,
				email: membership.user.email,
				fullName: membership.user.fullName,
			},
		};
	}

	/**
	 * Diferencias OWNER vs ADMIN: el requester solo puede tocar memberships cuyo rol actual
	 * este dentro de su alcance, y solo puede asignar roles dentro de ese mismo alcance.
	 */
	private assertCanAssignRole(
		requesterMembership: Membership,
		targetMembership: Membership,
		newRole: OrganizationRole,
	): void {
		const allowedRoles = ROLE_SCOPE_BY_REQUESTER_ROLE[requesterMembership.role] ?? [];

		if (!allowedRoles.includes(targetMembership.role)) {
			throw new ForbiddenException(
				`${requesterMembership.role} cannot modify a membership with role ${targetMembership.role}`,
			);
		}

		if (!allowedRoles.includes(newRole)) {
			throw new ForbiddenException(
				`${requesterMembership.role} cannot assign the ${newRole} role`,
			);
		}
	}

	/**
	 * Cambia el rol de un miembro existente de la organization.
	 * Tenant-safe: el Membership objetivo se busca siempre por `membershipId` + `organizationId`.
	 * El requester ya llega validado como OWNER/ADMIN ACTIVE de esa misma organization.
	 */
	async changeMembershipRole(
		organizationId: string,
		membershipId: string,
		requesterMembership: Membership,
		newRole: OrganizationRole,
	): Promise<OrganizationMemberResponse> {
		/// Defensa en profundidad: el DTO ya rechaza OWNER, pero la regla tambien vive aca.
		if (newRole === OrganizationRole.OWNER) {
			throw new BadRequestException('OWNER role cannot be assigned from this endpoint');
		}

		/// Nunca se busca solo por `membershipId`: la organization del path es parte del filtro (anti-IDOR).
		const targetMembership = await this.membershipRepository.findOne({
			where: {
				id: membershipId,
				organization: { id: organizationId },
			},
			relations: ['user'],
		});

		if (!targetMembership) {
			throw new NotFoundException('Membership not found in this organization');
		}

		if (targetMembership.status !== MembershipStatus.ACTIVE) {
			throw new ConflictException(
				`Membership role cannot be changed because its status is ${targetMembership.status}`,
			);
		}

		/// OWNER protegido: no se degrada ni se reasigna desde aca, ni siquiera por el propio OWNER.
		/// La transferencia de ownership es una fase aparte.
		if (targetMembership.role === OrganizationRole.OWNER) {
			throw new ForbiddenException('OWNER membership cannot be modified from this endpoint');
		}

		this.assertCanAssignRole(requesterMembership, targetMembership, newRole);

		/// Idempotente: pedir el rol que el miembro ya tiene responde 200 y no escribe.
		if (targetMembership.role === newRole) {
			return this.toOrganizationMemberResponse(targetMembership);
		}

		/// Update condicional por rol y status previos: evita pisar un cambio concurrente.
		const updateResult = await this.membershipRepository.update(
			{
				id: targetMembership.id,
				role: targetMembership.role,
				status: MembershipStatus.ACTIVE,
			},
			{ role: newRole },
		);

		if (updateResult.affected === 0) {
			throw new ConflictException('Membership was modified concurrently, retry the operation');
		}

		targetMembership.role = newRole;
		return this.toOrganizationMemberResponse(targetMembership);
	}
}
