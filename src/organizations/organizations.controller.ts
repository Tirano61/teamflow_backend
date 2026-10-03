import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
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
import { OrganizationDeletionService } from './services/organization-deletion.service';
import { OrganizationsService } from './services/organizations.service';

@Auth()
@Controller('organizations')
export class OrganizationsController {
	constructor(
		private readonly organizationsService: OrganizationsService,
		private readonly organizationDeletionService: OrganizationDeletionService,
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

	/// Eliminacion definitiva e irreversible. Solo OWNER ACTIVE con una SecurityVerification
	/// `DELETE_ORGANIZATION` ya verificada, que se busca por usuario del JWT + organization del
	/// path: no recibe body, userId, verificationId ni codigo. 204 sin contenido.
	@Delete(':organizationId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteOrganization(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@GetUser() user: User,
	): Promise<void> {
		return this.organizationDeletionService.deleteOrganization(organizationId, user);
	}

	/// Directorio general: cualquier Membership ACTIVE, solo memberships ACTIVE.
	@Get(':organizationId/members')
	getOrganizationMembers(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@GetUser() user: User,
	) {
		return this.organizationsService.getOrganizationMembers(organizationId, user);
	}

	/// Listado administrativo: solo OWNER/ADMIN ACTIVE, memberships ACTIVE + SUSPENDED.
	/// `manage` es un segmento fijo y no colisiona con las rutas `members/:membershipId/...`,
	/// que tienen un segmento mas y otro metodo HTTP.
	@Get(':organizationId/members/manage')
	getOrganizationMembersForManagement(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@GetUser() user: User,
	) {
		return this.organizationsService.getOrganizationMembersForManagement(organizationId, user);
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

	@Post(':organizationId/members/:membershipId/suspend')
	suspendMember(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@Param('membershipId', new ParseUUIDPipe()) membershipId: string,
		@GetUser() user: User,
	) {
		return this.organizationsService.suspendMember(organizationId, membershipId, user);
	}

	@Post(':organizationId/members/:membershipId/reactivate')
	reactivateMember(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@Param('membershipId', new ParseUUIDPipe()) membershipId: string,
		@GetUser() user: User,
	) {
		return this.organizationsService.reactivateMember(organizationId, membershipId, user);
	}

	/// Abandono voluntario (ACTIVE -> LEFT): actua siempre sobre la Membership del usuario
	/// autenticado. No recibe body ni membershipId/userId: la organization sale del path y el
	/// usuario del JWT. El OWNER no puede abandonar (409) mientras no exista transferencia de ownership.
	@Post(':organizationId/leave')
	leaveOrganization(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@GetUser() user: User,
	) {
		return this.organizationsService.leaveOrganization(organizationId, user);
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
