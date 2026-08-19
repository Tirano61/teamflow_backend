import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
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

	@Get(':organizationId/members')
	getOrganizationMembers(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@GetUser() user: User,
	) {
		return this.organizationsService.getOrganizationMembers(organizationId, user);
	}

	@Post(':organizationId/invitations')
	createInvitation(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@Body() dto: CreateOrganizationInvitationDto,
		@GetUser() user: User,
	) {
		return this.invitationsService.createInvitation(organizationId, dto, user);
	}
}
