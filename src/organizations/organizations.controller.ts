import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { UpdateMembershipRoleDto } from '../memberships/dto/update-membership-role.dto';
import { OrganizationInvitationsService } from '../organization_invitations/services/organization-invitations.service';
import { CreateOrganizationInvitationDto } from '../organization_invitations/dto/create-organization-invitation.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationsService } from './services/organizations.service';

@Auth()
@Controller('organizations')
export class OrganizationsController {
	constructor(
		private readonly organizationsService: OrganizationsService,
		private readonly invitationsService: OrganizationInvitationsService,
	) {}

	@Post()
	createOrganization(@Body() dto: CreateOrganizationDto, @GetUser() user: User) {
		return this.organizationsService.createOrganization(dto, user);
	}

	@Get('me')
	getMyOrganizations(@GetUser() user: User) {
		return this.organizationsService.getMyOrganizations(user);
	}

	@Get(':organizationId')
	getOrganizationForCurrentUser(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@GetUser() user: User,
	) {
		return this.organizationsService.getOrganizationBasicForUser(organizationId, user);
	}

	@Get(':organizationId/members')
	getOrganizationMembers(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@GetUser() user: User,
	) {
		return this.organizationsService.getOrganizationMembers(organizationId, user);
	}

	@Patch(':organizationId/members/:membershipId/role')
	updateMemberRole(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@Param('membershipId', new ParseUUIDPipe()) membershipId: string,
		@Body() dto: UpdateMembershipRoleDto,
		@GetUser() user: User,
	) {
		return this.organizationsService.updateMemberRole(organizationId, membershipId, dto, user);
	}

	@Post(':organizationId/invitations')
	createInvitation(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@Body() dto: CreateOrganizationInvitationDto,
		@GetUser() user: User,
	) {
		return this.invitationsService.createInvitation(organizationId, dto, user);
	}

	@Get(':organizationId/invitations')
	listInvitations(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@GetUser() user: User,
	) {
		return this.invitationsService.listInvitationsForOrganization(organizationId, user);
	}

	@Post(':organizationId/invitations/:invitationId/cancel')
	cancelInvitation(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@Param('invitationId', new ParseUUIDPipe()) invitationId: string,
		@GetUser() user: User,
	) {
		return this.invitationsService.cancelInvitation(organizationId, invitationId, user);
	}
}
