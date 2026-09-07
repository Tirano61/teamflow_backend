import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { InvitationStatus } from '../enums/invitation-status.enum';

export interface InvitedUserResponse {
	id: string;
	email: string;
	fullName: string;
}

export interface OrganizationInvitationResponse {
	id: string;
	organizationId: string;
	invitedUser: InvitedUserResponse;
	/// Compatibilidad: email del usuario invitado al momento de crear la invitacion.
	email: string;
	role: OrganizationRole;
	status: InvitationStatus;
	token: string;
	expiresAt: Date;
	acceptedAt: Date | null;
	createdAt: Date;
}
