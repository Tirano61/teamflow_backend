import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { InvitationStatus } from '../enums/invitation-status.enum';

export interface InvitedUserResponse {
	id: string;
	email: string;
	fullName: string;
}

/**
 * Vista administrativa de una invitacion (OWNER/ADMIN de la organization).
 * No expone `token`: solo el usuario invitado lo necesita para aceptar.
 */
export interface OrganizationInvitationSummaryResponse {
	invitationId: string;
	/// null solo en invitaciones legacy creadas unicamente con email.
	invitedUser: InvitedUserResponse | null;
	/// Email registrado en la invitacion; util para las invitaciones legacy sin `invitedUser`.
	email: string;
	role: OrganizationRole;
	status: InvitationStatus;
	expiresAt: Date;
	acceptedAt: Date | null;
	createdAt: Date;
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
