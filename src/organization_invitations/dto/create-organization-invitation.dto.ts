import { IsIn, IsUUID } from 'class-validator';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';

export const INVITABLE_ORGANIZATION_ROLES = [
	OrganizationRole.ADMIN,
	OrganizationRole.DEVELOPER,
	OrganizationRole.MEMBER,
];

export class CreateOrganizationInvitationDto {
	/// Usuario registrado de TeamFlow al que se invita (flujo interno).
	@IsUUID()
	userId: string;

	@IsIn(INVITABLE_ORGANIZATION_ROLES, {
		message: `role must be one of the following values: ${INVITABLE_ORGANIZATION_ROLES.join(', ')}`,
	})
	role: OrganizationRole;
}
