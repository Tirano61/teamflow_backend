import { BadRequestException, Controller, Get, Param, Post } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { OrganizationInvitationsService } from './services/organization-invitations.service';

@Auth()
@Controller('organization-invitations')
export class OrganizationInvitationsController {
	constructor(
		private readonly organizationInvitationsService: OrganizationInvitationsService,
	) {}

	@Get('me')
	getMyPendingInvitations(@GetUser() user: User) {
		return this.organizationInvitationsService.listPendingInvitationsForUser(user.email);
	}

	@Post(':token/accept')
	acceptInvitation(@Param('token') token: string, @GetUser() user: User) {
		if (!token?.trim()) {
			throw new BadRequestException('Invitation token is required');
		}
		return this.organizationInvitationsService.acceptInvitation(token, user);
	}
}
