import { Injectable } from '@nestjs/common';
import { User } from '../auth/entities/user.entity';
import { MembershipsService } from '../memberships/services/memberships.service';
import { OrganizationInvitationsService } from '../organization_invitations/services/organization-invitations.service';
import { OrganizationsService } from '../organizations/services/organizations.service';
import { UserContextResponse } from './dto/user-context.response';

@Injectable()
export class UserContextService {
	constructor(
		private readonly membershipsService: MembershipsService,
		private readonly organizationsService: OrganizationsService,
		private readonly organizationInvitationsService: OrganizationInvitationsService,
	) {}

	async getContext(user: User): Promise<UserContextResponse> {
		const [memberships, pendingInvitations] = await Promise.all([
			this.membershipsService.listActiveOrganizationMemberships(user.id),
			this.organizationInvitationsService.listPendingInvitationsForUser(user.email),
		]);

		const organizations = this.organizationsService.mapMembershipsToOrganizationSummaries(memberships);

		return {
			user: {
				id: user.id,
				email: user.email,
				fullName: user.fullName,
			},
			organizations,
			pendingInvitations,
			organizationCount: organizations.length,
		};
	}
}
