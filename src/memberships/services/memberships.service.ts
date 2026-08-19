import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Membership } from '../entities/membership.entity';
import { MembershipStatus } from '../enums/membership-status.enum';
import { OrganizationRole } from '../enums/organization-role.enum';

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

	assertCanInvite(membership: Membership): void {
		if (membership.status !== MembershipStatus.ACTIVE) {
			throw new ForbiddenException('Membership is not active');
		}

		const allowedRoles = [OrganizationRole.OWNER, OrganizationRole.ADMIN];
		if (!allowedRoles.includes(membership.role)) {
			throw new ForbiddenException('Only OWNER or ADMIN can create invitations');
		}
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
}
