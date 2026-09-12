import { IsIn } from 'class-validator';
import { OrganizationRole } from '../enums/organization-role.enum';

/// Roles asignables al cambiar el rol de un miembro existente.
/// OWNER queda fuera a proposito: la transferencia de ownership todavia no existe.
export const ASSIGNABLE_ORGANIZATION_ROLES = [
	OrganizationRole.ADMIN,
	OrganizationRole.DEVELOPER,
	OrganizationRole.MEMBER,
];

export class UpdateMembershipRoleDto {
	@IsIn(ASSIGNABLE_ORGANIZATION_ROLES, {
		message: `role must be one of the following values: ${ASSIGNABLE_ORGANIZATION_ROLES.join(', ')}`,
	})
	role: OrganizationRole;
}
