import { MembershipStatus } from '../enums/membership-status.enum';
import { OrganizationRole } from '../enums/organization-role.enum';

export interface OrganizationMemberUserResponse {
	id: string;
	email: string;
	fullName: string;
}

/**
 * Vista explicita de un Membership de organization.
 * No expone la entidad completa ni datos sensibles del usuario
 * (password, roles globales de plataforma, devices).
 */
export interface OrganizationMemberResponse {
	id: string;
	role: OrganizationRole;
	status: MembershipStatus;
	joinedAt: Date;
	user: OrganizationMemberUserResponse;
}
