import { ForbiddenException, Injectable } from '@nestjs/common';
import { Membership } from '../../memberships/entities/membership.entity';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { MembershipsService } from '../../memberships/services/memberships.service';

@Injectable()
export class WorkspaceOrganizationAccessService {
	constructor(private readonly membershipsService: MembershipsService) {}

	async requireActiveMembership(
		userId: string,
		organizationId: string,
	): Promise<Membership> {
		return this.membershipsService.requireActiveMembership(userId, organizationId);
	}

	assertMembershipHasAnyRole(
		membership: Membership,
		allowedRoles: OrganizationRole[],
		message = 'You do not have permission for this action in this organization',
	): void {
		if (allowedRoles.includes(membership.role)) return;
		throw new ForbiddenException(message);
	}

	assertCanManageCatalog(membership: Membership): void {
		this.assertMembershipHasAnyRole(membership, [
			OrganizationRole.OWNER,
			OrganizationRole.ADMIN,
		]);
	}

	assertCanManageDiscussion(membership: Membership): void {
		this.assertMembershipHasAnyRole(membership, [
			OrganizationRole.OWNER,
			OrganizationRole.ADMIN,
			OrganizationRole.DEVELOPER,
		]);
	}

	assertCanReceiveAssignments(membership: Membership): void {
		this.assertMembershipHasAnyRole(
			membership,
			[
				OrganizationRole.OWNER,
				OrganizationRole.ADMIN,
				OrganizationRole.DEVELOPER,
			],
			'User cannot receive assignments in this organization',
		);
	}
}
